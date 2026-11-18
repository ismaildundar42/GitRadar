namespace GitRadar.API.DTOs.Scans;

/// <summary>
/// Depo taraması başlatma istek modelidir.
/// </summary>
public sealed record ScanRunRequestDto(
    string Owner,
    string RepositoryName,
    string BranchOrCommit,
    string TriggeredBy = "Manual",
    string? Token = null);
