using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace GitRadar.Persistence;

/// <summary>
/// Tasarım zamanında (EF Core CLI araçları, migration oluşturma vb.) DbContext örneği sağlayan fabrika sınıfıdır.
/// </summary>
public sealed class GitRadarDbContextFactory : IDesignTimeDbContextFactory<GitRadarDbContext>
{
    public const string DefaultConnectionString =
        "Server=.\\SQLEXPRESS;Database=GitRadarDb;Trusted_Connection=True;MultipleActiveResultSets=true;TrustServerCertificate=True";

    public GitRadarDbContext CreateDbContext(string[] args)
    {
        var optionsBuilder = new DbContextOptionsBuilder<GitRadarDbContext>();
        optionsBuilder.UseSqlServer(DefaultConnectionString);

        return new GitRadarDbContext(optionsBuilder.Options);
    }
}

