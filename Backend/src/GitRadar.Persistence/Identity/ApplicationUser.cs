using Microsoft.AspNetCore.Identity;

namespace GitRadar.Persistence.Identity;

/// <summary>
/// GitRadar platformu için kurumsal kullanıcı ve yönetici kimlik modelidir.
/// ASP.NET Core Identity (dbo.AspNetUsers) tablosunu temsil eder.
/// Id alanı otomatik artan (int IDENTITY(1,1)) birincil anahtardır.
/// </summary>
public class ApplicationUser : IdentityUser<int>
{
    public string FullName { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty; // "Stajyer Yazılım Geliştirici", vb.
    public string? Department { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}
