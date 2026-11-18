using GitRadar.Domain.Entities;

namespace GitRadar.Domain.Repositories;

/// <summary>
/// Depo (Repository) aggregate root varlıkları için veri erişim sözleşmesidir.
/// </summary>
public interface IRepositoryRepository
{
    Task<Repository?> GetByNameAsync(string name, CancellationToken cancellationToken = default);
    Task<Repository?> GetByIdAsync(long id, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<Repository>> GetAllAsync(CancellationToken cancellationToken = default);
    Task AddAsync(Repository repository, CancellationToken cancellationToken = default);
}

