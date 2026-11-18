namespace GitRadar.Domain.Enums;

/// <summary>
/// Bir tarama çalıştırmasının (ScanExecution) anlık durumunu belirtir.
/// </summary>
public enum ScanStatus
{
    Pending = 1,
    InProgress = 2,
    Completed = 3,
    CompletedWithWarnings = 4,
    Partial = 5,
    Failed = 6,
    Cancelled = 7
}

