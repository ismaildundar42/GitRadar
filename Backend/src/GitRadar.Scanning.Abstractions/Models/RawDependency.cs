namespace GitRadar.Scanning.Abstractions.Models;

/// <summary>
/// Bir manifestodan tarayıcı tarafından çıkarılan ham bağımlılık modelidir.
/// Değişmezdir (Immutable).
/// </summary>
public sealed class RawDependency
{
    public string Name { get; }
    public string Version { get; }
    public ScannerEcosystem Ecosystem { get; }
    public string ManifestPath { get; }
    public DependencyRelationship Relationship { get; }
    public DependencyScope Scope { get; }
    public string? RequestedVersion { get; }
    public string? ResolvedVersion { get; }
    public string? PackageCoordinate { get; }

    public RawDependency(
        string name,
        string version,
        ScannerEcosystem ecosystem,
        string manifestPath,
        DependencyRelationship relationship = DependencyRelationship.Direct,
        DependencyScope scope = DependencyScope.Production,
        string? requestedVersion = null,
        string? resolvedVersion = null,
        string? packageCoordinate = null)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Bağımlılık paket adı boş olamaz.", nameof(name));

        if (string.IsNullOrWhiteSpace(version))
            throw new ArgumentException("Bağımlılık sürümü boş olamaz.", nameof(version));

        if (string.IsNullOrWhiteSpace(manifestPath))
            throw new ArgumentException("Manifest dosya yolu boş olamaz.", nameof(manifestPath));

        Name = name.Trim();
        Version = version.Trim();
        Ecosystem = ecosystem;
        ManifestPath = manifestPath.Trim().Replace('\\', '/');
        Relationship = relationship;
        Scope = scope;
        RequestedVersion = string.IsNullOrWhiteSpace(requestedVersion) ? null : requestedVersion.Trim();
        ResolvedVersion = string.IsNullOrWhiteSpace(resolvedVersion) ? null : resolvedVersion.Trim();
        PackageCoordinate = string.IsNullOrWhiteSpace(packageCoordinate) ? null : packageCoordinate.Trim();
    }

    public override string ToString() => $"[{Ecosystem}] {Name}@{Version} ({Relationship}, {Scope}) in {ManifestPath}";
}
