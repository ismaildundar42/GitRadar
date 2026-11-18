using GitRadar.Application.Mappers;
using GitRadar.Domain.Entities;
using GitRadar.Domain.Repositories;
using GitRadar.Scanning.Core.Enrichment;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace GitRadar.Application.Pipelines;

/// <summary>
/// Zenginleştirilmiş tarama sonucunu doğrular, Domain nesne grafiğine eşler,
/// repository aracılığıyla ekler ve Unit of Work üzerinden atomik olarak veritabanına kaydeder.
/// </summary>
public sealed class ScanExecutionSavePipeline : IScanExecutionSavePipeline
{
    private readonly IScanExecutionRepository _scanExecutionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<ScanExecutionSavePipeline> _logger;

    public ScanExecutionSavePipeline(
        IScanExecutionRepository scanExecutionRepository,
        IUnitOfWork unitOfWork,
        ILogger<ScanExecutionSavePipeline>? logger = null)
    {
        _scanExecutionRepository = scanExecutionRepository ?? throw new ArgumentNullException(nameof(scanExecutionRepository));
        _unitOfWork = unitOfWork ?? throw new ArgumentNullException(nameof(unitOfWork));
        _logger = logger ?? NullLogger<ScanExecutionSavePipeline>.Instance;
    }

    public async Task<ScanExecution> SaveEnrichedScanAsync(
        long repositoryId,
        string commitSha,
        EnrichedScanResult enrichedResult,
        DateTime queuedAtUtc,
        DateTime startedAtUtc,
        DateTime completedAtUtc,
        int? scanId = null,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(enrichedResult);

        try
        {
            // 1. AUTO-RESOLVE Zafiyet Yaşam Döngüsü: Önceki tamamlanmış taramadaki zafiyetleri al
            var previousVulns = await _scanExecutionRepository.GetPreviousVulnerabilitiesForRepositoryAsync(repositoryId, cancellationToken);

            // Yeni taramada tespit edilen aktif advisory id listesi
            var currentAdvisoryIds = enrichedResult.EnrichedDependencies
                .SelectMany(d => d.Vulnerabilities)
                .Select(v => v.Vulnerability.Id)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            // 2. Re-Scan Hijyeni: Aynı depoya ait önceki bayat tarama ve zafiyet kayıtlarını temizle
            await _scanExecutionRepository.DeletePreviousScansForRepositoryAsync(repositoryId, cancellationToken);

            // 3. Invariant korumalı nesne grafiği üretimi
            var scanExecution = EnrichedScanResultMapper.MapToScanExecution(
                repositoryId,
                commitSha,
                enrichedResult,
                queuedAtUtc,
                startedAtUtc,
                completedAtUtc);

            if (scanId.HasValue && scanId.Value > 0)
            {
                scanExecution.SetScanId(scanId.Value);
            }

            // 4. AUTO-RESOLVE KONTROLÜ: Önceden açık olan ama yeni taramada ARTIK ÇIKMAYAN zafiyetleri çözüldü olarak aktar
            foreach (var prevVuln in previousVulns)
            {
                if (!currentAdvisoryIds.Contains(prevVuln.VulnerabilityId))
                {
                    // Çözüldü olarak işaretle
                    var resolvedAlert = VulnerabilityAlert.Create(
                        discoveredPackageId: 0,
                        vulnerabilityId: prevVuln.VulnerabilityId,
                        severity: prevVuln.Severity,
                        title: prevVuln.Title,
                        affectedVersions: prevVuln.AffectedVersions,
                        fixedInVersion: prevVuln.FixedInVersion,
                        source: prevVuln.Source,
                        createdAtUtc: prevVuln.CreatedAtUtc,
                        scanExecutionId: 0,
                        cvssScore: prevVuln.CvssScore,
                        status: Domain.Enums.VulnerabilityAlertStatus.Resolved,
                        resolvedAtUtc: DateTime.UtcNow,
                        resolvedBy: "SYSTEM_AUTO_RESOLVE",
                        resolutionComment: "Bileşen güvenli sürüme güncellendi veya kaldırıldı. Periyodik tarama tarafından otomatik çözüldü.");

                    // İlgili paketi bul veya oluştur
                    var pkg = scanExecution.Packages.FirstOrDefault() ?? DiscoveredPackage.Create(
                        scanExecutionId: 0,
                        name: "Resolved-Dependencies",
                        version: "1.0.0",
                        ecosystem: Domain.Enums.EcosystemType.NuGet,
                        manifestPath: string.Empty,
                        isDirectDependency: false,
                        scope: Domain.Enums.DependencyScope.Production);

                    if (!scanExecution.Packages.Contains(pkg))
                    {
                        scanExecution.AddPackage(pkg);
                    }

                    scanExecution.AddVulnerability(pkg, resolvedAlert);
                }
            }

            // 5. Repository üzerinden ekleme ve UnitOfWork ile atomik kayıt
            await _scanExecutionRepository.AddAsync(scanExecution, cancellationToken);
            await _unitOfWork.SaveChangesAsync(cancellationToken);

            _logger.LogInformation(
                "Depo #{RepositoryId} için {PackageCount} paket ve {VulnCount} zafiyet başarıyla kaydedildi.",
                repositoryId,
                scanExecution.Packages.Count,
                scanExecution.VulnerabilityAlerts.Count);

            return scanExecution;
        }
        catch (Exception ex)
        {
            _logger.LogError(
                ex,
                "Depo #{RepositoryId} için tarama sonuçları kaydedilirken hata oluştu: {Message}",
                repositoryId,
                ex.Message);
            throw;
        }
    }
}

