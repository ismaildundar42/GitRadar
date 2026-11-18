using System.Diagnostics.CodeAnalysis;
using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanning.Abstractions.Providers;

namespace GitRadar.Scanning.Core.Registry;

/// <summary>
/// Kayıtlı bağımlılık tarayıcı sağlayıcılarını (IScannerProvider) yöneten
/// ve verilen manifestolar için uygun sağlayıcıyı çözümleyen sözleşmedir.
/// </summary>
public interface IScannerRegistry
{
    /// <summary>
    /// Kayıtlı tüm tarayıcı sağlayıcıları.
    /// </summary>
    IReadOnlyCollection<IScannerProvider> Providers { get; }

    /// <summary>
    /// Verilen manifest için uygun tarayıcı sağlayıcıyı bulmaya çalışır.
    /// Eşleşen sağlayıcı yoksa veya birden fazla sağlayıcı destekliyorsa false döner ve hata gerekçesini belirtir.
    /// </summary>
    /// <param name="manifest">İncelenecek manifest meta bilgisi.</param>
    /// <param name="provider">Eşleşen tekil sağlayıcı veya eşleşme sağlanamadığında null.</param>
    /// <param name="failureReason">Eşleşme sağlanamadığında veya belirsizlik (ambiguity) durumunda açıklayıcı hata mesajı.</param>
    /// <returns>Tekil ve kesin bir sağlayıcı bulunduysa true; aksi halde false.</returns>
    bool TryResolveProvider(
        DiscoveredManifest manifest,
        [NotNullWhen(true)] out IScannerProvider? provider,
        [NotNullWhen(false)] out string? failureReason);

    /// <summary>
    /// Verilen manifest için uygun tarayıcı sağlayıcıyı döndürür.
    /// Sağlayıcı bulunamazsa veya birden fazla sağlayıcı eşleşirse InvalidOperationException fırlatır.
    /// </summary>
    IScannerProvider GetProvider(DiscoveredManifest manifest);
}

