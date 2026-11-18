using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanning.Abstractions.Providers;
using GitRadar.Scanning.Core.Models;
using GitRadar.Scanning.Core.Registry;

namespace GitRadar.Scanning.Core.Orchestration;

/// <summary>
/// Manifest akışlarını yöneten, her manifestoyu ilgili IScannerProvider implementasyonuna yönlendiren,
/// hataları izole eden ve birleşik tarama sonucunu (AggregatedScanResult) oluşturan ana orkestratördür.
/// </summary>
public sealed class ScannerOrchestrator : IScannerOrchestrator
{
    /// <summary>
    /// Güvenlik amacıyla varsayılan maksimum tekil manifest boyutu (50 MB).
    /// </summary>
    public const long DefaultMaxManifestSizeBytes = 50 * 1024 * 1024;

    private readonly IScannerRegistry _registry;
    private readonly long _maxManifestSizeBytes;

    public ScannerOrchestrator(
        IScannerRegistry registry,
        long maxManifestSizeBytes = DefaultMaxManifestSizeBytes)
    {
        ArgumentNullException.ThrowIfNull(registry);

        if (maxManifestSizeBytes <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxManifestSizeBytes), "Maksimum manifest boyutu pozitif bir değer olmalıdır.");

        _registry = registry;
        _maxManifestSizeBytes = maxManifestSizeBytes;
    }

    /// <inheritdoc />
    public async Task<AggregatedScanResult> ExecuteScanAsync(
        IEnumerable<DiscoveredManifest> manifests,
        Func<DiscoveredManifest, CancellationToken, Task<Stream>> contentStreamProvider,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(manifests);
        ArgumentNullException.ThrowIfNull(contentStreamProvider);

        var manifestList = manifests.Where(m => m is not null).ToList();

        // Kural: Manifest listesi boşsa sessizce başarılı kabul edilmez.
        if (manifestList.Count == 0)
        {
            return AggregatedScanResult.Empty("Taranacak herhangi bir manifest dosyası sunulmadı.");
        }

        var resultsByManifest = new Dictionary<DiscoveredManifest, ScannerResult>();
        var manifestsByProvider = new Dictionary<IScannerProvider, List<DiscoveredManifest>>();

        // 1. Aşama: Boyut üst sınırı ve Provider çözümleme denetimi
        foreach (var manifest in manifestList)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (manifest.SizeBytes > _maxManifestSizeBytes)
            {
                resultsByManifest[manifest] = ScannerResult.Failure(manifest, [
                    ScannerDiagnostic.Error(
                        $"Manifest dosya boyutu ({manifest.SizeBytes:N0} bayt) izin verilen güvenli üst sınırı ({_maxManifestSizeBytes:N0} bayt) aşıyor.",
                        manifest.ManifestPath)
                ]);
                continue;
            }

            if (!_registry.TryResolveProvider(manifest, out var provider, out var failureReason))
            {
                resultsByManifest[manifest] = ScannerResult.Failure(manifest, [
                    ScannerDiagnostic.Error(failureReason, manifest.ManifestPath)
                ]);
                continue;
            }

            if (!manifestsByProvider.TryGetValue(provider, out var list))
            {
                list = [];
                manifestsByProvider[provider] = list;
            }

            list.Add(manifest);
        }

        // 2. Aşama: Provider türüne göre toplu (Batch) veya tekil tarama yürütme
        foreach (var (provider, providerManifests) in manifestsByProvider)
        {
            cancellationToken.ThrowIfCancellationRequested();

            if (provider is IEcosystemBatchScanner batchScanner)
            {
                await ProcessBatchManifestsAsync(batchScanner, providerManifests, contentStreamProvider, resultsByManifest, cancellationToken).ConfigureAwait(false);
            }
            else
            {
                foreach (var manifest in providerManifests)
                {
                    cancellationToken.ThrowIfCancellationRequested();

                    var result = await ProcessSingleManifestCoreAsync(provider, manifest, contentStreamProvider, cancellationToken).ConfigureAwait(false);
                    resultsByManifest[manifest] = result;
                }
            }
        }

        var orderedResults = manifestList.Select(m => resultsByManifest[m]).ToList();
        return new AggregatedScanResult(orderedResults);
    }

    private async Task ProcessBatchManifestsAsync(
        IEcosystemBatchScanner batchScanner,
        IReadOnlyList<DiscoveredManifest> batchManifests,
        Func<DiscoveredManifest, CancellationToken, Task<Stream>> contentStreamProvider,
        Dictionary<DiscoveredManifest, ScannerResult> resultsByManifest,
        CancellationToken cancellationToken)
    {
        var openedStreams = new HashSet<Stream>();
        Stream? activeStream = null;

        // Stream Sahipliği Kuralı: Orchestrator açtığı her akışın mülkiyetini korur ve iş bittiğinde kapatır.
        // Provider kendisine iletilen akışı kesinlikle kapatmaz.
        Func<DiscoveredManifest, CancellationToken, Task<Stream>> safeStreamProvider = async (m, ct) =>
        {
            // Önceki açık akış varsa sonlandırarak sistem kaynaklarını koru
            if (activeStream is not null)
            {
                try
                {
                    await activeStream.DisposeAsync().ConfigureAwait(false);
                }
                catch
                {
                    // Dispose istisnaları yutulur
                }
                openedStreams.Remove(activeStream);
                activeStream = null;
            }

            Stream stream;
            try
            {
                stream = await contentStreamProvider(m, ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Manifest içerik akışı alınırken hata oluştu ({ex.GetType().Name}).", ex);
            }

            if (stream is not null)
            {
                activeStream = stream;
                openedStreams.Add(stream);
            }

            return stream!;
        };

        try
        {
            IReadOnlyList<ScannerResult> batchResults;
            try
            {
                batchResults = await batchScanner.ScanBatchAsync(batchManifests, safeStreamProvider, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Toplu tarayıcıdaki beklenmeyen hata durumunda ilgili manifestolar güvenle hata durumuna geçirilir
                foreach (var m in batchManifests)
                {
                    resultsByManifest[m] = ScannerResult.Failure(m, [
                        ScannerDiagnostic.Error(
                            $"Toplu tarayıcı yürütülürken beklenmeyen bir hata oluştu ({ex.GetType().Name}).",
                            m.ManifestPath,
                            errorCode: ex.GetType().Name)
                    ]);
                }
                return;
            }

            var resultMap = batchResults.Where(r => r is not null).ToDictionary(r => r.Manifest, r => r);

            foreach (var m in batchManifests)
            {
                if (resultMap.TryGetValue(m, out var res))
                {
                    resultsByManifest[m] = res;
                }
                else
                {
                    resultsByManifest[m] = ScannerResult.Failure(m, [
                        ScannerDiagnostic.Error("Toplu tarama sonucunda bu manifestoya ait sonuç kaydı üretilmedi.", m.ManifestPath)
                    ]);
                }
            }
        }
        finally
        {
            // Batch çağrısı bittiğinde açılmış olan tüm akışlar eksiksiz kapatılır
            foreach (var s in openedStreams)
            {
                try
                {
                    await s.DisposeAsync().ConfigureAwait(false);
                }
                catch
                {
                    // Dispose istisnaları yutulur
                }
            }
        }
    }

    private async Task<ScannerResult> ProcessSingleManifestCoreAsync(
        IScannerProvider provider,
        DiscoveredManifest manifest,
        Func<DiscoveredManifest, CancellationToken, Task<Stream>> contentStreamProvider,
        CancellationToken cancellationToken)
    {
        Stream? contentStream = null;
        try
        {
            try
            {
                contentStream = await contentStreamProvider(manifest, cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                return ScannerResult.Failure(manifest, [
                    ScannerDiagnostic.Error(
                        $"Manifest içerik akışı alınırken hata oluştu ({ex.GetType().Name}).",
                        manifest.ManifestPath,
                        errorCode: ex.GetType().Name)
                ]);
            }

            if (contentStream is null)
            {
                return ScannerResult.Failure(manifest, [
                    ScannerDiagnostic.Error("Manifest içerik akışı sağlanamadı (akış boş/null döndü).", manifest.ManifestPath)
                ]);
            }

            // Sağlayıcıya akışı devret (Stream sağlayıcı tarafından kapatılmaz, sözleşme kuralı)
            return await provider.ScanAsync(manifest, contentStream, cancellationToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            return ScannerResult.Failure(manifest, [
                ScannerDiagnostic.Error(
                    $"Manifest ayrıştırılırken beklenmeyen bir sağlayıcı hatası oluştu ({ex.GetType().Name}).",
                    manifest.ManifestPath,
                    errorCode: ex.GetType().Name)
            ]);
        }
        finally
        {
            if (contentStream is not null)
            {
                await contentStream.DisposeAsync().ConfigureAwait(false);
            }
        }
    }
}

