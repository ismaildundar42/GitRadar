using System.Xml;
using System.Xml.Linq;
using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanner.NuGet.Models;

namespace GitRadar.Scanner.NuGet.Parsers;

/// <summary>
/// .NET Central Package Management (CPM) mekanizmasına ait Directory.Packages.props
/// dosyalarını güvenli XML kuralları ve bayt sınırları ile ayrıştıran parser bileşenidir.
/// Durumsuzdur (Stateless) ve thread-safe'tir.
/// </summary>
public sealed class DirectoryPackagesPropsParser
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
    /// DiscoveredManifest meta verisi ve içerik akışı üzerinden Directory.Packages.props dosyasını ayrıştırır.
    /// </summary>
    /// <param name="manifest">İncelenen manifest meta verisi.</param>
    /// <param name="contentStream">Salt okunur veri akışı. Çağırana aittir, kapatılmaz.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Ayrıştırılmış merkezi paket kataloğu ve teşhis kayıtları.</returns>
    public NugetCpmCatalog Parse(DiscoveredManifest manifest, Stream contentStream, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        ArgumentNullException.ThrowIfNull(contentStream);

        cancellationToken.ThrowIfCancellationRequested();

        // 1. Dosya Boyutu Ön Kontrolü (Metadata)
        if (manifest.SizeBytes > MaxManifestSizeBytes)
        {
            return NugetCpmCatalog.Failed(manifest.ManifestPath, [
                ScannerDiagnostic.Error(
                    $"Manifest dosya boyutu ({manifest.SizeBytes:N0} bayt) izin verilen güvenli üst sınırı ({MaxManifestSizeBytes:N0} bayt) aşıyor.",
                    manifest.ManifestPath,
                    errorCode: "SIZE_LIMIT_EXCEEDED")
            ]);
        }

        return ParseCore(manifest.ManifestPath, contentStream, cancellationToken);
    }

    /// <summary>
    /// Doğrudan dosya yolu ve içerik akışı üzerinden Directory.Packages.props dosyasını ayrıştırır.
    /// </summary>
    /// <param name="manifestPath">Props dosyasının göreli veya mutlak yolu.</param>
    /// <param name="contentStream">Salt okunur veri akışı. Çağırana aittir, kapatılmaz.</param>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Ayrıştırılmış merkezi paket kataloğu ve teşhis kayıtları.</returns>
    public NugetCpmCatalog Parse(string manifestPath, Stream contentStream, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(manifestPath))
            throw new ArgumentException("Manifest dosya yolu boş olamaz.", nameof(manifestPath));

        ArgumentNullException.ThrowIfNull(contentStream);

        cancellationToken.ThrowIfCancellationRequested();

        return ParseCore(manifestPath.Trim().Replace('\\', '/'), contentStream, cancellationToken);
    }

    private NugetCpmCatalog ParseCore(string manifestPath, Stream contentStream, CancellationToken cancellationToken)
    {
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

            // 4. CPM Etkinlik Bilgisi (ManagePackageVersionsCentrally)
            var cpmState = CpmManagementState.Unspecified;
            string? rawCpmValue = null;

            var cpmElements = doc.Descendants()
                .Where(e => string.Equals(e.Name.LocalName, "ManagePackageVersionsCentrally", StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (cpmElements.Count == 0)
            {
                cpmState = CpmManagementState.Unspecified;
                rawCpmValue = null;
                diagnostics.Add(ScannerDiagnostic.Info(
                    "ManagePackageVersionsCentrally öğesi bulunamadı; CPM etkinliği örtük/belirtilmemiş kabul edildi.",
                    manifestPath));
            }
            else
            {
                var cpmElement = cpmElements[0];
                var lineInfo = (IXmlLineInfo)cpmElement;
                var lineNumber = lineInfo.HasLineInfo() ? lineInfo.LineNumber : (int?)null;
                rawCpmValue = cpmElement.Value?.Trim();

                if (string.IsNullOrWhiteSpace(rawCpmValue))
                {
                    cpmState = CpmManagementState.Ambiguous;
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        "ManagePackageVersionsCentrally öğesi boş; CPM etkinliği doğrulanamadı.",
                        manifestPath,
                        lineNumber));
                }
                else if (rawCpmValue.Contains("$("))
                {
                    cpmState = CpmManagementState.Ambiguous;
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"ManagePackageVersionsCentrally değeri MSBuild özelliği ('{rawCpmValue}') içeriyor; CPM etkinliği statik olarak doğrulanamadı.",
                        manifestPath,
                        lineNumber));
                }
                else if (string.Equals(rawCpmValue, "true", StringComparison.OrdinalIgnoreCase))
                {
                    cpmState = CpmManagementState.Enabled;
                    diagnostics.Add(ScannerDiagnostic.Info(
                        "Merkezi Paket Yönetimi (CPM) açıkça etkinleştirilmiş (ManagePackageVersionsCentrally=true).",
                        manifestPath,
                        lineNumber));
                }
                else if (string.Equals(rawCpmValue, "false", StringComparison.OrdinalIgnoreCase))
                {
                    cpmState = CpmManagementState.Disabled;
                    diagnostics.Add(ScannerDiagnostic.Info(
                        "Merkezi Paket Yönetimi (CPM) açıkça devre dışı bırakılmış (ManagePackageVersionsCentrally=false).",
                        manifestPath,
                        lineNumber));
                }
                else
                {
                    cpmState = CpmManagementState.Ambiguous;
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"ManagePackageVersionsCentrally değeri ('{rawCpmValue}') geçersiz; 'true' veya 'false' bekleniyordu.",
                        manifestPath,
                        lineNumber));
                }
            }

            // 5. Import İfadelerinin Tespiti (<Import Project="..." />)
            var importElements = doc.Descendants()
                .Where(e => string.Equals(e.Name.LocalName, "Import", StringComparison.OrdinalIgnoreCase))
                .ToList();

            foreach (var import in importElements)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var lineInfo = (IXmlLineInfo)import;
                var lineNumber = lineInfo.HasLineInfo() ? lineInfo.LineNumber : (int?)null;

                var projectAttr = import.Attribute("Project")?.Value ?? import.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "Project", StringComparison.OrdinalIgnoreCase))?.Value;

                var projectPath = projectAttr?.Trim();

                if (string.IsNullOrWhiteSpace(projectPath))
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        "Proje özniteliği (Project) bulunmayan veya boş olan bir Import öğesi tespit edildi.",
                        manifestPath,
                        lineNumber));
                }
                else if (projectPath.Contains("$("))
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"Statik olarak çözümlenemeyen dinamik MSBuild import ifadesi ('{projectPath}') tespit edildi; harici import içeriği taranmadı.",
                        manifestPath,
                        lineNumber));
                }
                else
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"Statik MSBuild import ifadesi ('{projectPath}') tespit edildi; harici props importları mevcut aşamada kapsam dışıdır ve taranmamıştır.",
                        manifestPath,
                        lineNumber));
                }
            }

            // 6. GlobalPackageReference Öğelerinin Tespiti
            var globalPkgElements = doc.Descendants()
                .Where(e => string.Equals(e.Name.LocalName, "GlobalPackageReference", StringComparison.OrdinalIgnoreCase))
                .ToList();

            foreach (var globalPkg in globalPkgElements)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var lineInfo = (IXmlLineInfo)globalPkg;
                var lineNumber = lineInfo.HasLineInfo() ? lineInfo.LineNumber : (int?)null;

                var includeAttr = globalPkg.Attribute("Include") ?? globalPkg.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "Include", StringComparison.OrdinalIgnoreCase));

                var pkgName = includeAttr?.Value?.Trim();
                if (!string.IsNullOrWhiteSpace(pkgName))
                {
                    diagnostics.Add(ScannerDiagnostic.Info(
                        $"'{pkgName}' paketi için GlobalPackageReference tespit edildi; PackageVersion tanımı olmadığı için merkezi katalog kapsamı dışındadır.",
                        manifestPath,
                        lineNumber));
                }
            }

            // 7. PackageVersion Öğelerinin Ayrıştırılması
            var packageVersionElements = doc.Descendants()
                .Where(e => string.Equals(e.Name.LocalName, "PackageVersion", StringComparison.OrdinalIgnoreCase))
                .ToList();

            var rawEntriesMap = new Dictionary<string, List<NugetCpmPackageEntry>>(StringComparer.OrdinalIgnoreCase);

            foreach (var element in packageVersionElements)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var lineInfo = (IXmlLineInfo)element;
                var lineNumber = lineInfo.HasLineInfo() ? lineInfo.LineNumber : (int?)null;

                // Desteklenmeyen item işlemleri denetimi: Update ve Remove
                var updateAttr = element.Attribute("Update") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "Update", StringComparison.OrdinalIgnoreCase));

                var removeAttr = element.Attribute("Remove") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "Remove", StringComparison.OrdinalIgnoreCase));

                if (updateAttr is not null && !string.IsNullOrWhiteSpace(updateAttr.Value))
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"'{updateAttr.Value.Trim()}' paketi için desteklenmeyen MSBuild 'Update' işlemi tespit edildi; statik analiz kapsamında bu işlem atlandı.",
                        manifestPath,
                        lineNumber));
                    hasSkippedElements = true;
                    continue;
                }

                if (removeAttr is not null && !string.IsNullOrWhiteSpace(removeAttr.Value))
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"'{removeAttr.Value.Trim()}' paketi için desteklenmeyen MSBuild 'Remove' işlemi tespit edildi; statik analiz kapsamında bu işlem atlandı.",
                        manifestPath,
                        lineNumber));
                    hasSkippedElements = true;
                    continue;
                }

                // Paket Adı (Include Özniteliği)
                var includeAttr = element.Attribute("Include") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "Include", StringComparison.OrdinalIgnoreCase));

                var packageName = includeAttr?.Value?.Trim();

                if (string.IsNullOrWhiteSpace(packageName))
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        "Manifest dosyasında 'Include' özniteliği bulunmayan veya boş olan bir PackageVersion öğesi atlandı.",
                        manifestPath,
                        lineNumber));
                    hasSkippedElements = true;
                    continue;
                }

                // Sürüm Bilgisi (Version Attribute veya Child Element)
                var versionAttr = element.Attribute("Version") ?? element.Attributes()
                    .FirstOrDefault(a => string.Equals(a.Name.LocalName, "Version", StringComparison.OrdinalIgnoreCase));

                var versionChild = element.Elements()
                    .FirstOrDefault(e => string.Equals(e.Name.LocalName, "Version", StringComparison.OrdinalIgnoreCase));

                var rawVersion = versionAttr?.Value?.Trim() ?? versionChild?.Value?.Trim();

                if (string.IsNullOrWhiteSpace(rawVersion))
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"'{packageName}' paketi için PackageVersion tanımında sürüm belirtilmemiş veya boş.",
                        manifestPath,
                        lineNumber));
                    hasSkippedElements = true;
                    continue;
                }

                // MSBuild Özellik Tespiti ($(Property))
                var isStaticallyResolvable = !rawVersion.Contains("$(");
                if (!isStaticallyResolvable)
                {
                    diagnostics.Add(ScannerDiagnostic.Info(
                        $"'{packageName}' paketinin merkezi sürümü MSBuild özelliği ('{rawVersion}') içeriyor; statik analiz kapsamında özellik çözümlenmeden ham sürüm kaydedildi.",
                        manifestPath,
                        lineNumber));
                }

                // Koşul Denetimi (Condition Attribute: element veya ebeveyn ItemGroup)
                var elemCondition = element.Attribute("Condition")?.Value;
                var parentCondition = element.Parent is not null && string.Equals(element.Parent.Name.LocalName, "ItemGroup", StringComparison.OrdinalIgnoreCase)
                    ? element.Parent.Attribute("Condition")?.Value
                    : null;

                var activeCondition = !string.IsNullOrWhiteSpace(elemCondition) ? elemCondition.Trim() : parentCondition?.Trim();
                var hasCondition = !string.IsNullOrWhiteSpace(activeCondition);

                if (hasCondition)
                {
                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"'{packageName}' paketinin merkezi sürüm tanımı üzerinde koşul ('{activeCondition}') tespit edildi; statik analiz kapsamında koşul değerlendirilmeden kaydedildi.",
                        manifestPath,
                        lineNumber));
                }

                var entry = new NugetCpmPackageEntry(
                    packageId: packageName,
                    rawVersion: rawVersion,
                    isStaticallyResolvable: isStaticallyResolvable,
                    hasCondition: hasCondition,
                    condition: activeCondition,
                    lineNumber: lineNumber,
                    hasConflict: false);

                if (!rawEntriesMap.TryGetValue(packageName, out var entryList))
                {
                    entryList = [];
                    rawEntriesMap[packageName] = entryList;
                }

                entryList.Add(entry);
            }

            // 8. Çoklu Tanım ve Çakışma Yönetimi
            var finalEntriesMap = new Dictionary<string, List<NugetCpmPackageEntry>>(StringComparer.OrdinalIgnoreCase);

            foreach (var (pkgName, list) in rawEntriesMap)
            {
                if (list.Count > 1)
                {
                    var versionSummaries = string.Join(", ", list.Select(e =>
                        $"'{e.RawVersion}'" + (e.HasCondition ? $" [{e.Condition}]" : string.Empty)));

                    diagnostics.Add(ScannerDiagnostic.Warning(
                        $"'{pkgName}' paketi için Directory.Packages.props dosyasında birden fazla merkezi sürüm tanımı bulundu ({versionSummaries}); sürüm çakışması/belirsizliği tespit edildi.",
                        manifestPath));

                    // Tüm tanımları sakla, ancak çakışma bayrağı ile işaretle
                    finalEntriesMap[pkgName] = list.Select(e => new NugetCpmPackageEntry(
                        e.PackageId,
                        e.RawVersion,
                        e.IsStaticallyResolvable,
                        e.HasCondition,
                        e.Condition,
                        e.LineNumber,
                        hasConflict: true)).ToList();
                }
                else
                {
                    finalEntriesMap[pkgName] = [list[0]];
                }
            }

            // 9. Nihai Sonuç Statüsü
            var status = hasSkippedElements ? ScannerStatus.Partial : ScannerStatus.Success;

            return new NugetCpmCatalog(
                manifestPath: manifestPath,
                status: status,
                state: cpmState,
                rawManagePackageVersionsCentrally: rawCpmValue,
                entries: finalEntriesMap,
                diagnostics: diagnostics);
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
                manifestPath,
                errorCode: "SIZE_LIMIT_EXCEEDED"));

            return NugetCpmCatalog.Failed(manifestPath, diagnostics);
        }
        catch (XmlException ex)
        {
            diagnostics.Add(ScannerDiagnostic.Error(
                $"Manifest XML biçimi geçersiz (satır {ex.LineNumber}, sütun {ex.LinePosition}).",
                manifestPath,
                lineNumber: ex.LineNumber,
                errorCode: "XML_PARSE_ERROR"));

            return NugetCpmCatalog.Failed(manifestPath, diagnostics);
        }
        catch (Exception ex)
        {
            diagnostics.Add(ScannerDiagnostic.Error(
                $"Manifest ayrıştırılırken beklenmeyen bir hata oluştu ({ex.GetType().Name}).",
                manifestPath,
                errorCode: ex.GetType().Name));

            return NugetCpmCatalog.Failed(manifestPath, diagnostics);
        }
    }
}

