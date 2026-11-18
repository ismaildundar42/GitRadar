using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using GitRadar.API.Configuration;
using GitRadar.API.DTOs.Auth;
using GitRadar.API.DTOs.Common;
using GitRadar.Application.Contracts.Activities;
using GitRadar.Persistence.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

namespace GitRadar.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public sealed class AuthController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly SignInManager<ApplicationUser> _signInManager;
    private readonly IConfiguration _configuration;
    private readonly AzureAdOptions _azureAdOptions;
    private readonly IUserActivityService _activityService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        UserManager<ApplicationUser> userManager,
        SignInManager<ApplicationUser> signInManager,
        IConfiguration configuration,
        IOptions<AzureAdOptions> azureAdOptions,
        IUserActivityService activityService,
        IHttpClientFactory httpClientFactory,
        ILogger<AuthController> logger)
    {
        _userManager = userManager ?? throw new ArgumentNullException(nameof(userManager));
        _signInManager = signInManager ?? throw new ArgumentNullException(nameof(signInManager));
        _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        _azureAdOptions = azureAdOptions?.Value ?? new AzureAdOptions();
        _activityService = activityService ?? throw new ArgumentNullException(nameof(activityService));
        _httpClientFactory = httpClientFactory ?? throw new ArgumentNullException(nameof(httpClientFactory));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Frontend istemcisinin Microsoft Entra ID SSO akışını başlatabilmesi için gerekli genel yapılandırmayı döner.
    /// Gizli anahtarlar (ClientSecret) ASLA döndürülmez.
    /// </summary>
    [HttpGet("entra-config")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(EntraConfigDto), StatusCodes.Status200OK)]
    public IActionResult GetEntraConfig()
    {
        return Ok(new EntraConfigDto(
            Instance: _azureAdOptions.Instance,
            TenantId: _azureAdOptions.TenantId,
            ClientId: _azureAdOptions.ClientId,
            CallbackPath: _azureAdOptions.CallbackPath,
            IsConfigured: _azureAdOptions.IsConfigured
        ));
    }

    /// <summary>
    /// Microsoft Entra ID (Azure AD) Single Sign-On (SSO) giriş doğrulaması.
    /// Gelen kurumsal kullanıcı e-postası dbo.AspNetUsers tablosundaki ön yetkilendirilmiş (Pre-Authorized)
    /// ve aktif (IsActive = true) kullanıcılarla eşleştirilir. Eşleşme yoksa 403 Forbidden döner.
    /// </summary>
    [HttpPost("entra-login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponseDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponseDto), StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> EntraLogin(
        [FromBody] EntraLoginRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request is null || (string.IsNullOrWhiteSpace(request.Code) && string.IsNullOrWhiteSpace(request.IdToken)))
        {
            return BadRequest(new ErrorResponseDto("Yetkilendirme kodu (code) veya kimlik belirteci (idToken) gereklidir."));
        }

        if (!_azureAdOptions.IsConfigured)
        {
            return BadRequest(new ErrorResponseDto("Microsoft Entra ID entegrasyonu henüz yapılandırılmamıştır. Lütfen appsettings.json dosyasındaki AzureAd ayarlarını kontrol edin."));
        }

        string? idToken = request.IdToken;

        // 1. Eğer Authorization Code gönderilmişse Microsoft Token Endpoint üzerinden ID Token takas et
        if (!string.IsNullOrWhiteSpace(request.Code))
        {
            try
            {
                var tokenClient = _httpClientFactory.CreateClient("EntraTokenClient");
                var tokenEndpoint = $"{_azureAdOptions.Instance.TrimEnd('/')}/{_azureAdOptions.TenantId}/oauth2/v2.0/token";

                var formParams = new Dictionary<string, string>
                {
                    { "client_id", _azureAdOptions.ClientId },
                    { "scope", "openid profile email" },
                    { "code", request.Code.Trim() },
                    { "redirect_uri", request.RedirectUri ?? "http://localhost:5173" },
                    { "grant_type", "authorization_code" }
                };

                if (!string.IsNullOrWhiteSpace(_azureAdOptions.ClientSecret) && !_azureAdOptions.ClientSecret.StartsWith("BURAYA_"))
                {
                    formParams["client_secret"] = _azureAdOptions.ClientSecret;
                }

                using var tokenRequest = new HttpRequestMessage(HttpMethod.Post, tokenEndpoint)
                {
                    Content = new FormUrlEncodedContent(formParams)
                };

                using var tokenResponse = await tokenClient.SendAsync(tokenRequest, cancellationToken);
                var tokenContent = await tokenResponse.Content.ReadAsStringAsync(cancellationToken);

                if (!tokenResponse.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Microsoft Entra token takası başarısız oldu (HTTP {Status}): {Error}", tokenResponse.StatusCode, tokenContent);
                    return BadRequest(new ErrorResponseDto("Microsoft kimlik doğrulaması başarısız oldu veya yetkilendirme kodu geçersiz. Detay: " + tokenContent));
                }

                using var doc = JsonDocument.Parse(tokenContent);
                if (doc.RootElement.TryGetProperty("id_token", out var idTokenProp))
                {
                    idToken = idTokenProp.GetString();
                }
                else
                {
                    return BadRequest(new ErrorResponseDto("Microsoft yanıtından ID Token ayrıştırılamadı."));
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Microsoft Entra ID token takası sırasında beklenmeyen hata oluştu.");
                return BadRequest(new ErrorResponseDto("Microsoft Entra ID ile bağlantı kurulamadı: " + ex.Message));
            }
        }

        if (string.IsNullOrWhiteSpace(idToken))
        {
            return BadRequest(new ErrorResponseDto("Geçerli bir Microsoft ID Token elde edilemedi."));
        }

        // 2. ID Token içerisindeki kurumsal e-posta ve isim bilgilerini ayrıştır ve doğrula
        string? email = null;
        string? fullName = null;

        try
        {
            var handler = new JwtSecurityTokenHandler();
            if (!handler.CanReadToken(idToken))
            {
                return BadRequest(new ErrorResponseDto("Geçersiz JWT belirteç formatı."));
            }

            var jwtToken = handler.ReadJwtToken(idToken);

            email = jwtToken.Claims.FirstOrDefault(c =>
                c.Type == "preferred_username" ||
                c.Type == "email" ||
                c.Type == ClaimTypes.Email ||
                c.Type == "upn")?.Value;

            fullName = jwtToken.Claims.FirstOrDefault(c =>
                c.Type == "name" ||
                c.Type == ClaimTypes.Name)?.Value;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Microsoft ID Token ayrıştırılırken hata oluştu.");
            return BadRequest(new ErrorResponseDto("Microsoft kimlik belirteci doğrulanamadı: " + ex.Message));
        }

        if (string.IsNullOrWhiteSpace(email))
        {
            return BadRequest(new ErrorResponseDto("Microsoft Entra ID profilinde geçerli bir kurumsal e-posta adresi (preferred_username/email) bulunamadı."));
        }

        var normalizedEmail = email.Trim().ToLowerInvariant();
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";

        // 3. Pre-Authorized Beyaz Liste Denetimi (dbo.AspNetUsers eşleşmesi)
        var user = await _userManager.FindByEmailAsync(normalizedEmail);

        if (user is null)
        {
            _logger.LogWarning("Yetkisiz Entra ID erişim denemesi: {Email}. dbo.AspNetUsers tablosunda yetkilendirme bulunamadı.", normalizedEmail);
            await _activityService.LogActivityAsync(
                userName: normalizedEmail,
                actionType: "SSO_LOGIN",
                actionTitle: "Yetkisiz Entra ID Giriş Denemesi",
                description: $"Kurumsal hesap ({normalizedEmail}) GitRadar sisteminde yetkilendirilmemiştir (Pre-Authorized Whitelist eşleşmesi yok). Erişim engellendi.",
                targetScope: "Entra ID SSO",
                status: "FAILED",
                ipAddress: ip,
                cancellationToken: cancellationToken);

            return StatusCode(StatusCodes.Status403Forbidden, new ErrorResponseDto("Bu kurumsal hesap GitRadar erişimi için yetkilendirilmemiştir. Lütfen sistem yöneticisiyle iletişime geçin."));
        }

        if (!user.IsActive)
        {
            _logger.LogWarning("Pasif hesap Entra ID erişim denemesi: {Email}.", normalizedEmail);
            await _activityService.LogActivityAsync(
                userName: normalizedEmail,
                actionType: "SSO_LOGIN",
                actionTitle: "Pasif Hesap Giriş Denemesi",
                description: $"Hesap ({normalizedEmail}) pasife alındığı için kurumsal SSO erişimi reddedildi.",
                targetScope: "Entra ID SSO",
                status: "FAILED",
                ipAddress: ip,
                cancellationToken: cancellationToken);

            return StatusCode(StatusCodes.Status403Forbidden, new ErrorResponseDto("Kurumsal hesabınız pasife alınmıştır. Lütfen sistem yöneticisiyle iletişime geçin."));
        }

        // 4. İsteğe Bağlı: Microsoft'tan dönen güncel ismi senkronize et
        if (!string.IsNullOrWhiteSpace(fullName) && (string.IsNullOrWhiteSpace(user.FullName) || user.FullName != fullName))
        {
            user.FullName = fullName;
            await _userManager.UpdateAsync(user);
        }

        // 5. Yetkilendirilmiş kullanıcı için GitRadar JWT Token'ı üret
        var roles = await _userManager.GetRolesAsync(user);
        var primaryRole = roles.FirstOrDefault() ?? "Admin";

        var (token, expiration) = GenerateJwtToken(user, primaryRole);

        // CIS Audit Logu
        await _activityService.LogActivityAsync(
            userName: user.UserName ?? normalizedEmail,
            actionType: "SSO_LOGIN",
            actionTitle: "Microsoft Entra ID ile Başarılı Giriş",
            description: $"Kurumsal Entra ID SSO ile başarılı oturum açıldı: {normalizedEmail} (Rol: {primaryRole})",
            targetScope: "Entra ID SSO",
            status: "SUCCESS",
            ipAddress: ip,
            cancellationToken: cancellationToken);

        _logger.LogInformation("Kullanıcı {Email} Entra ID ile başarıyla giriş yaptı. Rol: {Role}", normalizedEmail, primaryRole);

        var response = new AuthResponseDto(
            Token: token,
            Email: user.Email ?? normalizedEmail,
            Role: primaryRole,
            FullName: user.FullName ?? user.UserName,
            Expiration: expiration);

        return Ok(response);
    }

    /// <summary>
    /// Kurumsal kullanıcı girişi yapar ve JWT Bearer erişim belirteci üretir (Klasik Parola / Acil Erişim).
    /// </summary>
    /// <param name="loginDto">E-posta ve parola bilgileri.</param>
    /// <returns>JWT Token ve kullanıcı profil detayları.</returns>
    [HttpPost("login")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(AuthResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponseDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ErrorResponseDto), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginDto loginDto)
    {
        if (loginDto is null || string.IsNullOrWhiteSpace(loginDto.Email) || string.IsNullOrWhiteSpace(loginDto.Password))
        {
            return BadRequest(new ErrorResponseDto("E-posta ve parola alanları zorunludur."));
        }

        var user = await _userManager.FindByEmailAsync(loginDto.Email.Trim());
        if (user is null)
        {
            return Unauthorized(new ErrorResponseDto("Geçersiz kurumsal e-posta veya parola."));
        }

        var passwordCheck = await _signInManager.CheckPasswordSignInAsync(user, loginDto.Password, lockoutOnFailure: false);
        if (!passwordCheck.Succeeded)
        {
            return Unauthorized(new ErrorResponseDto("Geçersiz kurumsal e-posta veya parola."));
        }

        var roles = await _userManager.GetRolesAsync(user);
        var primaryRole = roles.FirstOrDefault() ?? "Viewer";

        var (token, expiration) = GenerateJwtToken(user, primaryRole);

        var response = new AuthResponseDto(
            Token: token,
            Email: user.Email ?? loginDto.Email,
            Role: primaryRole,
            FullName: user.FullName ?? user.UserName,
            Expiration: expiration);

        return Ok(response);
    }

    /// <summary>
    /// Anlık yetkilendirilmiş kullanıcının profil ve rol bilgilerini döner.
    /// </summary>
    /// <returns>Geçerli kullanıcı bilgisi.</returns>
    [HttpGet("me")]
    [Authorize]
    [ProducesResponseType(typeof(CurrentUserDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetCurrentUser()
    {
        var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(userId))
        {
            return Unauthorized(new ErrorResponseDto("Oturum kimliği doğrulanamadı."));
        }

        var user = await _userManager.FindByIdAsync(userId);
        if (user is null)
        {
            return NotFound(new ErrorResponseDto("Kullanıcı kaydı bulunamadı."));
        }

        var roles = await _userManager.GetRolesAsync(user);
        var primaryRole = roles.FirstOrDefault() ?? "Viewer";

        var dto = new CurrentUserDto(
            Id: user.Id.ToString(),
            Email: user.Email ?? string.Empty,
            FullName: user.FullName ?? user.UserName,
            Role: primaryRole,
            Department: user.Department);

        return Ok(dto);
    }

    private (string Token, DateTime Expiration) GenerateJwtToken(ApplicationUser user, string role)
    {
        var jwtSettings = _configuration.GetSection("Jwt");
        var secretKey = jwtSettings["SecretKey"] ?? "CHANGE_THIS_TO_A_STRONG_32_CHAR_SECRET_KEY_IN_PROD!";
        var issuer = jwtSettings["Issuer"] ?? "GitRadar.API";
        var audience = jwtSettings["Audience"] ?? "GitRadar.Client";
        var expirationMinutes = int.TryParse(jwtSettings["ExpiresInMinutes"], out var mins) ? mins : 480;

        var expiration = DateTime.UtcNow.AddMinutes(expirationMinutes);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Email, user.Email ?? string.Empty),
            new(ClaimTypes.Name, user.FullName ?? user.UserName ?? string.Empty),
            new(ClaimTypes.Role, role),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expiration,
            Issuer = issuer,
            Audience = audience,
            SigningCredentials = credentials
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);

        return (tokenHandler.WriteToken(token), expiration);
    }
}
