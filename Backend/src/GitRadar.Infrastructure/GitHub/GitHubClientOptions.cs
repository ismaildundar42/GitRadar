namespace GitRadar.Infrastructure.GitHub;

/// <summary>
/// GitHub Git Tree ve Blob istemcisi için yapılandırma seçenekleridir.
/// </summary>
public sealed class GitHubClientOptions
{
    public const string SectionName = "GitHub";

    /// <summary>
    /// GitHub kişisel erişim belirteci (Personal Access Token).
    /// Boş bırakılırsa anonim/genel erişim kullanılır (anonim erişimde GitHub IP başına saatlik 60 istek sınırı uygular).
    /// </summary>
    public string? PersonalAccessToken { get; set; }

    /// <summary>
    /// Hedef GitHub Organizasyonu (varsayılan: null). Belirtilirse organizasyon kapsamındaki depolar listelenir.
    /// </summary>
    public string? TargetOrganization { get; set; }

    /// <summary>
    /// GitHub API temel adresi (varsayılan: https://api.github.com).
    /// GitHub Enterprise Server kurulumları için özelleştirilebilir.
    /// </summary>
    public string BaseUrl { get; set; } = "https://api.github.com";

    /// <summary>
    /// HTTP User-Agent başlığı (GitHub API tarafından zorunludur).
    /// </summary>
    public string UserAgent { get; set; } = "GitRadar-SCA-Scanner";

    /// <summary>
    /// İstek zaman aşımı süresi (saniye cinsinden, varsayılan: 30).
    /// </summary>
    public int TimeoutSeconds { get; set; } = 30;

    /// <summary>
    /// İndirilecek manifest dosyası için izin verilen maksimum bayt üst sınırı (varsayılan: 50 MB).
    /// </summary>
    public long MaxManifestSizeBytes { get; set; } = 50 * 1024 * 1024;
}

