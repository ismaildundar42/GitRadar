namespace GitRadar.API.DTOs.Repositories;

/// <summary>
/// Kayıtlı depoların özet durumunu ve son tarama bilgilerini sunan modeldir.
/// </summary>
public sealed record RepositorySummaryDto(
    long Id,
    string Name,
    string Owner,
    string FullName,
    string RemoteUrl,
    string DefaultBranch,
    bool IsPrivate,
    string Status,
    DateTime CreatedAtUtc,
    string? LastScanStatus,
    DateTime? LastScanDateUtc,
    int TotalScansCount,
    int PackagesCount = 0,
    int VulnerabilitiesCount = 0,
    int DurationSeconds = 0,
    int? LastScanSessionId = null,
    string? LastCommitSha = null);
