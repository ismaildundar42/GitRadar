namespace GitRadar.Advisory.Abstractions.Models;

/// <summary>
/// Zafiyet istihbarat sağlayıcısına gönderilen paket sorgu modeli.
/// Değişmezdir (Immutable).
/// </summary>
public sealed record PackageQuery
{
    public string Ecosystem { get; init; }
    public string PackageName { get; init; }
    public string Version { get; init; }

    public PackageQuery(string ecosystem, string packageName, string version)
    {
        if (string.IsNullOrWhiteSpace(ecosystem))
            throw new ArgumentException("Ekosistem bilgisi boş olamaz.", nameof(ecosystem));

        if (string.IsNullOrWhiteSpace(packageName))
            throw new ArgumentException("Paket adı boş olamaz.", nameof(packageName));

        if (string.IsNullOrWhiteSpace(version))
            throw new ArgumentException("Paket sürümü boş olamaz.", nameof(version));

        Ecosystem = ecosystem.Trim();
        PackageName = packageName.Trim();
        Version = version.Trim();
    }

    public override string ToString() => $"{Ecosystem}:{PackageName}@{Version}";
}

