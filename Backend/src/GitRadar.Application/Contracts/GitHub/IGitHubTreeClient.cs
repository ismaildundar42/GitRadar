namespace GitRadar.Application.Contracts.GitHub;

/// <summary>
/// GitHub Git Tree API ve Blob akış servisleri üzerinden depoyu klonlamadan (zero git clone)
/// manifest ve dosya içeriği sorgulamayı sağlayan sözleşmedir.
/// </summary>
public interface IGitHubTreeClient
{
    /// <summary>
    /// Belirtilen repository ve commit/branch için özyinelemeli (recursive) dosya ağacını sorgular.
    /// </summary>
    Task<IReadOnlyList<GitHubTreeItem>> FetchRepositoryTreeAsync(
        string owner,
        string repo,
        string commitOrBranch,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Belirtilen repository ve commit/branch için yalnızca NuGet manifestolarını (.csproj, .vbproj, Directory.Packages.props, packages.config) filtreleyerek getirir.
    /// </summary>
    Task<IReadOnlyList<GitHubTreeItem>> FetchManifestTreeAsync(
        string owner,
        string repo,
        string commitOrBranch,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Belirtilen blob indirme URL'si veya blob SHA kimliği üzerinden dosya içeriğini bellek içi akış (Stream) olarak indirir (Zero Disk I/O).
    /// </summary>
    Task<Stream> DownloadManifestStreamAsync(
        string downloadUrlOrBlobSha,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Belirtilen repository ve blob SHA kimliği üzerinden dosya içeriğini bellek içi akış (Stream) olarak indirir (Zero Disk I/O).
    /// </summary>
    Task<Stream> DownloadManifestStreamAsync(
        string owner,
        string repo,
        string blobSha,
        CancellationToken cancellationToken = default);
}

