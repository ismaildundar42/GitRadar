namespace GitRadar.Advisory.Abstractions.Models;

/// <summary>
/// Zafiyet önem derecesini belirten ortak standartlaştırılmış seviye enum'ı.
/// CIS Controls v8 Safeguard 16.6 önceliklendirme standardı ile uyumludur.
/// </summary>
public enum SeverityLevel
{
    None = 0,
    Low = 1,
    Medium = 2,
    High = 3,
    Critical = 4
}

