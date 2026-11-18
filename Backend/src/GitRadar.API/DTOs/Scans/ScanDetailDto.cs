namespace GitRadar.API.DTOs.Scans;

/// <summary>
/// CIS Controls v8 Safeguard 16.4 (SBOM) ve 16.6 (Zafiyetler) denetim detaylarını içeren tarama sonuç modelidir.
/// </summary>
public sealed record ScanDetailDto(
    long ScanExecutionId,
    long RepositoryId,
    string CommitSha,
    string Status,
    DateTime QueuedAtUtc,
    DateTime? StartedAtUtc,
    DateTime? CompletedAtUtc,
    string? FailureReason,
    IReadOnlyList<ScanPackageDto> Packages,
    IReadOnlyList<ScanVulnerabilityDto> VulnerabilityAlerts);

/// <summary>
/// CIS Safeguard 16.4 SBOM paket detay modelidir.
/// </summary>
public sealed record ScanPackageDto(
    long Id,
    string PackageName,
    string PackageVersion,
    string Ecosystem,
    bool DirectDependency,
    string ManifestRelativePath,
    string? PackageUrl,
    string Scope);

/// <summary>
/// CIS Safeguard 16.6 zafiyet bildirim modelidir.
/// </summary>
public sealed record ScanVulnerabilityDto(
    long Id,
    long DiscoveredPackageId,
    string AdvisoryId,
    string Severity,
    decimal? CvssScore,
    string Title,
    string Status,
    string? FixedInVersion,
    DateTime FirstDetectedAtUtc,
    DateTime? ResolvedAtUtc,
    DateTime? SlaDueDateUtc = null);

