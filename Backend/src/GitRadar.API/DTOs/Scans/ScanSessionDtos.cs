namespace GitRadar.API.DTOs.Scans;

/// <summary>
/// Tarama oturumunun (Master) özet bilgilerini döner.
/// </summary>
public sealed record ScanSessionSummaryDto(
    int Id,
    int? ScannedUserId,
    string ScannedUserName,
    string ScannedUserEmail,
    DateTime ScanDate,
    DateTime? CompletedDate,
    long DurationMs,
    string ScanType,
    string Status,
    int TotalRepositoriesCount,
    int ScannedRepositoriesCount,
    int SuccessCount,
    int FailureCount,
    int TotalVulnerabilitiesFound,
    int AutoResolvedCount
);

/// <summary>
/// Tarama oturumuna bağlı her bir depo taramasının (Detail) özetini döner.
/// </summary>
public sealed record ScanSessionExecutionDto(
    long Id,
    long RepositoryId,
    string RepositoryName,
    string CommitSha,
    string Status,
    DateTime CreatedAtUtc,
    DateTime? CompletedDateUtc,
    long DurationMs,
    int PackagesCount,
    int VulnerabilitiesCount,
    string? FailureReason
);

/// <summary>
/// Tarama oturumunun detaylarını ve bağlı çalıştırma listesini döner.
/// </summary>
public sealed record ScanSessionDetailDto(
    int Id,
    int? ScannedUserId,
    string ScannedUserName,
    string ScannedUserEmail,
    DateTime ScanDate,
    DateTime? CompletedDate,
    long DurationMs,
    string ScanType,
    string Status,
    int TotalRepositoriesCount,
    int ScannedRepositoriesCount,
    int SuccessCount,
    int FailureCount,
    int TotalVulnerabilitiesFound,
    int AutoResolvedCount,
    IReadOnlyList<ScanSessionExecutionDto> Executions
);

