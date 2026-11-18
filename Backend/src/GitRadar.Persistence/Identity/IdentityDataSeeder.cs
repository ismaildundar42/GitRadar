using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace GitRadar.Persistence.Identity;

/// <summary>
/// Uygulama ilk ayağa kalktığında kurumsal rolleri ve varsayılan yönetici hesabını
/// dbo.AspNetUsers tablosuna otomatik tohumlar (seed).
/// </summary>
public static class IdentityDataSeeder
{
    public static async Task SeedAsync(IServiceProvider serviceProvider)
    {
        using var scope = serviceProvider.CreateScope();
        var services = scope.ServiceProvider;
        var logger = services.GetService<ILoggerFactory>()?.CreateLogger("IdentityDataSeeder");

        try
        {
            var context = services.GetRequiredService<GitRadarDbContext>();
            await context.Database.MigrateAsync();

            var roleManager = services.GetRequiredService<RoleManager<ApplicationRole>>();
            var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();

            // 1. Kurumsal Rol: Sadece "Admin" (Id = 1) korunur
            var viewerRole = await roleManager.FindByNameAsync("Viewer");
            if (viewerRole is not null)
            {
                await roleManager.DeleteAsync(viewerRole);
                logger?.LogInformation("Gereksiz Viewer rolü sistemden temizlendi.");
            }

            if (!await roleManager.RoleExistsAsync("Admin"))
            {
                await roleManager.CreateAsync(new ApplicationRole("Admin"));
                logger?.LogInformation("Kurumsal Admin rolü (Id = 1) oluşturuldu.");
            }

            // 2. Varsayılan Yönetici: admin@example.com
            var defaultAdminEmail = "admin@example.com";
            var defaultAdminUser = await userManager.FindByEmailAsync(defaultAdminEmail);
            if (defaultAdminUser is null)
            {
                defaultAdminUser = new ApplicationUser
                {
                    UserName = defaultAdminEmail,
                    Email = defaultAdminEmail,
                    EmailConfirmed = true,
                    FullName = "GitRadar Administrator",
                    Title = "Platform Security Architect",
                    Department = "Enterprise Cyber Security",
                    IsActive = true,
                    CreatedAtUtc = DateTime.UtcNow
                };

                var createResult = await userManager.CreateAsync(defaultAdminUser, "AdminPass123!");
                if (createResult.Succeeded)
                {
                    await userManager.AddToRoleAsync(defaultAdminUser, "Admin");
                    logger?.LogInformation("Tek yetkili kurumsal yönetici başarıyla oluşturuldu: {Email}", defaultAdminEmail);
                }
                else
                {
                    var errors = string.Join(", ", createResult.Errors.Select(e => e.Description));
                    logger?.LogError("Yönetici kullanıcısı oluşturulamadı: {Errors}", errors);
                }
            }
            else
            {
                defaultAdminUser.FullName = "GitRadar Administrator";
                defaultAdminUser.Title = "Platform Security Architect";
                defaultAdminUser.Department = "Enterprise Cyber Security";
                defaultAdminUser.IsActive = true;
                
                // Parola hash'inin her zaman geçerli olmasını garanti et
                var hasher = services.GetRequiredService<IPasswordHasher<ApplicationUser>>();
                defaultAdminUser.PasswordHash = hasher.HashPassword(defaultAdminUser, "AdminPass123!");
                await userManager.UpdateAsync(defaultAdminUser);

                if (!await userManager.IsInRoleAsync(defaultAdminUser, "Admin"))
                {
                    await userManager.AddToRoleAsync(defaultAdminUser, "Admin");
                }
            }
        }
        catch (Exception ex)
        {
            logger?.LogError(ex, "Kimlik verileri tohumlanırken hata oluştu.");
        }
    }
}
