using GitRadar.Scanning.Abstractions.Models;

namespace GitRadar.Scanning.Abstractions.Providers;

/// <summary>
/// Belirli bir teknoloji ekosistemine ait bağımlılık manifestolarını ayrıştıran
/// tarayıcı sağlayıcılarının (Scanner Providers) uygulaması gereken ortak sözleşmedir.
/// </summary>
public interface IScannerProvider
{
    /// <summary>
    /// Bu tarayıcının ait olduğu tip güvenli ekosistem kimliği (örn: NuGet, Npm, PyPI, Maven, ContainerImage).
    /// </summary>
    ScannerEcosystem Ecosystem { get; }

    /// <summary>
    /// Bu tarayıcının desteklediği bilgilendirici dosya adı desenleri (örn: "*.csproj", "packages.config", "Directory.Packages.props").
    /// Keşif motoru tarafından bilgilendirme ve ön filtreleme amacıyla kullanılır.
    /// </summary>
    IReadOnlyCollection<string> SupportedManifestPatterns { get; }

    /// <summary>
    /// Belirtilen manifestonun bu sağlayıcı tarafından analiz edilip edilemeyeceğini kesin olarak denetler.
    /// Yalnızca dosya uzantısına değil; manifestonun ManifestType, Ecosystem ve dosya adı kriterlerine göre nihai uygunluğu belirler.
    /// </summary>
    /// <param name="manifest">Keşfedilen manifest metadata bilgisi.</param>
    /// <returns>Tarayıcı bu manifestoyu analiz edebiliyorsa true, aksi halde false.</returns>
    bool CanHandle(DiscoveredManifest manifest);

    /// <summary>
    /// Manifest içeriğini salt okunur bir akış (Stream) üzerinden güvenli şekilde ayrıştırır.
    /// <para>
    /// <b>Stream Sahipliği Kuralı:</b>
    /// <paramref name="contentStream"/> parametresini açan ve sağlayan çağıran bileşen akışın mülkiyetini korur ve kapatmaktan (dispose) sorumludur.
    /// Bu metot kendisine iletilen <paramref name="contentStream"/> nesnesini kesinlikle kapatmamalı (dispose/close etmemeli)dir.
    /// Sağlayıcı yalnızca kendi içinde oluşturduğu yardımcı kaynakları (XmlReader, StreamReader vb.) dispose etmekle yükümlüdür.
    /// </para>
    /// </summary>
    /// <param name="manifest">Analiz edilen manifest metadatası.</param>
    /// <param name="contentStream">Manifest dosyasının salt okunur veri akışı. Çağıran tarafından yönetilir.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Tek bir manifestonun analiz sonucu, keşfedilen bağımlılıklar ve teşhis kayıtları.</returns>
    Task<ScannerResult> ScanAsync(DiscoveredManifest manifest, Stream contentStream, CancellationToken cancellationToken);
}
