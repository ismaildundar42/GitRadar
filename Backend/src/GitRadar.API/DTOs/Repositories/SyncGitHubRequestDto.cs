namespace GitRadar.API.DTOs.Repositories;

/// <summary>
/// GitHub otomatik keşif ve senkronizasyon istek parametreleridir.
/// </summary>
/// <param name="Token">İsteğe bağlı GitHub Personal Access Token (PAT). Boş bırakılırsa appsettings.json'daki yapılandırma kullanılır.</param>
/// <param name="OrgName">İsteğe bağlı organizasyon adı. Boş bırakılırsa kullanıcı depoları çekilir.</param>
public sealed record SyncGitHubRequestDto(string? Token = null, string? OrgName = null);

