using GitRadar.Domain.Entities;

namespace GitRadar.Domain.Repositories;

/// <summary>
/// Tarama çalıştırması varlıkları için veri erişim sözleşmesidir.
/// </summary>
public interface IScanExecutionRepository
{
    Task<ScanExecution?> GetByIdAsync(long id, CancellationToken cancellationToken = default);
    Task<ScanExecution?> GetByIdWithDetailsAsync(long id, CancellationToken cancellationToken = default);
    Task AddAsync(ScanExecution scanExecution, CancellationToken cancellationToken = default);
    Task UpdateAsync(ScanExecution scanExecution, CancellationToken cancellationToken = default);
    Task<List<VulnerabilityAlert>> GetPreviousVulnerabilitiesForRepositoryAsync(long repositoryId, CancellationToken cancellationToken = default);
    Task DeletePreviousScansForRepositoryAsync(long repositoryId, CancellationToken cancellationToken = default);
}

