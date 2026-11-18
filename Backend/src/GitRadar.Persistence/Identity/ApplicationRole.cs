using Microsoft.AspNetCore.Identity;

namespace GitRadar.Persistence.Identity;

/// <summary>
/// ASP.NET Core Identity için kurumsal rol modelidir.
/// dbo.AspNetRoles tablosunu temsil eder ve Id alanı otomatik artan (int IDENTITY(1,1)) birincil anahtardır.
/// </summary>
public class ApplicationRole : IdentityRole<int>
{
    public ApplicationRole() : base()
    {
    }

    public ApplicationRole(string roleName) : base(roleName)
    {
    }
}

