using System.Diagnostics.CodeAnalysis;
using GitRadar.Scanning.Abstractions.Models;

namespace GitRadar.Scanner.NuGet.Models;

/// <summary>
/// Tek bir Directory.Packages.props dosyasından ayrıştırılan merkezi paket tanımlarını,
/// CPM etkinlik durumunu ve ayrıştırma teşhis kayıtlarını saklayan modeldir.
/// Değişmezdir (Immutable) ve paket kimliklerini büyük/küçük harf duyarsız (OrdinalIgnoreCase) eşleştirir.
/// </summary>
public sealed class NugetCpmCatalog
{
    private readonly Dictionary<string, IReadOnlyList<NugetCpmPackageEntry>> _entries;
    private readonly List<ScannerDiagnostic> _diagnostics;

    /// <summary>
    /// Bu kataloğun ait olduğu Directory.Packages.props dosyasının normalize edilmiş yolu.
    /// </summary>
    public string ManifestPath { get; }

    /// <summary>
    /// Manifestonun ayrıştırma durumu (Success, Partial, Failed).
    /// </summary>
    public ScannerStatus Status { get; }

    /// <summary>
    /// CPM özelliğinin etkinlik durumu (Enabled, Disabled, Unspecified, Ambiguous).
    /// </summary>
    public CpmManagementState State { get; }

    /// <summary>
    /// XML manifestodaki ManagePackageVersionsCentrally öğesinden okunan ham metin (varsa).
    /// </summary>
    public string? RawManagePackageVersionsCentrally { get; }

    /// <summary>
    /// Ayrıştırma ve katalog oluşturma sürecinde toplanan teşhis kayıtları.
    /// </summary>
    public IReadOnlyCollection<ScannerDiagnostic> Diagnostics => _diagnostics.AsReadOnly();

    /// <summary>
    /// Büyük/küçük harf duyarsız paket kimliği ile indekslenmiş tüm merkezi sürüm tanımları sözlüğü.
    /// </summary>
    public IReadOnlyDictionary<string, IReadOnlyList<NugetCpmPackageEntry>> Entries => _entries;

    public bool HasErrors => _diagnostics.Any(d => d.Severity == DiagnosticSeverity.Error);
    public bool HasWarnings => _diagnostics.Any(d => d.Severity == DiagnosticSeverity.Warning);

    public int TotalUniquePackagesCount => _entries.Count;
    public int TotalDefinitionsCount => _entries.Values.Sum(list => list.Count);

    public NugetCpmCatalog(
        string manifestPath,
        ScannerStatus status,
        CpmManagementState state,
        string? rawManagePackageVersionsCentrally,
        IDictionary<string, List<NugetCpmPackageEntry>>? entries,
        IEnumerable<ScannerDiagnostic>? diagnostics)
    {
        if (string.IsNullOrWhiteSpace(manifestPath))
            throw new ArgumentException("Manifest dosya yolu boş olamaz.", nameof(manifestPath));

        ManifestPath = manifestPath.Trim().Replace('\\', '/');
        Status = status;
        State = state;
        RawManagePackageVersionsCentrally = string.IsNullOrWhiteSpace(rawManagePackageVersionsCentrally)
            ? null
            : rawManagePackageVersionsCentrally.Trim();

        _entries = new Dictionary<string, IReadOnlyList<NugetCpmPackageEntry>>(StringComparer.OrdinalIgnoreCase);
        if (entries is not null)
        {
            foreach (var kvp in entries)
            {
                _entries[kvp.Key] = kvp.Value.AsReadOnly();
            }
        }

        _diagnostics = diagnostics?.Where(d => d is not null).ToList() ?? [];
    }

    /// <summary>
    /// Belirtilen paket kimliğinin katalogda bulunup bulunmadığını denetler (OrdinalIgnoreCase).
    /// </summary>
    public bool ContainsPackage(string packageId)
    {
        if (string.IsNullOrWhiteSpace(packageId))
            return false;

        return _entries.ContainsKey(packageId.Trim());
    }

    /// <summary>
    /// Belirtilen paket için birden fazla sürüm tanımı (çakışma/koşul belirsizliği) olup olmadığını belirtir.
    /// </summary>
    public bool HasConflict(string packageId)
    {
        if (string.IsNullOrWhiteSpace(packageId))
            return false;

        return _entries.TryGetValue(packageId.Trim(), out var list) && list.Count > 1;
    }

    /// <summary>
    /// Belirtilen pakete ait tüm merkezi sürüm tanımlarını döndürür.
    /// Paket bulunamazsa null ve false döndürür.
    /// </summary>
    public bool TryGetEntries(
        string packageId,
        [NotNullWhen(true)] out IReadOnlyList<NugetCpmPackageEntry>? entries)
    {
        if (string.IsNullOrWhiteSpace(packageId))
        {
            entries = null;
            return false;
        }

        return _entries.TryGetValue(packageId.Trim(), out entries);
    }

    /// <summary>
    /// Belirtilen paket için TEK ve çakışmasız bir merkezi sürüm kaydı varsa döndürür.
    /// Paket hiç tanımlanmamışsa veya birden fazla çakışan tanım içeriyorsa false döner.
    /// </summary>
    public bool TryGetSinglePackage(
        string packageId,
        [NotNullWhen(true)] out NugetCpmPackageEntry? entry)
    {
        if (string.IsNullOrWhiteSpace(packageId))
        {
            entry = null;
            return false;
        }

        if (_entries.TryGetValue(packageId.Trim(), out var list) && list.Count == 1)
        {
            entry = list[0];
            return true;
        }

        entry = null;
        return false;
    }

    /// <summary>
    /// Ayrıştırma başarısız olduğunda (boyut aşımı, XML arızası vb.) bir Failure kataloğu oluşturur.
    /// </summary>
    public static NugetCpmCatalog Failed(string manifestPath, IEnumerable<ScannerDiagnostic> diagnostics)
    {
        return new NugetCpmCatalog(
            manifestPath,
            ScannerStatus.Failed,
            CpmManagementState.Unspecified,
            rawManagePackageVersionsCentrally: null,
            entries: null,
            diagnostics: diagnostics);
    }

    public override string ToString() =>
        $"[CPM {State}] {ManifestPath}: {TotalUniquePackagesCount} packages ({TotalDefinitionsCount} definitions, {Status})";
}

