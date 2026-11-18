namespace GitRadar.Application.Contracts.GitHub;

/// <summary>
/// GitHub ağaç öğeleri arasından yalnızca desteklenen NuGet ekosistemi bildirimlerini filtreleyen yardımcı sınıftır.
/// </summary>
public static class NuGetManifestFilter
{
    /// <summary>
    /// Belirtilen dosya yolunun desteklenen bir NuGet manifestosu olup olmadığını denetler.
    /// </summary>
    public static bool IsNuGetManifest(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            return false;

        var fileName = Path.GetFileName(path);

        return fileName.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase) ||
               fileName.EndsWith(".vbproj", StringComparison.OrdinalIgnoreCase) ||
               fileName.Equals("Directory.Packages.props", StringComparison.OrdinalIgnoreCase) ||
               fileName.Equals("packages.config", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Verilen ağaç öğesi koleksiyonundan yalnızca geçerli NuGet manifestolarını döndürür.
    /// </summary>
    public static IReadOnlyList<GitHubTreeItem> FilterNuGetManifests(IEnumerable<GitHubTreeItem> items)
    {
        ArgumentNullException.ThrowIfNull(items);

        return items
            .Where(item => item is not null &&
                           item.Type.Equals("blob", StringComparison.OrdinalIgnoreCase) &&
                           IsNuGetManifest(item.Path))
            .ToList();
    }
}

