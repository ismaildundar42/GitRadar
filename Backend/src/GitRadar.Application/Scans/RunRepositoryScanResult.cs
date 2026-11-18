namespace GitRadar.Application.Scans;

/// <summary>
/// Depo tarama çalıştırmasının sonucunu temsil eden sonuç modelidir.
/// </summary>
public sealed record RunRepositoryScanResult(
    long ScanExecutionId,
    long RepositoryId,
    string CommitSha,
    int DiscoveredPackagesCount,
    int VulnerabilitiesCount,
    int CriticalCount,
    int HighCount,
    string Status,
    bool IsSuccess,
    string? ErrorMessage);

