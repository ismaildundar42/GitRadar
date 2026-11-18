using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanning.Abstractions.Providers;
using GitRadar.Scanner.NuGet.Models;
using GitRadar.Scanner.NuGet.Parsers;

namespace GitRadar.Scanner.NuGet;

/// <summary>
/// .NET ekosistemine ait proje (.csproj, .vbproj), Central Package Management (.props) ve klasik packages.config manifestolarını
/// analiz eden ve IEcosystemBatchScanner / IScannerProvider sözleşmelerini uygulayan sağlayıcıdır.
/// Durumsuzdur (Stateless) ve thread-safe'tir; tarama verilerini private alanlarda biriktirmez.
/// </summary>
public sealed class NuGetScannerProvider : IEcosystemBatchScanner
{
    private static readonly string[] SupportedPatterns = ["*.csproj", "*.vbproj", "Directory.Packages.props", "packages.config"];
    private readonly SdkProjectParser _parser;
    private readonly DirectoryPackagesPropsParser _propsParser;
    private readonly PackagesConfigParser _packagesConfigParser;

    public ScannerEcosystem Ecosystem => ScannerEcosystem.NuGet;

    public IReadOnlyCollection<string> SupportedManifestPatterns => SupportedPatterns;

    public NuGetScannerProvider(
        SdkProjectParser? parser = null,
        DirectoryPackagesPropsParser? propsParser = null,
        PackagesConfigParser? packagesConfigParser = null)
    {
        _parser = parser ?? new SdkProjectParser();
        _propsParser = propsParser ?? new DirectoryPackagesPropsParser();
        _packagesConfigParser = packagesConfigParser ?? new PackagesConfigParser();
    }

    /// <inheritdoc />
    public bool CanHandle(DiscoveredManifest manifest)
    {
        ArgumentNullException.ThrowIfNull(manifest);

        if (manifest.Ecosystem is not (ScannerEcosystem.NuGet or ScannerEcosystem.Unknown))
            return false;

        if (string.Equals(manifest.FileName, "Directory.Packages.props", StringComparison.OrdinalIgnoreCase))
            return true;

        if (string.Equals(manifest.FileName, "packages.config", StringComparison.OrdinalIgnoreCase))
            return true;

        var ext = Path.GetExtension(manifest.ManifestPath);
        return ext.Equals(".csproj", StringComparison.OrdinalIgnoreCase) ||
               ext.Equals(".vbproj", StringComparison.OrdinalIgnoreCase);
    }

    /// <inheritdoc />
    public Task<ScannerResult> ScanAsync(
        DiscoveredManifest manifest,
        Stream contentStream,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(manifest);
        ArgumentNullException.ThrowIfNull(contentStream);

        cancellationToken.ThrowIfCancellationRequested();

        if (string.Equals(manifest.FileName, "Directory.Packages.props", StringComparison.OrdinalIgnoreCase))
        {
            var catalog = _propsParser.Parse(manifest, contentStream, cancellationToken);
            var result = new ScannerResult(
                manifest,
                catalog.Status,
                dependencies: [],
                diagnostics: catalog.Diagnostics);

            return Task.FromResult(result);
        }

        if (string.Equals(manifest.FileName, "packages.config", StringComparison.OrdinalIgnoreCase))
        {
            var result = _packagesConfigParser.Parse(manifest, contentStream, cancellationToken);
            return Task.FromResult(result);
        }

        var projResult = _parser.Parse(manifest, contentStream, cancellationToken);
        return Task.FromResult(projResult);
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<ScannerResult>> ScanBatchAsync(
        IReadOnlyList<DiscoveredManifest> manifests,
        Func<DiscoveredManifest, CancellationToken, Task<Stream>> contentStreamProvider,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(manifests);
        ArgumentNullException.ThrowIfNull(contentStreamProvider);

        cancellationToken.ThrowIfCancellationRequested();

        var resultsMap = new Dictionary<DiscoveredManifest, ScannerResult>();
        var parsedCatalogs = new List<NugetCpmCatalog>();

        var propsManifests = manifests
            .Where(m => string.Equals(m.FileName, "Directory.Packages.props", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var packagesConfigManifests = manifests
            .Where(m => string.Equals(m.FileName, "packages.config", StringComparison.OrdinalIgnoreCase))
            .ToList();

        var projectManifests = manifests
            .Where(m => !string.Equals(m.FileName, "Directory.Packages.props", StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(m.FileName, "packages.config", StringComparison.OrdinalIgnoreCase))
            .ToList();

        // 1. Aşama: Directory.Packages.props dosyalarını ayrıştırma ve yerel katalogları kurma
        foreach (var propsManifest in propsManifests)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                Stream? stream = null;
                try
                {
                    stream = await contentStreamProvider(propsManifest, cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    resultsMap[propsManifest] = ScannerResult.Failure(propsManifest, [
                        ScannerDiagnostic.Error(
                            $"Directory.Packages.props içerik akışı alınırken hata oluştu ({ex.GetType().Name}).",
                            propsManifest.ManifestPath,
                            errorCode: ex.GetType().Name)
                    ]);
                    continue;
                }

                if (stream is null)
                {
                    resultsMap[propsManifest] = ScannerResult.Failure(propsManifest, [
                        ScannerDiagnostic.Error("Manifest içerik akışı sağlanamadı (akış boş/null döndü).", propsManifest.ManifestPath)
                    ]);
                    continue;
                }

                var catalog = _propsParser.Parse(propsManifest, stream, cancellationToken);
                if (catalog.Status != ScannerStatus.Failed)
                {
                    parsedCatalogs.Add(catalog);
                }

                resultsMap[propsManifest] = new ScannerResult(
                    propsManifest,
                    catalog.Status,
                    dependencies: [],
                    diagnostics: catalog.Diagnostics);
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                resultsMap[propsManifest] = ScannerResult.Failure(propsManifest, [
                    ScannerDiagnostic.Error(
                        $"Directory.Packages.props ayrıştırılırken beklenmeyen bir hata oluştu ({ex.GetType().Name}).",
                        propsManifest.ManifestPath,
                        errorCode: ex.GetType().Name)
                ]);
            }
        }

        // 2. Aşama: packages.config manifestolarını ayrıştırma (Kural: CPM uygulanmaz; sürümler kendi içindedir)
        foreach (var pkgConfigManifest in packagesConfigManifests)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                Stream? stream = null;
                try
                {
                    stream = await contentStreamProvider(pkgConfigManifest, cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    resultsMap[pkgConfigManifest] = ScannerResult.Failure(pkgConfigManifest, [
                        ScannerDiagnostic.Error(
                            $"Manifest içerik akışı alınırken hata oluştu ({ex.GetType().Name}).",
                            pkgConfigManifest.ManifestPath,
                            errorCode: ex.GetType().Name)
                    ]);
                    continue;
                }

                if (stream is null)
                {
                    resultsMap[pkgConfigManifest] = ScannerResult.Failure(pkgConfigManifest, [
                        ScannerDiagnostic.Error("Manifest içerik akışı sağlanamadı (akış boş/null döndü).", pkgConfigManifest.ManifestPath)
                    ]);
                    continue;
                }

                var result = _packagesConfigParser.Parse(pkgConfigManifest, stream, cancellationToken);
                resultsMap[pkgConfigManifest] = result;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                resultsMap[pkgConfigManifest] = ScannerResult.Failure(pkgConfigManifest, [
                    ScannerDiagnostic.Error(
                        $"Manifest ayrıştırılırken beklenmeyen bir sağlayıcı hatası oluştu ({ex.GetType().Name}).",
                        pkgConfigManifest.ManifestPath,
                        errorCode: ex.GetType().Name)
                ]);
            }
        }

        // 3. Aşama: Proje manifestolarını (.csproj, .vbproj) en yakın Directory.Packages.props kataloğu ile ayrıştırma
        foreach (var projectManifest in projectManifests)
        {
            cancellationToken.ThrowIfCancellationRequested();

            try
            {
                Stream? stream = null;
                try
                {
                    stream = await contentStreamProvider(projectManifest, cancellationToken).ConfigureAwait(false);
                }
                catch (OperationCanceledException)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    resultsMap[projectManifest] = ScannerResult.Failure(projectManifest, [
                        ScannerDiagnostic.Error(
                            $"Manifest içerik akışı alınırken hata oluştu ({ex.GetType().Name}).",
                            projectManifest.ManifestPath,
                            errorCode: ex.GetType().Name)
                    ]);
                    continue;
                }

                if (stream is null)
                {
                    resultsMap[projectManifest] = ScannerResult.Failure(projectManifest, [
                        ScannerDiagnostic.Error("Manifest içerik akışı sağlanamadı (akış boş/null döndü).", projectManifest.ManifestPath)
                    ]);
                    continue;
                }

                var nearestCatalog = FindNearestCpmCatalog(projectManifest.ManifestPath, parsedCatalogs);
                var projectResult = _parser.Parse(projectManifest, stream, cancellationToken, nearestCatalog);
                resultsMap[projectManifest] = projectResult;
            }
            catch (OperationCanceledException)
            {
                throw;
            }
            catch (Exception ex)
            {
                resultsMap[projectManifest] = ScannerResult.Failure(projectManifest, [
                    ScannerDiagnostic.Error(
                        $"Manifest ayrıştırılırken beklenmeyen bir sağlayıcı hatası oluştu ({ex.GetType().Name}).",
                        projectManifest.ManifestPath,
                        errorCode: ex.GetType().Name)
                ]);
            }
        }

        return manifests.Select(m => resultsMap[m]).ToList();
    }

    private static NugetCpmCatalog? FindNearestCpmCatalog(string projectManifestPath, IReadOnlyList<NugetCpmCatalog> catalogs)
    {
        if (catalogs.Count == 0)
            return null;

        var projectDir = GetNormalizedDirectory(projectManifestPath);
        NugetCpmCatalog? nearestCatalog = null;
        int deepestLength = -1;

        foreach (var catalog in catalogs)
        {
            var catalogDir = GetNormalizedDirectory(catalog.ManifestPath);
            if (IsDirectoryAncestorOrSame(catalogDir, projectDir))
            {
                if (catalogDir.Length > deepestLength)
                {
                    deepestLength = catalogDir.Length;
                    nearestCatalog = catalog;
                }
            }
        }

        return nearestCatalog;
    }

    private static string GetNormalizedDirectory(string manifestPath)
    {
        var normalized = manifestPath.Replace('\\', '/').Trim('/');
        var lastSlash = normalized.LastIndexOf('/');
        return lastSlash >= 0 ? normalized[..lastSlash] : string.Empty;
    }

    private static bool IsDirectoryAncestorOrSame(string ancestorDir, string targetDir)
    {
        if (string.IsNullOrEmpty(ancestorDir))
            return true;

        if (string.Equals(ancestorDir, targetDir, StringComparison.OrdinalIgnoreCase))
            return true;

        return targetDir.StartsWith(ancestorDir + "/", StringComparison.OrdinalIgnoreCase);
    }
}
