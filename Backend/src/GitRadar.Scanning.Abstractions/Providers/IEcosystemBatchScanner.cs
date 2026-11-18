using GitRadar.Scanning.Abstractions.Models;

namespace GitRadar.Scanning.Abstractions.Providers;

/// <summary>
/// Birden fazla manifestoyu birlikte değerlendirebilen (örn. Central Package Management veya monorepo workspace)
/// ekosistem tarayıcı sağlayıcılarının uygulayabileceği opsiyonel toplu tarama sözleşmesidir.
/// </summary>
public interface IEcosystemBatchScanner : IScannerProvider
{
    /// <summary>
    /// Belirtilen ekosisteme ait manifestoları toplu olarak ve aralarındaki hiyerarşik bağlamı dikkate alarak ayrıştırır.
    /// <para>
    /// <b>Stream Sahipliği ve Yaşam Döngüsü Sözleşmesi:</b>
    /// <list type="bullet">
    /// <item><description>Stream'i açan ve dispose eden taraf çağıran orkestratördür (Orchestrator).</description></item>
    /// <item><description>Sağlayıcı (Provider) kendisine sağlanan içerik akışını kesinlikle kapatmamalı (dispose/close etmemeli)dir.</description></item>
    /// <item><description>Sağlayıcı, mevcut bir stream'i tamamen tüketmeden veya artık kullanmayacak duruma getirmeden yeni bir stream talep etmemelidir (Ardışık/sıralı tüketim).</description></item>
    /// <item><description>Orchestrator sistem kaynaklarını korumak amacıyla yeni bir stream talebi geldiğinde önceki aktif stream'i kapatabilir.</description></item>
    /// <item><description>Birden fazla stream'in aynı anda eşzamanlı açık tutulması desteklenmez.</description></item>
    /// </list>
    /// </para>
    /// </summary>
    /// <param name="manifests">Aynı ekosisteme ait taranacak manifestolar listesi.</param>
    /// <param name="contentStreamProvider">Manifest içeriğini açan akış sağlayıcı delege.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Taranan her bir manifestoya ait tarama sonuçları koleksiyonu.</returns>
    Task<IReadOnlyList<ScannerResult>> ScanBatchAsync(
        IReadOnlyList<DiscoveredManifest> manifests,
        Func<DiscoveredManifest, CancellationToken, Task<Stream>> contentStreamProvider,
        CancellationToken cancellationToken);
}

