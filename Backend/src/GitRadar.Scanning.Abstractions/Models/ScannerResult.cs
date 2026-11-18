namespace GitRadar.Scanning.Abstractions.Models;

/// <summary>
/// Tek bir manifest dosyasının analiz sonucunu temsil eden ortak taşıma modelidir.
/// Değişmezdir (Immutable).
/// </summary>
public sealed class ScannerResult
{
    private readonly List<RawDependency> _dependencies;
    private readonly List<ScannerDiagnostic> _diagnostics;

    public DiscoveredManifest Manifest { get; }

    /// <summary>
    /// Bu manifestonun analiz durumu (Success, Partial, Failed).
    /// </summary>
    public ScannerStatus Status { get; }

    public IReadOnlyCollection<RawDependency> Dependencies => _dependencies.AsReadOnly();
    public IReadOnlyCollection<ScannerDiagnostic> Diagnostics => _diagnostics.AsReadOnly();

    public bool HasErrors => _diagnostics.Any(d => d.Severity == DiagnosticSeverity.Error);
    public bool HasWarnings => _diagnostics.Any(d => d.Severity == DiagnosticSeverity.Warning);

    public IReadOnlyCollection<ScannerDiagnostic> Errors =>
        _diagnostics.Where(d => d.Severity == DiagnosticSeverity.Error).ToList().AsReadOnly();

    public IReadOnlyCollection<ScannerDiagnostic> Warnings =>
        _diagnostics.Where(d => d.Severity == DiagnosticSeverity.Warning).ToList().AsReadOnly();

    public ScannerResult(
        DiscoveredManifest manifest,
        ScannerStatus status,
        IEnumerable<RawDependency>? dependencies = null,
        IEnumerable<ScannerDiagnostic>? diagnostics = null)
    {
        ArgumentNullException.ThrowIfNull(manifest);

        Manifest = manifest;
        Status = status;
        _dependencies = dependencies?.ToList() ?? [];
        _diagnostics = diagnostics?.ToList() ?? [];
    }

    /// <summary>
    /// Manifestonun başarıyla analiz edildiğini belirtir.
    /// Sıfır bağımlılık bulunması da geçerli bir Success sonucudur (örn. henüz paket referansı eklenmemiş bir proje).
    /// Uyarı (Warning) bulunması tek başına durumu Partial yapmaz; manifest eksiksiz taranmışsa durum Success kalır.
    /// </summary>
    public static ScannerResult Success(
        DiscoveredManifest manifest,
        IEnumerable<RawDependency> dependencies,
        IEnumerable<ScannerDiagnostic>? warnings = null)
    {
        return new ScannerResult(manifest, ScannerStatus.Success, dependencies, warnings);
    }

    /// <summary>
    /// Manifestonun kısmen ayrıştırıldığını belirtir.
    /// Bazı bağımlılıklar başarıyla çıkarılmıştır; ancak dosya boyutu/satır sınırı veya kısmi sözdizimi arızası
    /// nedeniyle manifestonun tamamı taranamamıştır (eksik/kısmi analiz).
    /// </summary>
    public static ScannerResult Partial(
        DiscoveredManifest manifest,
        IEnumerable<RawDependency> dependencies,
        IEnumerable<ScannerDiagnostic> diagnostics)
    {
        return new ScannerResult(manifest, ScannerStatus.Partial, dependencies, diagnostics);
    }

    /// <summary>
    /// Manifestonun format bozukluğu, okuma hatası veya kritik arıza nedeniyle analiz edilemediğini belirtir.
    /// Kullanılabilir hiçbir analiz sonucu üretilememiştir.
    /// </summary>
    public static ScannerResult Failure(
        DiscoveredManifest manifest,
        IEnumerable<ScannerDiagnostic> diagnostics)
    {
        return new ScannerResult(manifest, ScannerStatus.Failed, dependencies: null, diagnostics);
    }
}
