using GitRadar.Advisory.Abstractions.Models;

namespace GitRadar.Advisory.Abstractions;

/// <summary>
/// Zafiyet istihbarat sağlayıcıları için ortak istemci sözleşmesi.
/// CIS Controls v8 Safeguard 16.5 ve 16.6 gereksinimlerini karşılar.
/// </summary>
public interface IAdvisoryClient
{
    /// <summary>
    /// Sağlayıcının adı (ör. OSV.dev, GitHub Advisory, NVD).
    /// </summary>
    string ProviderName { get; }

    /// <summary>
    /// Belirtilen tekil paket ve sürüm için bilinen güvenlik açıklarını sorgular.
    /// </summary>
    /// <param name="query">Paket ve sürüm sorgu parametresi.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Zafiyet sorgu sonucu ve teşhis bilgisi.</returns>
    Task<AdvisoryQueryResult> QueryVulnerabilitiesAsync(PackageQuery query, CancellationToken cancellationToken);

    /// <summary>
    /// Birden fazla paket için toplu (batch) zafiyet sorgusu gerçekleştirir.
    /// </summary>
    /// <param name="queries">Sorgulanacak paketler listesi.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Paket bazında eşlenmiş zafiyet sorgu sonuçları sözlüğü.</returns>
    Task<IReadOnlyDictionary<PackageQuery, AdvisoryQueryResult>> QueryBatchAsync(IReadOnlyList<PackageQuery> queries, CancellationToken cancellationToken);
}

