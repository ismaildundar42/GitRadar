using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanning.Core.Models;

namespace GitRadar.Scanning.Core.Orchestration;

/// <summary>
/// Keşfedilen manifestoları uygun tarayıcı sağlayıcılarına yönlendirerek
/// bağımlılık tarama sürecini koordine eden orkestratör sözleşmesidir.
/// </summary>
public interface IScannerOrchestrator
{
    /// <summary>
    /// Belirtilen manifestoları sırayla işler ve birleşik tarama sonucunu üretir.
    /// </summary>
    /// <param name="manifests">Taranacak manifest meta verileri koleksiyonu.</param>
    /// <param name="contentStreamProvider">Manifest için salt okunur Stream sağlayan asenkron delege.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Tüm manifestoların analizini içeren birleşik sonuç (AggregatedScanResult).</returns>
    Task<AggregatedScanResult> ExecuteScanAsync(
        IEnumerable<DiscoveredManifest> manifests,
        Func<DiscoveredManifest, CancellationToken, Task<Stream>> contentStreamProvider,
        CancellationToken cancellationToken = default);
}

