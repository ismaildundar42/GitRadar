namespace GitRadar.Scanning.Abstractions.Models;

/// <summary>
/// Depo dosya ağacında keşfedilen bir bağımlılık manifestosunun meta veri modelidir.
/// Bellek tüketimini sınırlandırmak amacıyla dosya içeriğini barındırmaz, yalnızca meta bilgileri taşır.
/// Değişmezdir (Immutable).
/// </summary>
public sealed class DiscoveredManifest
{
    public string ManifestPath { get; }
    public string FileName { get; }
    public string ManifestType { get; }
    public ScannerEcosystem Ecosystem { get; }
    public long SizeBytes { get; }

    /// <summary>
    /// Dosya içeriğinin kriptografik özeti (Varsayılan SHA-256 hex formatında).
    /// Sağlanmamışsa veya hesaplanmamışsa null olabilir.
    /// </summary>
    public string? ContentHash { get; }

    public DiscoveredManifest(
        string manifestPath,
        string manifestType,
        ScannerEcosystem ecosystem,
        long sizeBytes,
        string? contentHash = null)
    {
        if (string.IsNullOrWhiteSpace(manifestPath))
            throw new ArgumentException("Manifest yolu boş olamaz.", nameof(manifestPath));

        if (string.IsNullOrWhiteSpace(manifestType))
            throw new ArgumentException("Manifest türü boş olamaz.", nameof(manifestType));

        if (sizeBytes < 0)
            throw new ArgumentOutOfRangeException(nameof(sizeBytes), "Dosya boyutu negatif olamaz.");

        ManifestPath = manifestPath.Trim().Replace('\\', '/');
        FileName = Path.GetFileName(ManifestPath);
        ManifestType = manifestType.Trim();
        Ecosystem = ecosystem;
        SizeBytes = sizeBytes;
        ContentHash = string.IsNullOrWhiteSpace(contentHash) ? null : contentHash.Trim();
    }

    public override string ToString() => $"[{Ecosystem}] {ManifestType}: {ManifestPath} ({SizeBytes} bytes)";
}
