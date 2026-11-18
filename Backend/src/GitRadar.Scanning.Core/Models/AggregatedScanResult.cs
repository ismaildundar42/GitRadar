using GitRadar.Scanning.Abstractions.Models;

namespace GitRadar.Scanning.Core.Models;

/// <summary>
/// Bir tarama çalıştırmasında işlenen tüm manifest sonuçlarını, keşfedilen paketleri ve teşhis kayıtlarını
/// konsolide eden değişmez (Immutable) birleşik tarama sonucu modelidir.
/// </summary>
public sealed class AggregatedScanResult
{
    private readonly List<ScannerResult> _manifestResults;
    private readonly List<RawDependency> _dependencies;
    private readonly List<ScannerDiagnostic> _diagnostics;

    /// <summary>
    /// Birleşik taramanın genel başarı durumu.
    /// </summary>
    public ScannerStatus Status { get; }

    /// <summary>
    /// İşlenen her bir manifestoya ait tekil tarama sonuçları.
    /// </summary>
    public IReadOnlyList<ScannerResult> ManifestResults => _manifestResults.AsReadOnly();

    /// <summary>
    /// Tüm manifestolardan keşfedilen bağımlılıkların birleşik listesi.
    /// Farklı manifestolarda aynı paket yer alabileceğinden bağlamı korumak adına gereksiz birleştirme yapılmaz.
    /// </summary>
    public IReadOnlyList<RawDependency> Dependencies => _dependencies.AsReadOnly();

    /// <summary>
    /// Tüm manifestolardan ve orkestrasyon sürecinden toplanan teşhis kayıtları.
    /// </summary>
    public IReadOnlyList<ScannerDiagnostic> Diagnostics => _diagnostics.AsReadOnly();

    public int TotalManifestCount => _manifestResults.Count;
    public int SuccessfulManifestCount { get; }
    public int PartialManifestCount { get; }
    public int FailedManifestCount { get; }

    public bool HasErrors => _diagnostics.Any(d => d.Severity == DiagnosticSeverity.Error);
    public bool HasWarnings => _diagnostics.Any(d => d.Severity == DiagnosticSeverity.Warning);

    public AggregatedScanResult(
        IEnumerable<ScannerResult>? manifestResults,
        IEnumerable<ScannerDiagnostic>? additionalDiagnostics = null)
    {
        _manifestResults = manifestResults?.Where(r => r is not null).ToList() ?? [];
        _dependencies = _manifestResults.SelectMany(r => r.Dependencies).ToList();

        var combinedDiagnostics = _manifestResults.SelectMany(r => r.Diagnostics).ToList();
        if (additionalDiagnostics is not null)
        {
            combinedDiagnostics.AddRange(additionalDiagnostics.Where(d => d is not null));
        }
        _diagnostics = combinedDiagnostics;

        SuccessfulManifestCount = _manifestResults.Count(r => r.Status == ScannerStatus.Success);
        PartialManifestCount = _manifestResults.Count(r => r.Status == ScannerStatus.Partial);
        FailedManifestCount = _manifestResults.Count(r => r.Status == ScannerStatus.Failed);

        Status = DetermineOverallStatus(_manifestResults, ref _diagnostics);
    }

    /// <summary>
    /// Taranacak hiçbir manifest bulunamadığı durumlar için başarısız (Failed) statüsünde bir sonuç üretir.
    /// Boş depo veya manifest eksikliği sessizce başarılı kabul edilmez.
    /// </summary>
    public static AggregatedScanResult Empty(string reason = "Taranacak herhangi bir manifest dosyası bulunamadı.")
    {
        var diagnostic = ScannerDiagnostic.Warning(reason);
        return new AggregatedScanResult([], [diagnostic]);
    }

    private static ScannerStatus DetermineOverallStatus(
        IReadOnlyList<ScannerResult> results,
        ref List<ScannerDiagnostic> diagnostics)
    {
        // Kural: Manifest listesi boşsa sessizce başarılı kabul edilemez.
        if (results.Count == 0)
        {
            if (diagnostics.Count == 0)
            {
                diagnostics.Add(ScannerDiagnostic.Warning("Tarama için hiçbir manifest dosyası sunulmadı."));
            }
            return ScannerStatus.Failed;
        }

        var successfulCount = results.Count(r => r.Status == ScannerStatus.Success);
        var partialCount = results.Count(r => r.Status == ScannerStatus.Partial);
        var failedCount = results.Count(r => r.Status == ScannerStatus.Failed);

        // Kural: İşlenen manifestlerin tamamı başarısızsa -> Failed
        if (failedCount == results.Count)
        {
            return ScannerStatus.Failed;
        }

        // Kural: Bütün manifestler eksiksiz başarılıysa -> Success
        if (successfulCount == results.Count)
        {
            return ScannerStatus.Success;
        }

        // Kural: En az bir manifest başarılı veya kısmi sonuç üretmiş, ancak tümü başarılı değilse -> Partial
        return ScannerStatus.Partial;
    }

    public override string ToString() =>
        $"[Scan: {Status}] Manifests: {TotalManifestCount} (S: {SuccessfulManifestCount}, P: {PartialManifestCount}, F: {FailedManifestCount}), Dependencies: {_dependencies.Count}, Diagnostics: {_diagnostics.Count}";
}

