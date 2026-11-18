namespace GitRadar.Scanning.Abstractions.Models;

/// <summary>
/// Belirli bir manifest dosyasının tarayıcı tarafından analiz edilme sonucunu belirtir.
/// </summary>
public enum ScannerStatus
{
    /// <summary>
    /// Manifest eksiksiz ve hatasız ayrıştırıldı.
    /// </summary>
    Success = 1,

    /// <summary>
    /// Manifest kısmen ayrıştırıldı; bazı bağımlılıklar çıkarıldı ancak atlanan satırlar veya limit aşımları var.
    /// </summary>
    Partial = 2,

    /// <summary>
    /// Manifest çözümlenemedi veya kritik bir hata nedeniyle analiz başarısız oldu.
    /// </summary>
    Failed = 3
}

