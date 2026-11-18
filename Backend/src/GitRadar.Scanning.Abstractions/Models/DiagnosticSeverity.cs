namespace GitRadar.Scanning.Abstractions.Models;

/// <summary>
/// Tarama sırasında üretilen teşhis mesajının ciddiyet derecesini belirtir.
/// </summary>
public enum DiagnosticSeverity
{
    /// <summary>
    /// Bilgilendirme amaçlı teşhis iletisi.
    /// </summary>
    Info = 1,

    /// <summary>
    /// Ayrıştırma uyarısı (örn. geçersiz satır veya çözülemeyen değişken atlandı; analiz devam etti).
    /// </summary>
    Warning = 2,

    /// <summary>
    /// Kritik hata (örn. bozuk dosya formatı veya okunamayan içerik; manifest analizi tamamlanamadı).
    /// </summary>
    Error = 3
}

