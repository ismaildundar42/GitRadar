using System.Diagnostics.CodeAnalysis;
using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanning.Abstractions.Providers;

namespace GitRadar.Scanning.Core.Registry;

/// <summary>
/// Bağımlılık tarayıcı sağlayıcılarının (IScannerProvider) merkezi kayıt ve çözümleme bileşenidir.
/// Thread-safe ve değişmezdir (Immutable).
/// </summary>
public sealed class ScannerRegistry : IScannerRegistry
{
    private readonly IReadOnlyList<IScannerProvider> _providers;

    public IReadOnlyCollection<IScannerProvider> Providers => _providers;

    /// <summary>
    /// DI konteyneri veya doğrudan koleksiyon üzerinden gelen sağlayıcılarla registry oluşturur.
    /// </summary>
    /// <param name="providers">Kayıt edilecek tarayıcı sağlayıcıları koleksiyonu.</param>
    public ScannerRegistry(IEnumerable<IScannerProvider>? providers)
    {
        _providers = providers?.Where(p => p is not null).ToArray() ?? [];
    }

    /// <inheritdoc />
    public bool TryResolveProvider(
        DiscoveredManifest manifest,
        [NotNullWhen(true)] out IScannerProvider? provider,
        [NotNullWhen(false)] out string? failureReason)
    {
        ArgumentNullException.ThrowIfNull(manifest);

        var matchingProviders = new List<IScannerProvider>();
        var providerErrors = new List<string>();

        foreach (var p in _providers)
        {
            try
            {
                if (p.CanHandle(manifest))
                {
                    matchingProviders.Add(p);
                }
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                providerErrors.Add($"{p.GetType().Name} ({ex.GetType().Name})");
            }
        }

        if (providerErrors.Count > 0)
        {
            provider = null;
            var errorDetails = string.Join(", ", providerErrors);
            failureReason = $"'{manifest.ManifestPath}' manifestosu değerlendirilirken sağlayıcı hatası oluştu: {errorDetails}.";
            return false;
        }

        if (matchingProviders.Count == 0)
        {
            provider = null;
            failureReason = $"'{manifest.ManifestPath}' ({manifest.ManifestType}, {manifest.Ecosystem}) manifestosu için uygun bir tarayıcı sağlayıcısı bulunamadı.";
            return false;
        }

        if (matchingProviders.Count > 1)
        {
            provider = null;
            var providerNames = string.Join(", ", matchingProviders.Select(p => p.GetType().Name));
            failureReason = $"'{manifest.ManifestPath}' manifestosu birden fazla tarayıcı sağlayıcısı tarafından destekleniyor ({providerNames}). Belirsizlik nedeniyle sağlayıcı seçilemedi.";
            return false;
        }

        provider = matchingProviders[0];
        failureReason = null;
        return true;
    }

    /// <inheritdoc />
    public IScannerProvider GetProvider(DiscoveredManifest manifest)
    {
        if (!TryResolveProvider(manifest, out var provider, out var failureReason))
        {
            throw new InvalidOperationException(failureReason);
        }

        return provider;
    }
}

