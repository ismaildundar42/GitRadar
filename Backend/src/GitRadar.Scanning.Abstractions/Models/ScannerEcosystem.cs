namespace GitRadar.Scanning.Abstractions.Models;

/// <summary>
/// Tarama altyapısı tarafından desteklenen teknoloji ekosistemlerini ve bileşen türlerini belirtir.
/// Domain katmanından bağımsız, tarayıcı sözleşmelerine özgü tip güvenli tanımdır.
/// </summary>
public enum ScannerEcosystem
{
    /// <summary>
    /// Ekosistem belirlenemedi veya bilinmiyor.
    /// </summary>
    Unknown = 0,

    /// <summary>
    /// .NET NuGet paket ekosistemi.
    /// </summary>
    NuGet = 1,

    /// <summary>
    /// Node.js npm paket ekosistemi.
    /// </summary>
    Npm = 2,

    /// <summary>
    /// Python PyPI paket ekosistemi.
    /// </summary>
    PyPI = 3,

    /// <summary>
    /// Java Maven & Gradle paket ekosistemi.
    /// </summary>
    Maven = 4,

    /// <summary>
    /// Konteyner temel imaj analizi (Dockerfile / Containerfile FROM yönergeleri).
    /// </summary>
    ContainerImage = 5
}

