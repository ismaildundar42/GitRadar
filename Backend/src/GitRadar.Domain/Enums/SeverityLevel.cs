namespace GitRadar.Domain.Enums;

/// <summary>
/// Bir güvenlik zafiyetinin risk/ciddiyet derecesini belirtir.
/// </summary>
public enum SeverityLevel
{
    Unknown = 0,
    Informational = 1,
    Low = 2,
    Medium = 3,
    High = 4,
    Critical = 5
}

