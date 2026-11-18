using GitRadar.Domain.Entities;
using GitRadar.Domain.Repositories;
using Microsoft.EntityFrameworkCore;

namespace GitRadar.Persistence.Repositories;

/// <summary>
/// Repository (Depo) aggregate root varlıkları için EF Core tabanlı repository implementasyonudur.
/// </summary>
public sealed class RepositoryRepository : IRepositoryRepository
{
    private readonly GitRadarDbContext _dbContext;

    public RepositoryRepository(GitRadarDbContext dbContext)
    {
        _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
    }

    public async Task<Repository?> GetByIdAsync(long id, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Repositories
            .FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
    }

    public async Task<Repository?> GetByNameAsync(string name, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(name))
            return null;

        var normalizedName = name.Trim();
        return await _dbContext.Repositories
            .FirstOrDefaultAsync(r => r.Name == normalizedName, cancellationToken);
    }

    public async Task<IReadOnlyList<Repository>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await _dbContext.Repositories
            .AsSplitQuery()
            .Include(r => r.ScanExecutions)
                .ThenInclude(s => s.Packages)
            .Include(r => r.ScanExecutions)
                .ThenInclude(s => s.VulnerabilityAlerts)
            .OrderByDescending(r => r.CreatedAtUtc)
            .ToListAsync(cancellationToken);
    }

    public async Task AddAsync(Repository repository, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(repository);
        await _dbContext.Repositories.AddAsync(repository, cancellationToken);
    }
}

