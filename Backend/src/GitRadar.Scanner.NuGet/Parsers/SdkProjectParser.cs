using System.Xml;
using System.Xml.Linq;
using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanner.NuGet.Models;

namespace GitRadar.Scanner.NuGet.Parsers;

/// <summary>
/// Modern SDK-style .csproj ve .vbproj proje dosyalarındaki açık PackageReference
/// tanımlarını güvenli şekilde ayrıştıran XML parser bileşenidir.
/// Durumsuzdur (Stateless) ve thread-safe'tir.
/// </summary>
public sealed class SdkProjectParser
{
    /// <summary>
    /// Güvenlik üst sınırı: 50 MB.
    /// </summary>
    public const long MaxManifestSizeBytes = 50 * 1024 * 1024;

    /// <summary>
    /// XML entity ve genişleme saldırılarını (Billion Laughs / XML Bomb) engellemek için azami karakter sınırı.
    /// </summary>
    public const long MaxCharactersInDocument = 10_000_000;

    /// <summary>
    /// Sürümü belirtilmemiş PackageReference kayıtları için kullanılan gösterge değeri.
    /// Yalnızca RawDependency.Version alanının boş olmama (non-empty) sözleşmesini karşılar; PURL içine dahil edilmez.
    /// </summary>
    public const string UnspecifiedVersion = "Unspecified";

    /// <summary>
    /// Akış üzerinden proje dosyasını güvenli XML kurallarıyla ayrıştırır.
    /// Gerçek fiziksel stream okumasında 50 MB sınırını zorunlu kılar.
    /// Opsiyonel olarak iletilen merkezi paket kataloğu (CPM) üzerinden sürümsüz paketleri çözümler.
    /// </summary>
    /// <param name="manifest">İncelenen manifest meta verisi.</param>
    /// <param name="contentStream">Salt okunur veri akışı. Çağırana aittir, kapatılmaz.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <param name="cpmCatalog">Varsa bu projeyle ilişkili en yakın Directory.Packages.props kataloğu.</param>
    /// <returns>Ayrıştırma sonucu ve teşhis kayıtları.</returns>
    public ScannerResult Parse(
        DiscoveredManifest manifest,
        Stream contentStream,
        CancellationToken cancellationToken,
        NugetCpmCatalog? cpmCatalog = null)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        ArgumentNullException.ThrowIfNull(contentStream);

        cancellationToken.ThrowIfCancellationRequested();

        // 1. Dosya Boyutu Ön Kontrolü (Metadata)
        if (manifest.SizeBytes > MaxManifestSizeBytes)
        {
            return ScannerResult.Failure(manifest, [
                ScannerDiagnostic.Error(
                    $"Manifest dosya boyutu ({manifest.SizeBytes:N0} bayt) izin verilen güvenli üst sınırı ({MaxManifestSizeBytes:N0} bayt) aşıyor.",
                    manifest.ManifestPath,
                    errorCode: "SIZE_LIMIT_EXCEEDED")
            ]);
        }

        var dependencies = new List<RawDependency>();
        var diagnostics = new List<ScannerDiagnostic>();
        var hasSkippedElements = false;

        // 2. Güvenli XML Ayarları (XXE & DTD Saldırılarını Engelleme)
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersInDocument = MaxCharactersInDocument,
            IgnoreWhitespace = true,
            IgnoreComments = true,
            CloseInput = false, // Çağıranın akışı kapatılmaz
            Async = false
        };

        try
        {
            // 3. Fiziksel Stream Bounded-Read Güvenliği (50 MB üst sınırı takibi)
            // BoundedReadStream, alttaki contentStream'i kesinlikle dispose etmez.
            using var boundedStream = new BoundedReadStream(contentStream, MaxManifestSizeBytes);
            using var xmlReader = XmlReader.Create(boundedStream, settings);
            var doc = XDocument.Load(xmlReader, LoadOptions.SetLineInfo);

            cancellationToken.ThrowIfCancellationRequested();

            // 4. PackageReference Öğelerini Keşfetme (Namespace bağımsız)
            var packageReferences = doc.Descendants()
                .Where(e => string.Equals(e.Name.LocalName, "PackageReference", StringComparison.OrdinalIgnoreCase))
                .ToList();

            foreach (var element in packageReferences)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var lineInfo = (IXmlLineInfo)element;
                var lineNumber = lineInfo.HasLineInfo() ? lineInfo.LineNumber : (int?)null;

                // A. Paket Adı (Include Özniteliği)
                var includeAttr = element.Attribute("Include") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "Include", StringComparison.OrdinalIgnoreCase));

                var packageName = includeAttr?.Value?.Trim();

                if (string.IsNullOrWhiteSpace(packageName))
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        "Manifest dosyasında 'Include' özniteliği bulunmayan veya boş olan bir PackageReference öğesi atlandı.",
                        manifest.ManifestPath,
                        lineNumber));
                    hasSkippedElements = true;
                    continue;
                }

                // B. Sürüm Bilgisi (VersionOverride veya Version Attribute / Child Element)
                var versionOverrideAttr = element.Attribute("VersionOverride") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "VersionOverride", StringComparison.OrdinalIgnoreCase));

                var versionOverrideChild = element.Elements()
                    .FirstOrDefault(e => string.Equals(e.Name.LocalName, "VersionOverride", StringComparison.OrdinalIgnoreCase));

                var rawVersionOverride = versionOverrideAttr?.Value?.Trim() ?? versionOverrideChild?.Value?.Trim();

                var versionAttr = element.Attribute("Version") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "Version", StringComparison.OrdinalIgnoreCase));

                var versionChild = element.Elements()
                    .FirstOrDefault(e => string.Equals(e.Name.LocalName, "Version", StringComparison.OrdinalIgnoreCase));

                var rawVersion = versionAttr?.Value?.Trim() ?? versionChild?.Value?.Trim();

                var isCpmEnabled = cpmCatalog is not null && cpmCatalog.State == CpmManagementState.Enabled;
                var hasExplicitVersion = !string.IsNullOrWhiteSpace(rawVersion);
                var hasVersionOverride = !string.IsNullOrWhiteSpace(rawVersionOverride);

                string effectiveVersion;
                string? requestedVersion;

                // 1. Durum: VersionOverride belirtilmişse
                if (hasVersionOverride)
                {
                    if (rawVersionOverride!.Contains("$("))
                    {
                        diagnostics.Add(ScannerDiagnostic.Info(
                            $"'{packageName}' paketinin VersionOverride değeri MSBuild özelliği ('{rawVersionOverride}') içeriyor; statik analiz kapsamında ham talep değeri kaydedildi.",
                            manifest.ManifestPath,
                            lineNumber));
                    }

                    if (isCpmEnabled)
                    {
                        // CPM etkin: VersionOverride merkezi sürümü geçersiz kılar
                        effectiveVersion = rawVersionOverride;
                        requestedVersion = rawVersionOverride;

                        // Hem Version hem VersionOverride birlikte tanımlanmışsa çelişki uyarısı
                        if (hasExplicitVersion)
                        {
                            diagnostics.Add(ScannerDiagnostic.Warning(
                                $"'{packageName}' paketi üzerinde hem 'Version' ('{rawVersion}') hem de 'VersionOverride' ('{rawVersionOverride}') öznitelikleri birlikte tanımlanmış; 'VersionOverride' değeri öncelikli kabul edildi.",
                                manifest.ManifestPath,
                                lineNumber));
                        }

                        diagnostics.Add(ScannerDiagnostic.Info(
                            $"'{packageName}' paketi için 'VersionOverride' ('{rawVersionOverride}') kullanıldı; merkezi paket sürümü geçersiz kılındı.",
                            manifest.ManifestPath,
                            lineNumber));
                    }
                    else
                    {
                        // CPM etkin değil (Disabled, Unspecified, Ambiguous veya cpmCatalog null)
                        if (hasExplicitVersion)
                        {
                            // Projede açık Version varsa o uygulanır; VersionOverride CPM olmadan geçersizdir
                            effectiveVersion = rawVersion!;
                            requestedVersion = rawVersion!;

                            if (rawVersion!.Contains("$("))
                            {
                                diagnostics.Add(ScannerDiagnostic.Info(
                                    $"'{packageName}' paketinin sürümü MSBuild özelliği ('{rawVersion}') içeriyor; statik analiz kapsamında özellik çözümlenmeden ham talep değeri kaydedildi.",
                                    manifest.ManifestPath,
                                    lineNumber));
                            }

                            diagnostics.Add(ScannerDiagnostic.Warning(
                                $"'{packageName}' paketi üzerinde 'VersionOverride' ('{rawVersionOverride}') tanımlanmış; ancak Merkezi Paket Yönetimi (CPM) etkinleştirilmediği için projedeki açık 'Version' ('{rawVersion}') uygulandı.",
                                manifest.ManifestPath,
                                lineNumber));
                        }
                        else
                        {
                            // Projede açık Version yok, yalnızca VersionOverride var ancak CPM etkin değil
                            effectiveVersion = UnspecifiedVersion;
                            requestedVersion = null;

                            diagnostics.Add(ScannerDiagnostic.Warning(
                                $"'{packageName}' paketi üzerinde 'VersionOverride' ('{rawVersionOverride}') tanımlanmış; ancak Merkezi Paket Yönetimi (CPM) etkinleştirilmediği (veya doğrulanamadığı) ve açık bir 'Version' bulunmadığı için sürüm uygulanamadı.",
                                manifest.ManifestPath,
                                lineNumber));
                        }
                    }
                }
                // 2. Durum: VersionOverride yok, projede açıkça Version belirtilmişse
                else if (hasExplicitVersion)
                {
                    effectiveVersion = rawVersion!;
                    requestedVersion = rawVersion!;

                    if (rawVersion!.Contains("$("))
                    {
                        diagnostics.Add(ScannerDiagnostic.Info(
                            $"'{packageName}' paketinin sürümü MSBuild özelliği ('{rawVersion}') içeriyor; statik analiz kapsamında özellik çözümlenmeden ham talep değeri kaydedildi.",
                            manifest.ManifestPath,
                            lineNumber));
                    }

                    // CPM etkin ve merkezi tanım mevcutsa çakışma uyarısı
                    if (isCpmEnabled && cpmCatalog!.TryGetSinglePackage(packageName, out var cpmEntry))
                    {
                        if (!string.Equals(rawVersion, cpmEntry.RawVersion, StringComparison.OrdinalIgnoreCase))
                        {
                            diagnostics.Add(ScannerDiagnostic.Warning(
                                $"'{packageName}' paketi için proje dosyasında açıkça belirtilen sürüm ('{rawVersion}') ile Directory.Packages.props dosyasındaki merkezi sürüm ('{cpmEntry.RawVersion}') çakışıyor; projedeki açık sürüm korundu.",
                                manifest.ManifestPath,
                                lineNumber));
                        }
                    }
                }
                // 3. Durum: Ne VersionOverride ne de açık Version var (CPM çözümlemesi)
                else
                {
                    if (cpmCatalog is not null)
                    {
                        if (cpmCatalog.State == CpmManagementState.Enabled)
                        {
                            if (cpmCatalog.TryGetSinglePackage(packageName, out var cpmEntry))
                            {
                                if (cpmEntry.IsStaticallyResolvable)
                                {
                                    effectiveVersion = cpmEntry.RawVersion;
                                    requestedVersion = cpmEntry.RawVersion;

                                    if (cpmEntry.HasCondition)
                                    {
                                        diagnostics.Add(ScannerDiagnostic.Warning(
                                            $"'{packageName}' paketi için uygulanan merkezi sürüm ('{cpmEntry.RawVersion}') Directory.Packages.props dosyasında bir koşula ('{cpmEntry.Condition}') bağlıdır; statik analiz kapsamında koşul değerlendirilmeden uygulandı.",
                                            manifest.ManifestPath,
                                            lineNumber));
                                    }
                                }
                                else
                                {
                                    effectiveVersion = UnspecifiedVersion;
                                    requestedVersion = null;

                                    diagnostics.Add(ScannerDiagnostic.Warning(
                                        $"'{packageName}' paketinin merkezi sürümü MSBuild özelliği ('{cpmEntry.RawVersion}') içerdiği ve statik olarak çözümlenemediği için uygulanamadı.",
                                        manifest.ManifestPath,
                                        lineNumber));
                                }
                            }
                            else if (cpmCatalog.HasConflict(packageName))
                            {
                                effectiveVersion = UnspecifiedVersion;
                                requestedVersion = null;

                                diagnostics.Add(ScannerDiagnostic.Warning(
                                    $"'{packageName}' paketi için Directory.Packages.props dosyasında birden fazla veya çakışan merkezi tanım bulunduğu için sürüm uygulanamadı.",
                                    manifest.ManifestPath,
                                    lineNumber));
                            }
                            else
                            {
                                effectiveVersion = UnspecifiedVersion;
                                requestedVersion = null;

                                diagnostics.Add(ScannerDiagnostic.Warning(
                                    $"'{packageName}' paketi için proje dosyasında sürüm belirtilmemiş ve en yakın Directory.Packages.props ({cpmCatalog.ManifestPath}) dosyasında geçerli bir PackageVersion tanımı bulunamadı.",
                                    manifest.ManifestPath,
                                    lineNumber));
                            }
                        }
                        else
                        {
                            effectiveVersion = UnspecifiedVersion;
                            requestedVersion = null;

                            if (cpmCatalog.State == CpmManagementState.Disabled)
                            {
                                diagnostics.Add(ScannerDiagnostic.Warning(
                                    $"'{packageName}' paketi için sürüm belirtilmemiş; en yakın Directory.Packages.props dosyasında Merkezi Paket Yönetimi açıkça devre dışı bırakılmış (ManagePackageVersionsCentrally=false).",
                                    manifest.ManifestPath,
                                    lineNumber));
                            }
                            else if (cpmCatalog.State == CpmManagementState.Unspecified)
                            {
                                diagnostics.Add(ScannerDiagnostic.Warning(
                                    $"'{packageName}' paketi için sürüm belirtilmemiş; en yakın Directory.Packages.props dosyasında ManagePackageVersionsCentrally özelliği tanımlanmamış.",
                                    manifest.ManifestPath,
                                    lineNumber));
                            }
                            else if (cpmCatalog.State == CpmManagementState.Ambiguous)
                            {
                                diagnostics.Add(ScannerDiagnostic.Warning(
                                    $"'{packageName}' paketi için sürüm belirtilmemiş; en yakın Directory.Packages.props dosyasındaki ManagePackageVersionsCentrally değeri ('{cpmCatalog.RawManagePackageVersionsCentrally}') belirsiz.",
                                    manifest.ManifestPath,
                                    lineNumber));
                            }
                        }
                    }
                    else
                    {
                        // cpmCatalog yoksa (tekil dosya tarama veya ilişkili props bulunamaması)
                        effectiveVersion = UnspecifiedVersion;
                        requestedVersion = null;

                        diagnostics.Add(ScannerDiagnostic.Warning(
                            $"'{packageName}' paketi için açık bir sürüm belirtilmemiş (Merkezi Paket Yönetimi / CPM kullanılıyor olabilir).",
                            manifest.ManifestPath,
                            lineNumber));
                    }
                }

                // C. Koşullu Bildirim Denetimi (Condition Attribute)
                var packageCondition = element.Attribute("Condition")?.Value;
                var itemGroupCondition = element.Parent is not null && string.Equals(element.Parent.Name.LocalName, "ItemGroup", StringComparison.OrdinalIgnoreCase)
                    ? element.Parent.Attribute("Condition")?.Value
                    : null;

                var activeCondition = !string.IsNullOrWhiteSpace(packageCondition) ? packageCondition.Trim() : itemGroupCondition?.Trim();

                if (!string.IsNullOrWhiteSpace(activeCondition))
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"'{packageName}' paket referansı üzerinde koşul ('{activeCondition}') tespit edildi; statik analiz kapsamında koşul değerlendirilmeden paket dahil edildi.",
                        manifest.ManifestPath,
                        lineNumber));
                }

                // D. PURL Formatı (PURL Spesifikasyonuna Tam Uyumlu)
                var packageUrl = BuildPackageUrl(packageName, requestedVersion);

                // E. RawDependency Nesnesini Oluşturma
                // Scope: Güvenilir bilgi olmadığı sürece kurallara uygun olarak Unknown atanır.
                // Relationship: Proje dosyasındaki doğrudan bildirim olduğu için Direct'tir.
                // ResolvedVersion: Lockfile olmaksızın çözümlenmiş sürüm iddia edilemez; kesinlikle null'dır.
                var dependency = new RawDependency(
                    name: packageName,
                    version: effectiveVersion,
                    ecosystem: ScannerEcosystem.NuGet,
                    manifestPath: manifest.ManifestPath,
                    relationship: DependencyRelationship.Direct,
                    scope: DependencyScope.Unknown,
                    requestedVersion: requestedVersion,
                    resolvedVersion: null,
                    packageCoordinate: packageUrl);

                dependencies.Add(dependency);
            }

            // Atlanan geçersiz kayıtlar varsa Partial, tüm kayıtlar başarıyla okunduysa Success dönülür.
            if (hasSkippedElements)
            {
                return ScannerResult.Partial(manifest, dependencies, diagnostics);
            }

            return ScannerResult.Success(manifest, dependencies, diagnostics);
        }
        catch (OperationCanceledException)
        {
            // İptal istisnası yukarıya fırlatılır; normal parse hatası gibi yutulmaz
            throw;
        }
        catch (MaxManifestSizeExceededException ex)
        {
            diagnostics.Add(ScannerDiagnostic.Error(
                $"Manifest dosya boyutu ({ex.BytesRead:N0} bayt) izin verilen güvenli üst sınırı ({ex.MaxBytes:N0} bayt) aşıyor.",
                manifest.ManifestPath,
                errorCode: "SIZE_LIMIT_EXCEEDED"));

            return ScannerResult.Failure(manifest, diagnostics);
        }
        catch (XmlException ex)
        {
            diagnostics.Add(ScannerDiagnostic.Error(
                $"Manifest XML biçimi geçersiz (satır {ex.LineNumber}, sütun {ex.LinePosition}).",
                manifest.ManifestPath,
                lineNumber: ex.LineNumber,
                errorCode: "XML_PARSE_ERROR"));

            return ScannerResult.Failure(manifest, diagnostics);
        }
        catch (Exception ex)
        {
            diagnostics.Add(ScannerDiagnostic.Error(
                $"Manifest ayrıştırılırken beklenmeyen bir hata oluştu ({ex.GetType().Name}).",
                manifest.ManifestPath,
                errorCode: ex.GetType().Name));

            return ScannerResult.Failure(manifest, diagnostics);
        }
    }

    /// <summary>
    /// Package URL (purl-spec) standardına uygun paket koordinatı üretir.
    /// Sürümü olmayan veya çözümlenmemiş MSBuild özelliği içeren paketlerde '@' ve sahte sürüm eklenmez.
    /// </summary>
    private static string BuildPackageUrl(string packageName, string? requestedVersion)
    {
        var encodedName = Uri.EscapeDataString(packageName);

        // Geçerli bir literal sürüm varsa @version eklenir.
        // Sürüm yoksa, "Unspecified" ise veya "$(Property)" gibi çözümlenmemiş MSBuild değişkeni içeriyorsa sürüm bileşeni eklenmez.
        if (!string.IsNullOrWhiteSpace(requestedVersion) &&
            !requestedVersion.Contains("$(") &&
            !string.Equals(requestedVersion, UnspecifiedVersion, StringComparison.OrdinalIgnoreCase))
        {
            var encodedVersion = Uri.EscapeDataString(requestedVersion);
            return $"pkg:nuget/{encodedName}@{encodedVersion}";
        }

        return $"pkg:nuget/{encodedName}";
    }
}
