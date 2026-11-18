using System.Xml;
using System.Xml.Linq;
using GitRadar.Scanning.Abstractions.Models;

namespace GitRadar.Scanner.NuGet.Parsers;

/// <summary>
/// Klasik NuGet packages.config manifest dosyalarını güvenli XML kuralları ve bayt sınırları ile ayrıştıran parser bileşenidir.
/// Durumsuzdur (Stateless) ve thread-safe'tir.
/// </summary>
public sealed class PackagesConfigParser
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
    /// Akış üzerinden packages.config dosyasını güvenli XML kurallarıyla ayrıştırır.
    /// Gerçek fiziksel stream okumasında 50 MB sınırını zorunlu kılar.
    /// </summary>
    /// <param name="manifest">İncelenen manifest meta verisi.</param>
    /// <param name="contentStream">Salt okunur veri akışı. Çağırana aittir, kapatılmaz.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Ayrıştırma sonucu, keşfedilen bağımlılıklar ve teşhis kayıtları.</returns>
    public ScannerResult Parse(DiscoveredManifest manifest, Stream contentStream, CancellationToken cancellationToken)
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
            using var boundedStream = new BoundedReadStream(contentStream, MaxManifestSizeBytes);
            using var xmlReader = XmlReader.Create(boundedStream, settings);
            var doc = XDocument.Load(xmlReader, LoadOptions.SetLineInfo);

            cancellationToken.ThrowIfCancellationRequested();

            // 4. Kök Öğe Denetimi
            var root = doc.Root;
            if (root is null)
            {
                diagnostics.Add(ScannerDiagnostic.Error(
                    "Manifest XML biçimi geçersiz (kök XML öğesi bulunamadı).",
                    manifest.ManifestPath,
                    errorCode: "XML_PARSE_ERROR"));

                return ScannerResult.Failure(manifest, diagnostics);
            }

            if (!string.Equals(root.Name.LocalName, "packages", StringComparison.OrdinalIgnoreCase))
            {
                var lineInfo = (IXmlLineInfo)root;
                var lineNumber = lineInfo.HasLineInfo() ? lineInfo.LineNumber : (int?)null;

                diagnostics.Add(ScannerDiagnostic.Error(
                    $"packages.config dosyasının kök XML öğesi 'packages' olarak bekleniyordu; ancak '{root.Name.LocalName}' tespit edildi.",
                    manifest.ManifestPath,
                    lineNumber: lineNumber,
                    errorCode: "INVALID_ROOT_ELEMENT"));

                return ScannerResult.Failure(manifest, diagnostics);
            }

            // 5. Paket Kayıtlarının Tespiti (<package id="..." version="..." />)
            var packageElements = doc.Descendants()
                .Where(e => string.Equals(e.Name.LocalName, "package", StringComparison.OrdinalIgnoreCase))
                .ToList();

            // Yinelenen ve çakışan paket kayıtlarını takip etmek için yerel harita
            var seenPackages = new Dictionary<string, List<(string Version, int? LineNumber)>>(StringComparer.OrdinalIgnoreCase);

            foreach (var element in packageElements)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var lineInfo = (IXmlLineInfo)element;
                var lineNumber = lineInfo.HasLineInfo() ? lineInfo.LineNumber : (int?)null;

                // A. Paket Kimliği (id özniteliği)
                var idAttr = element.Attribute("id") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "id", StringComparison.OrdinalIgnoreCase));

                var packageId = idAttr?.Value?.Trim();

                if (string.IsNullOrWhiteSpace(packageId))
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        "Manifest dosyasında 'id' özniteliği bulunmayan veya boş olan bir package kaydı atlandı.",
                        manifest.ManifestPath,
                        lineNumber));
                    hasSkippedElements = true;
                    continue;
                }

                // B. Sürüm Bilgisi (version özniteliği)
                var versionAttr = element.Attribute("version") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "version", StringComparison.OrdinalIgnoreCase));

                var version = versionAttr?.Value?.Trim();

                if (string.IsNullOrWhiteSpace(version))
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"'{packageId}' paketi için 'version' özniteliği bulunmayan veya boş olan bir package kaydı atlandı.",
                        manifest.ManifestPath,
                        lineNumber));
                    hasSkippedElements = true;
                    continue;
                }

                // C. targetFramework Özniteliği
                var tfmAttr = element.Attribute("targetFramework") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "targetFramework", StringComparison.OrdinalIgnoreCase));

                var targetFramework = tfmAttr?.Value?.Trim();

                // D. developmentDependency Özniteliği
                var devDepAttr = element.Attribute("developmentDependency") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "developmentDependency", StringComparison.OrdinalIgnoreCase));

                var isDevDep = string.Equals(devDepAttr?.Value?.Trim(), "true", StringComparison.OrdinalIgnoreCase);

                if (devDepAttr is not null && isDevDep)
                {
                    diagnostics.Add(ScannerDiagnostic.Info(
                        $"'{packageId}' paketi üzerinde 'developmentDependency=\"true\"' niteliği tespit edildi; paketleme düzeyindeki bu niteleyici mevcut sözleşmede Scope alanına doğrudan eşlenmemiş, bilgi kaybı oluşmaması için tanı kaydı olarak bildirilmiştir.",
                        manifest.ManifestPath,
                        lineNumber));
                }

                // E. Tekrarlanan ve Çelişkili Kayıt Denetimi
                if (seenPackages.TryGetValue(packageId, out var existingList))
                {
                    var isConflicting = existingList.Any(e => !string.Equals(e.Version, version, StringComparison.OrdinalIgnoreCase));
                    if (isConflicting)
                    {
                        var previousVersions = string.Join(", ", existingList.Select(e => $"'{e.Version}'"));
                        diagnostics.Add(ScannerDiagnostic.Warning(
                            $"'{packageId}' paketi için packages.config manifestosunda birden fazla çelişkili sürüm tanımı bulundu (önceki: {previousVersions}, yeni: '{version}'); tüm kayıtlar ayrı ayrı korundu.",
                            manifest.ManifestPath,
                            lineNumber));
                    }
                    else
                    {
                        diagnostics.Add(ScannerDiagnostic.Warning(
                            $"'{packageId}' paketi için packages.config manifestosunda yinelenen sürüm kaydı bulundu ('{version}').",
                            manifest.ManifestPath,
                            lineNumber));
                    }

                    existingList.Add((version, lineNumber));
                }
                else
                {
                    seenPackages[packageId] = [(version, lineNumber)];
                }

                // F. PURL Koordinatı Üretimi (targetFramework niteleyicisi varsa query parametresi olarak eklenir)
                var packageUrl = BuildPackageUrl(packageId, version, targetFramework);

                // G. RawDependency Modelinin Oluşturulması
                // packages.config tüm bağımlılıkları (doğrudan ve dolaylı) düz bir listede birleştirdiği için
                // doğrudan/transitive ayrımı statik olarak yapılamaz; sözleşme kuralına uygun olarak Unknown atanır.
                // Scope güvenilir biçimde bilinemediği için Unknown atanır.
                // Lockfile olmaksızın çözümlenmiş sürüm iddia edilemez; resolvedVersion null kalır.
                var dependency = new RawDependency(
                    name: packageId,
                    version: version,
                    ecosystem: ScannerEcosystem.NuGet,
                    manifestPath: manifest.ManifestPath,
                    relationship: DependencyRelationship.Unknown,
                    scope: DependencyScope.Unknown,
                    requestedVersion: version,
                    resolvedVersion: null,
                    packageCoordinate: packageUrl);

                dependencies.Add(dependency);
            }

            if (hasSkippedElements)
            {
                return ScannerResult.Partial(manifest, dependencies, diagnostics);
            }

            return ScannerResult.Success(manifest, dependencies, diagnostics);
        }
        catch (OperationCanceledException)
        {
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
    /// targetFramework niteliği varsa standart niteleyici (qualifier) olarak eklenir.
    /// </summary>
    private static string BuildPackageUrl(string packageName, string version, string? targetFramework)
    {
        var encodedName = Uri.EscapeDataString(packageName);
        var encodedVersion = Uri.EscapeDataString(version);
        var purl = $"pkg:nuget/{encodedName}@{encodedVersion}";

        if (!string.IsNullOrWhiteSpace(targetFramework))
        {
            var encodedTfm = Uri.EscapeDataString(targetFramework.Trim());
            purl += $"?target_framework={encodedTfm}";
        }

        return purl;
    }
}

