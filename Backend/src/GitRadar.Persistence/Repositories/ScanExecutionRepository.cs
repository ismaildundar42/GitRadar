using GitRadar.Domain.Entities;
using GitRadar.Domain.Repositories;
using Microsoft.EntityFrameworkCore;

namespace GitRadar.Persistence.Repositories;

/// <summary>
/// ScanExecution aggregate root varlıkları için EF Core tabanlı repository implementasyonudur.
/// </summary>
public sealed class ScanExecutionRepository : IScanExecutionRepository
{
    private readonly GitRadarDbContext _dbContext;

    public ScanExecutionRepository(GitRadarDbContext dbContext)
    {
        _dbContext = dbContext ?? throw new ArgumentNullException(nameof(dbContext));
    }

    public async Task<ScanExecution?> GetByIdAsync(long id, CancellationToken cancellationToken = default)
    {
        return await _dbContext.ScanExecutions
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
    }

    public async Task<ScanExecution?> GetByIdWithDetailsAsync(long id, CancellationToken cancellationToken = default)
    {
        return await _dbContext.ScanExecutions
            .AsSplitQuery()
            .Include(s => s.Packages)
                .ThenInclude(p => p.Vulnerabilities)
            .Include(s => s.VulnerabilityAlerts)
            .FirstOrDefaultAsync(s => s.Id == id, cancellationToken);
    }

    public async Task AddAsync(ScanExecution scanExecution, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(scanExecution);
        await _dbContext.ScanExecutions.AddAsync(scanExecution, cancellationToken);
    }

    public Task UpdateAsync(ScanExecution scanExecution, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(scanExecution);
        _dbContext.ScanExecutions.Update(scanExecution);
        return Task.CompletedTask;
    }

    public async Task<List<VulnerabilityAlert>> GetPreviousVulnerabilitiesForRepositoryAsync(long repositoryId, CancellationToken cancellationToken = default)
    {
        if (repositoryId <= 0) return new List<VulnerabilityAlert>();

        var latestCompletedScanId = await _dbContext.ScanExecutions
            .Where(s => s.RepositoryId == repositoryId && s.Status == Domain.Enums.ScanStatus.Completed)
            .OrderByDescending(s => s.CreatedAtUtc)
            .Select(s => (long?)s.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (!latestCompletedScanId.HasValue) return new List<VulnerabilityAlert>();

        var rawAlerts = await _dbContext.VulnerabilityAlerts
            .AsNoTracking()
            .Where(v => v.ScanExecutionId == latestCompletedScanId.Value)
            .ToListAsync(cancellationToken);

        if (rawAlerts.Count == 0) return new List<VulnerabilityAlert>();

        var packageIds = rawAlerts.Select(v => v.DiscoveredPackageId).Distinct().ToList();
        var packages = await _dbContext.DiscoveredPackages
            .AsNoTracking()
            .Where(p => packageIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, cancellationToken);

        // DiscoveredPackage referanslarını eşle (yeni taramaya taşınabilmesi için)
        var result = new List<VulnerabilityAlert>();
        foreach (var alert in rawAlerts)
        {
            packages.TryGetValue(alert.DiscoveredPackageId, out var pkg);
            var clonedAlert = VulnerabilityAlert.Create(
                discoveredPackageId: alert.DiscoveredPackageId,
                vulnerabilityId: alert.VulnerabilityId,
                severity: alert.Severity,
                title: alert.Title,
                affectedVersions: alert.AffectedVersions,
                fixedInVersion: alert.FixedInVersion,
                source: alert.Source,
                createdAtUtc: DateTime.SpecifyKind(alert.CreatedAtUtc, DateTimeKind.Utc),
                scanExecutionId: 0,
                cvssScore: alert.CvssScore,
                status: alert.Status,
                resolvedAtUtc: alert.ResolvedAtUtc.HasValue ? DateTime.SpecifyKind(alert.ResolvedAtUtc.Value, DateTimeKind.Utc) : null,
                resolvedBy: alert.ResolvedBy,
                resolutionComment: alert.ResolutionComment);

            result.Add(clonedAlert);
        }

        return result;
    }

    public async Task DeletePreviousScansForRepositoryAsync(long repositoryId, CancellationToken cancellationToken = default)
    {
        if (repositoryId <= 0) return;

        var scanIds = await _dbContext.ScanExecutions
            .Where(s => s.RepositoryId == repositoryId && s.ScanId == null)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);

        if (scanIds.Count == 0) return;

        // 1. Önce kısıtlayıcı (Restrict) FK ilişkisine sahip zafiyet alarmlarını sil
        var alerts = await _dbContext.VulnerabilityAlerts
            .Where(v => scanIds.Contains(v.ScanExecutionId))
            .ToListAsync(cancellationToken);
        if (alerts.Count > 0)
        {
            _dbContext.VulnerabilityAlerts.RemoveRange(alerts);
        }

        // 2. Keşfedilen paketleri sil
        var packages = await _dbContext.DiscoveredPackages
            .Where(p => scanIds.Contains(p.ScanExecutionId))
            .ToListAsync(cancellationToken);
        if (packages.Count > 0)
        {
            _dbContext.DiscoveredPackages.RemoveRange(packages);
        }

        // 3. Tarama ana kayıtlarını sil
        var scans = await _dbContext.ScanExecutions
            .Where(s => scanIds.Contains(s.Id))
            .ToListAsync(cancellationToken);
        if (scans.Count > 0)
        {
            _dbContext.ScanExecutions.RemoveRange(scans);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);
    }
}

