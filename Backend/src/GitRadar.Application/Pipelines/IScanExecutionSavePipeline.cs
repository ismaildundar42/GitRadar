using GitRadar.Domain.Entities;
using GitRadar.Scanning.Core.Enrichment;

namespace GitRadar.Application.Pipelines;

/// <summary>
/// Zenginleştirilmiş tarama sonucunun Domain invariant kurallarına ve atomik veritabanı
/// kayıt döngüsüne uygun olarak işlenmesini ve kalıcılaştırılmasını yöneten pipeline sözleşmesidir.
/// </summary>
public interface IScanExecutionSavePipeline
{
    Task<ScanExecution> SaveEnrichedScanAsync(
        long repositoryId,
        string commitSha,
        EnrichedScanResult enrichedResult,
        DateTime queuedAtUtc,
        DateTime startedAtUtc,
        DateTime completedAtUtc,
        int? scanId = null,
        CancellationToken cancellationToken = default);
}

