namespace GitRadar.Application.Contracts.GitHub;

/// <summary>
/// GitHub REST API üzerinden depo keşfi ve senkronizasyon operasyonlarını yöneten servis sözleşmesidir.
/// </summary>
public interface IGitHubService
{
    /// <summary>
    /// Kimliği doğrulanmış kullanıcıya ait tüm depoları (Public & Private) sayfalı olarak çeker.
    /// </summary>
    Task<IReadOnlyList<GitHubRepositoryDto>> GetUserRepositoriesAsync(
        string? personalAccessToken = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Belirtilen organizasyona ait tüm depoları sayfalı olarak çeker.
    /// </summary>
    Task<IReadOnlyList<GitHubRepositoryDto>> GetOrganizationRepositoriesAsync(
        string orgName,
        string? personalAccessToken = null,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Sağlanan token ile GitHub API /user uç noktasını çağırarak hesap kimliğini doğrular ve profil bilgilerini döner.
    /// </summary>
    Task<GitHubAccountProfileDto> VerifyAndGetProfileAsync(
        string personalAccessToken,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// GitHub API (/user) üzerinden kullanıcı profil bilgilerini (kullanıcı adı, isim, avatar) döner.
    /// </summary>
    Task<GitHubUserProfileDto?> GetUserProfileAsync(
        string token,
        CancellationToken cancellationToken = default);
}

