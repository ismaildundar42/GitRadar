using GitRadar.Advisory.Abstractions.Models;
using GitRadar.Domain.Entities;
using GitRadar.Domain.Enums;
using GitRadar.Domain.ValueObjects;
using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanning.Core.Enrichment;

namespace GitRadar.Application.Mappers;

/// <summary>
/// Zenginleştirilmiş tarama çıktısını (EnrichedScanResult) Domain invariant kurallarına tam uyumlu
/// şekilde ScanExecution aggregate root nesne grafiğine dönüştüren eşleme sınıfıdır.
/// </summary>
public static class EnrichedScanResultMapper
{
    public static ScanExecution MapToScanExecution(
        long repositoryId,
        string commitShaValue,
        EnrichedScanResult enrichedResult,
        DateTime queuedAtUtc,
        DateTime startedAtUtc,
        DateTime completedAtUtc)
    {
        ArgumentNullException.ThrowIfNull(enrichedResult);

        // 1. CommitSha Value Object invariant doğrulaması
        var commitSha = CommitSha.Create(commitShaValue);

        // 2. Pending durumunda ScanExecution oluşturma
        var scanExecution = ScanExecution.CreatePending(repositoryId, commitSha, queuedAtUtc);

        // 3. Tarama InProgress durumuna geçiş
        scanExecution.Start(startedAtUtc);

        // 4. Keşfedilen paketler ve zafiyetler (EF Core navigation graph bağlantısı)
        foreach (var enrichedDep in enrichedResult.EnrichedDependencies)
        {
            var raw = enrichedDep.Dependency;
            var ecosystem = MapEcosystem(raw.Ecosystem);
            var scope = MapScope(raw.Scope);
            var isDirect = raw.Relationship == DependencyRelationship.Direct;

            var package = DiscoveredPackage.Create(
                scanExecutionId: 0,
                name: raw.Name,
                version: raw.Version,
                ecosystem: ecosystem,
                manifestPath: raw.ManifestPath,
                isDirectDependency: isDirect,
                scope: scope,
                packageUrl: raw.PackageCoordinate);

            scanExecution.AddPackage(package);

            foreach (var enrichedVuln in enrichedDep.Vulnerabilities)
            {
                var vuln = enrichedVuln.Vulnerability;
                var severity = MapSeverity(vuln.Severity);

                var alert = VulnerabilityAlert.Create(
                    discoveredPackageId: 0,
                    vulnerabilityId: vuln.Id,
                    severity: severity,
                    title: string.IsNullOrWhiteSpace(vuln.Summary) ? vuln.Id : vuln.Summary.Trim(),
                    affectedVersions: string.Empty,
                    fixedInVersion: vuln.FixedVersion,
                    source: "OSV",
                    createdAtUtc: startedAtUtc,
                    scanExecutionId: 0,
                    cvssScore: vuln.Cvss?.BaseScore,
                    status: VulnerabilityAlertStatus.Open);

                // DiscoveredPackage ve ScanExecution ilişkisi nesne referansı üzerinden kurulur
                scanExecution.AddVulnerability(package, alert);
            }
        }

        // 5. Terminal durum kararı ve mühürleme (Complete / CompleteWithWarnings / Fail)
        var baseResult = enrichedResult.BaseScanResult;
        if (baseResult.Status == ScannerStatus.Failed)
        {
            var failReason = baseResult.Diagnostics
                .FirstOrDefault(d => d.Severity == DiagnosticSeverity.Error)?.Message
                ?? "Tarama tüm manifestolar için başarısız oldu.";
            scanExecution.Fail(failReason, completedAtUtc);
        }
        else if (baseResult.HasWarnings || baseResult.Status == ScannerStatus.Partial)
        {
            var warnings = baseResult.Diagnostics
                .Where(d => d.Severity == DiagnosticSeverity.Warning)
                .Select(d => d.Message)
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .ToList();

            if (warnings.Count > 0)
            {
                scanExecution.CompleteWithWarnings(warnings, completedAtUtc);
            }
            else
            {
                scanExecution.Complete(completedAtUtc);
            }
        }
        else
        {
            scanExecution.Complete(completedAtUtc);
        }

        return scanExecution;
    }

    private static EcosystemType MapEcosystem(ScannerEcosystem ecosystem) => ecosystem switch
    {
        ScannerEcosystem.NuGet => EcosystemType.NuGet,
        ScannerEcosystem.Npm => EcosystemType.Npm,
        ScannerEcosystem.PyPI => EcosystemType.PyPI,
        ScannerEcosystem.Maven => EcosystemType.Maven,
        _ => EcosystemType.NuGet
    };

    private static GitRadar.Domain.Enums.DependencyScope MapScope(GitRadar.Scanning.Abstractions.Models.DependencyScope scope) => scope switch
    {
        GitRadar.Scanning.Abstractions.Models.DependencyScope.Production => GitRadar.Domain.Enums.DependencyScope.Production,
        GitRadar.Scanning.Abstractions.Models.DependencyScope.Development => GitRadar.Domain.Enums.DependencyScope.Development,
        GitRadar.Scanning.Abstractions.Models.DependencyScope.Test => GitRadar.Domain.Enums.DependencyScope.Test,
        GitRadar.Scanning.Abstractions.Models.DependencyScope.Build => GitRadar.Domain.Enums.DependencyScope.Build,
        _ => GitRadar.Domain.Enums.DependencyScope.Unknown
    };

    private static GitRadar.Domain.Enums.SeverityLevel MapSeverity(GitRadar.Advisory.Abstractions.Models.SeverityLevel severity) => severity switch
    {
        GitRadar.Advisory.Abstractions.Models.SeverityLevel.Critical => GitRadar.Domain.Enums.SeverityLevel.Critical,
        GitRadar.Advisory.Abstractions.Models.SeverityLevel.High => GitRadar.Domain.Enums.SeverityLevel.High,
        GitRadar.Advisory.Abstractions.Models.SeverityLevel.Medium => GitRadar.Domain.Enums.SeverityLevel.Medium,
        GitRadar.Advisory.Abstractions.Models.SeverityLevel.Low => GitRadar.Domain.Enums.SeverityLevel.Low,
        _ => GitRadar.Domain.Enums.SeverityLevel.Informational
    };
}

