using GitRadar.Domain.Repositories;

namespace GitRadar.Persistence.Repositories;

/// <summary>
/// EF Core GitRadarDbContext üzerinden atomik işlem ve değişiklik yönetimini sağlayan Unit of Work implementasyonudur.
/// </summary>
public sealed class UnitOfWork : IUnitOfWork
{
    private readonly GitRadarDbContext _dbContext;

    public UnitOfWork(GitRadarDbContext dbContext)
    {
        _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
    }

    public async Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return await _dbContext.SaveChangesAsync(cancellationToken);
    }
}

