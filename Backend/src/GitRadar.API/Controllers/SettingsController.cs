using GitRadar.API.DTOs.Common;
using GitRadar.API.DTOs.Settings;
using GitRadar.Application.Contracts.GitHub;
using GitRadar.Application.Contracts.GitHub.Exceptions;
using GitRadar.Infrastructure.GitHub;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace GitRadar.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public sealed class SettingsController : ControllerBase
{
    private readonly GitHubClientOptions _options;
    private readonly IGitHubService _gitHubService;
    private readonly ILogger<SettingsController> _logger;

    private static GitHubAccountProfileDto? _cachedProfile;
    private static DateTime? _cacheTime;
    private static readonly object _cacheLock = new();

    public SettingsController(
        IOptions<GitHubClientOptions> options,
        IGitHubService gitHubService,
        ILogger<SettingsController> logger)
    {
        _options = options?.Value ?? new GitHubClientOptions();
        _gitHubService = gitHubService ?? throw new ArgumentNullException(nameof(gitHubService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Aktif GitHub entegrasyonu, kimlik profili ve hedef organizasyon ayarlarını döner.
    /// Bilgiler appsettings.json üzerindeki GitHub yapılandırmasından okunur.
    /// </summary>
    [HttpGet("github")]
    [HttpGet("github-status")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(GitHubSettingsDto), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetGitHubSettings(CancellationToken cancellationToken)
    {
        var token = _options.PersonalAccessToken?.Trim();
        var hasToken = !string.IsNullOrWhiteSpace(token);

        string? masked = null;
        if (hasToken && token!.Length > 8)
        {
            var prefix = token.Substring(0, 4);
            var suffix = token.Substring(token.Length - 4);
            masked = $"{prefix}****{suffix}";
        }
        else if (hasToken)
        {
            masked = "********";
        }

        var targetOrg = _options.TargetOrganization;
        GitHubAccountProfileDto? profile = null;
        bool isValid = false;

        if (hasToken)
        {
            lock (_cacheLock)
            {
                if (_cachedProfile != null && _cacheTime.HasValue && (DateTime.UtcNow - _cacheTime.Value).TotalMinutes < 10)
                {
                    profile = _cachedProfile;
                    isValid = true;
                }
            }

            if (profile == null)
            {
                try
                {
                    profile = await _gitHubService.VerifyAndGetProfileAsync(token!, cancellationToken);
                    isValid = true;
                    lock (_cacheLock)
                    {
                        _cachedProfile = profile;
                        _cacheTime = DateTime.UtcNow;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "GitHub token doğrulaması başarısız oldu.");
                    isValid = false;
                }
            }
        }

        var dto = new GitHubSettingsDto
        {
            DetectedLogin = profile?.Login,
            DetectedName = profile?.Name,
            AvatarUrl = profile?.AvatarUrl,
            TargetOrg = targetOrg,
            TargetOrganization = targetOrg,
            AccountType = profile?.Type ?? "User",
            IsValid = isValid,
            HasToken = hasToken,
            MaskedToken = masked,
            LastVerifiedAt = _cacheTime ?? (isValid ? DateTime.UtcNow : null)
        };

        return Ok(dto);
    }

    /// <summary>
    /// GitHub PAT doğrulama uç noktası (Geriye uyumluluk için korunmuştur, yönetim appsettings.json üzerindendir).
    /// </summary>
    [HttpPost("verify-token")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult VerifyToken()
    {
        return Ok(new
        {
            isValid = true,
            message = "GitHub token yönetimi merkezi appsettings.json yapılandırmasına taşınmıştır."
        });
    }

    /// <summary>
    /// GitHub ayarları güncelleme uç noktası (Geriye uyumluluk için korunmuştur, yönetim appsettings.json üzerindendir).
    /// </summary>
    [HttpPost("github")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult UpdateGitHubSettings()
    {
        return Ok(new
        {
            isValid = true,
            message = "GitHub token yönetimi merkezi appsettings.json yapılandırmasına taşınmıştır."
        });
    }
}
