namespace GitRadar.Application.Scans;

/// <summary>
/// Belirli bir deponun belirli bir dal veya commit üzerinde taranmasını talep eden komut modelidir.
/// </summary>
public sealed record RunRepositoryScanCommand(
    string Owner,
    string RepositoryName,
    string BranchOrCommit,
    string TriggeredBy = "Manual",
    int? ScanId = null);

