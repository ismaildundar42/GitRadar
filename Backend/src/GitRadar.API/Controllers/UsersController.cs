using GitRadar.API.DTOs.Users;
using GitRadar.Application.Contracts.Activities;
using GitRadar.Persistence.Identity;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GitRadar.API.Controllers;

/// <summary>
/// Kurumsal yönetici (Admin) yetkilendirme ve AspNetUsers tablosu yönetim kontrolcüsüdür.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public sealed class UsersController : ControllerBase
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly RoleManager<ApplicationRole> _roleManager;
    private readonly IUserActivityService _activityService;

    public UsersController(
        UserManager<ApplicationUser> userManager,
        RoleManager<ApplicationRole> roleManager,
        IUserActivityService activityService)
    {
        _userManager = userManager ?? throw new ArgumentNullException(nameof(userManager));
        _roleManager = roleManager ?? throw new ArgumentNullException(nameof(roleManager));
        _activityService = activityService ?? throw new ArgumentNullException(nameof(activityService));
    }

    private string CurrentAdminName =>
        User.Identity?.Name ?? "Admin";

    /// <summary>
    /// AspNetUsers tablosunda tanımlı kurumsal yöneticileri listeler.
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetUsers(CancellationToken cancellationToken)
    {
        var users = await _userManager.Users
            .AsNoTracking()
            .OrderByDescending(u => u.CreatedAtUtc)
            .Select(u => new
            {
                id = u.Id,
                fullName = u.FullName ?? u.UserName,
                title = string.IsNullOrWhiteSpace(u.Title) ? "Sistem & Güvenlik Yöneticisi" : u.Title,
                email = u.Email ?? u.UserName,
                isActive = u.IsActive,
                createdAt = u.CreatedAtUtc,
                role = "Admin"
            })
            .ToListAsync(cancellationToken);

        return Ok(users);
    }

    /// <summary>
    /// Microsoft Entra ID entegrasyonu için doğrudan AspNetUsers tablosuna yeni bir yönetici tanımlar.
    /// </summary>
    [HttpPost]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateUser([FromBody] CreateAppUserDto dto, CancellationToken cancellationToken)
    {
        if (dto is null || string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.FullName))
        {
            return BadRequest(new { message = "E-posta adresi ve Ad Soyad alanları zorunludur." });
        }

        var normalizedEmail = dto.Email.Trim().ToLowerInvariant();
        var existing = await _userManager.FindByEmailAsync(normalizedEmail);
        if (existing is not null)
        {
            return BadRequest(new { message = $"'{dto.Email.Trim()}' e-posta adresiyle kayıtlı bir yönetici zaten mevcuttur." });
        }

        var newUser = new ApplicationUser
        {
            UserName = dto.Email.Trim(),
            Email = dto.Email.Trim(),
            EmailConfirmed = true,
            FullName = dto.FullName.Trim(),
            Title = string.IsNullOrWhiteSpace(dto.Title) ? "Sistem & Güvenlik Yöneticisi" : dto.Title.Trim(),
            Department = "Enterprise Cyber Security",
            IsActive = dto.IsActive,
            SecurityStamp = Guid.NewGuid().ToString(),
            CreatedAtUtc = DateTime.UtcNow
        };

        var createResult = await _userManager.CreateAsync(newUser, "AdminPass123!");
        if (!createResult.Succeeded)
        {
            var errors = string.Join(", ", createResult.Errors.Select(e => e.Description));
            return BadRequest(new { message = errors });
        }

        if (!await _roleManager.RoleExistsAsync("Admin"))
        {
            await _roleManager.CreateAsync(new ApplicationRole("Admin"));
        }
        await _userManager.AddToRoleAsync(newUser, "Admin");

        // Audit Trail log kaydı
        await _activityService.LogActivityAsync(
            CurrentAdminName,
            "USER_CREATED",
            "Yeni Yönetici (Admin) Yetkilendirildi",
            $"{CurrentAdminName}, {newUser.FullName} ({newUser.Title}) yöneticisini sisteme tanımladı.",
            newUser.Email,
            "SUCCESS",
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            cancellationToken);

        var responseDto = new
        {
            id = newUser.Id,
            fullName = newUser.FullName,
            title = newUser.Title,
            email = newUser.Email,
            isActive = newUser.IsActive,
            createdAt = newUser.CreatedAtUtc,
            role = "Admin"
        };

        return CreatedAtAction(nameof(GetUsers), new { id = newUser.Id }, responseDto);
    }

    /// <summary>
    /// AspNetUsers tablosundaki yöneticinin bilgilerini (Ad, Ünvan veya Erişim Durumu) günceller.
    /// </summary>
    [HttpPut("{id:int}")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> UpdateUser(int id, [FromBody] UpdateAppUserDto dto, CancellationToken cancellationToken)
    {
        if (dto is null) return BadRequest(new { message = "Güncelleme verisi boş olamaz." });

        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null) return NotFound(new { message = "Yönetici bulunamadı." });

        if (!string.IsNullOrWhiteSpace(dto.FullName))
            user.FullName = dto.FullName.Trim();

        if (dto.Title is not null)
            user.Title = dto.Title.Trim();

        if (dto.IsActive.HasValue)
            user.IsActive = dto.IsActive.Value;

        var updateResult = await _userManager.UpdateAsync(user);
        if (!updateResult.Succeeded)
        {
            var errors = string.Join(", ", updateResult.Errors.Select(e => e.Description));
            return BadRequest(new { message = errors });
        }

        // Audit Trail log kaydı
        await _activityService.LogActivityAsync(
            CurrentAdminName,
            "USER_UPDATED",
            "Yönetici Bilgileri Güncellendi",
            $"{CurrentAdminName}, {user.Email} yöneticisinin bilgilerini/yetkilerini güncelledi.",
            user.Email ?? string.Empty,
            "SUCCESS",
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            cancellationToken);

        return Ok(new
        {
            id = user.Id,
            fullName = user.FullName,
            title = user.Title,
            email = user.Email,
            isActive = user.IsActive,
            createdAt = user.CreatedAtUtc,
            role = "Admin"
        });
    }

    /// <summary>
    /// Yöneticinin sistem erişimini kaldırır / AspNetUsers tablosundan siler.
    /// </summary>
    [HttpDelete("{id:int}")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteUser(int id, CancellationToken cancellationToken)
    {
        var user = await _userManager.FindByIdAsync(id.ToString());
        if (user is null) return NotFound(new { message = "Yönetici bulunamadı." });

        // 1. Kendi hesabını silmeye karşı güvenlik kontrolü
        var currentUserName = User.Identity?.Name;
        if (!string.IsNullOrWhiteSpace(currentUserName) &&
            (user.UserName?.Equals(currentUserName, StringComparison.OrdinalIgnoreCase) == true ||
             user.Email?.Equals(currentUserName, StringComparison.OrdinalIgnoreCase) == true))
        {
            return BadRequest(new { message = "Oturum açmış olan aktif yönetici kendi hesabını silemez." });
        }

        // 2. Sistemdeki son yöneticiyi silmeyi engelle
        var totalAdmins = await _userManager.Users.CountAsync(cancellationToken);
        if (totalAdmins <= 1)
        {
            return BadRequest(new { message = "Sistemdeki son kalan Yönetici (Admin) hesabı silinemez." });
        }

        var deleteResult = await _userManager.DeleteAsync(user);
        if (!deleteResult.Succeeded)
        {
            var errors = string.Join(", ", deleteResult.Errors.Select(e => e.Description));
            return BadRequest(new { message = errors });
        }

        // Audit Trail log kaydı
        await _activityService.LogActivityAsync(
            CurrentAdminName,
            "USER_DELETED",
            "Yönetici Yetkisi Kaldırıldı",
            $"{CurrentAdminName}, {user.Email} yöneticisini sistemden kaldırdı.",
            user.Email ?? string.Empty,
            "SUCCESS",
            HttpContext.Connection.RemoteIpAddress?.ToString(),
            cancellationToken);

        return Ok(new { message = $"{user.Email} yöneticisi sistemden başarıyla kaldırıldı." });
    }
}
