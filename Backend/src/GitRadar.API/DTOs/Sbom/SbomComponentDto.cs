namespace GitRadar.API.DTOs.Sbom;

/// <summary>
/// CIS Controls 16.4: Yazılım Bileşen Envanteri (SBOM) DTO Modeli.
/// </summary>
public sealed class SbomComponentDto
{
    public long Id { get; set; }
    public long ScanExecutionId { get; set; }

    // Paket Kimliği ve Sürümü
    public string PackageName { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string PackageVersion { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;

    // Depo / Proje Bilgileri
    public long RepositoryId { get; set; }
    public string RepositoryName { get; set; } = string.Empty;
    public string RepositoryFullName { get; set; } = string.Empty;
    public string ProjectName { get; set; } = string.Empty;

    // Ekosistem ve Bağımlılık Detayı
    public string Ecosystem { get; set; } = string.Empty;
    public bool DirectDependency { get; set; }
    public bool IsDirect { get; set; }
    public string RelationType { get; set; } = "Doğrudan (Direct)";
    public string Scope { get; set; } = "Production";

    // Manifest ve Paket Bağlantısı
    public string ManifestRelativePath { get; set; } = string.Empty;
    public string ManifestPath { get; set; } = string.Empty;
    public string PackageUrl { get; set; } = string.Empty;

    // Zaman Damgası
    public DateTime DetectedAt { get; set; }
    public DateTime? LastSeenAt { get; set; }
}

