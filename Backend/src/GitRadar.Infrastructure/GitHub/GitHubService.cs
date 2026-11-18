using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using GitRadar.Application.Contracts.GitHub;
using GitRadar.Application.Contracts.GitHub.Exceptions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace GitRadar.Infrastructure.GitHub;

/// <summary>
/// GitHub REST API v3 üzerinden depoları otomatik keşfeden (Auto-Discovery) servis implementasyonudur.
/// </summary>
public sealed class GitHubService : IGitHubService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _httpClient;
    private readonly GitHubClientOptions _options;
    private readonly ILogger<GitHubService> _logger;

    public GitHubService(
        HttpClient httpClient,
        IOptions<GitHubClientOptions>? options = null,
        ILogger<GitHubService>? logger = null)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _options = options?.Value ?? new GitHubClientOptions();
        _logger = logger ?? NullLogger<GitHubService>.Instance;

        ConfigureHttpClientDefaults();
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<GitHubRepositoryDto>> GetUserRepositoriesAsync(
        string? personalAccessToken = null,
        CancellationToken cancellationToken = default)
    {
        var token = !string.IsNullOrWhiteSpace(personalAccessToken)
            ? personalAccessToken.Trim()
            : (!string.IsNullOrWhiteSpace(_options.PersonalAccessToken)
                ? _options.PersonalAccessToken.Trim()
                : null);

        // 1. Hedef Organizasyon yapılandırılmışsa doğrudan o organizasyonun depolarını çek
        var targetOrg = _options.TargetOrganization;
        if (!string.IsNullOrWhiteSpace(targetOrg))
        {
            return await FetchRepositoriesAsync($"orgs/{Uri.EscapeDataString(targetOrg.Trim())}/repos", token, cancellationToken).ConfigureAwait(false);
        }

        // 2. Token varsa doğrudan /user/repos çağrılır (böylece tüm Private ve Public depolar gelir)
        if (!string.IsNullOrWhiteSpace(token))
        {
            return await FetchRepositoriesAsync("user/repos", token, cancellationToken).ConfigureAwait(false);
        }

        _logger.LogWarning("GitHub token veya hedef organizasyon yapılandırılmadı. Depo çekilemedi.");
        return Array.Empty<GitHubRepositoryDto>();
    }

    /// <inheritdoc />
    public async Task<GitHubAccountProfileDto> VerifyAndGetProfileAsync(
        string personalAccessToken,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(personalAccessToken))
            throw new ArgumentException("Personal Access Token boş olamaz.", nameof(personalAccessToken));

        var token = personalAccessToken.Trim();
        using var request = new HttpRequestMessage(HttpMethod.Get, "user");
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);

        if (response.StatusCode == HttpStatusCode.Unauthorized)
        {
            _logger.LogWarning("GitHub token geçersiz (HTTP 401 Bad Credentials).");
            throw new GitHubApiException("GitHub token geçersiz veya yetkisiz (HTTP 401 Bad Credentials). Lütfen geçerli bir PAT giriniz.", response.StatusCode);
        }

        if (response.StatusCode == HttpStatusCode.Forbidden)
        {
            _logger.LogWarning("GitHub API istek sınırı aşıldı (HTTP 403).");
            throw new GitHubApiException("GitHub API hız sınırı aşıldı (HTTP 403).", response.StatusCode);
        }

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            _logger.LogError("GitHub profil doğrulama hatası (HTTP {Status}): {Error}", response.StatusCode, err);
            throw new GitHubApiException($"GitHub profil doğrulaması başarısız oldu (HTTP {(int)response.StatusCode}): {err}", response.StatusCode);
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        var profile = await JsonSerializer.DeserializeAsync<GitHubUserProfileResponse>(stream, JsonOptions, cancellationToken).ConfigureAwait(false);

        if (profile is null || string.IsNullOrWhiteSpace(profile.Login))
        {
            throw new GitHubApiException("GitHub hesap bilgisi ayrıştırılamadı.", response.StatusCode);
        }

        return new GitHubAccountProfileDto(
            Login: profile.Login,
            Name: profile.Name,
            Type: string.IsNullOrWhiteSpace(profile.Type) ? "User" : profile.Type,
            Email: profile.Email,
            AvatarUrl: profile.AvatarUrl,
            PublicRepos: profile.PublicRepos,
            TotalPrivateRepos: profile.TotalPrivateRepos);
    }

    /// <inheritdoc />
    public async Task<GitHubUserProfileDto?> GetUserProfileAsync(
        string token,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;

        try
        {
            var profile = await VerifyAndGetProfileAsync(token, cancellationToken).ConfigureAwait(false);
            return new GitHubUserProfileDto
            {
                Login = profile.Login,
                Name = profile.Name ?? "",
                AvatarUrl = profile.AvatarUrl ?? "",
                Type = profile.Type ?? "User",
                IsValid = true
            };
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "GitHub token doğrulanamadı.");
            return null;
        }
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<GitHubRepositoryDto>> GetOrganizationRepositoriesAsync(
        string orgName,
        string? personalAccessToken = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(orgName))
            throw new ArgumentException("Organizasyon adı boş olamaz.", nameof(orgName));

        var token = !string.IsNullOrWhiteSpace(personalAccessToken)
            ? personalAccessToken.Trim()
            : _options.PersonalAccessToken?.Trim();

        var path = $"orgs/{Uri.EscapeDataString(orgName.Trim())}/repos";
        return await FetchRepositoriesAsync(path, token, cancellationToken).ConfigureAwait(false);
    }

    private async Task<IReadOnlyList<GitHubRepositoryDto>> FetchRepositoriesAsync(
        string basePath,
        string? token,
        CancellationToken cancellationToken)
    {
        var allRepos = new List<GitHubRepositoryDto>();
        var page = 1;
        const int perPage = 100;

        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var separator = basePath.Contains('?') ? '&' : '?';
            var requestUri = $"{basePath}{separator}per_page={perPage}&type=all&sort=updated&page={page}";

            using var request = new HttpRequestMessage(HttpMethod.Get, requestUri);
            request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));

            if (!string.IsNullOrWhiteSpace(token))
            {
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }

            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);

            if (response.StatusCode == HttpStatusCode.Unauthorized)
            {
                _logger.LogWarning("GitHub API yetkilendirmesi başarısız oldu (HTTP 401).");
                throw new GitHubApiException("GitHub API yetkilendirmesi başarısız oldu (HTTP 401). Lütfen geçerli bir Personal Access Token (PAT) sağlayın.", response.StatusCode);
            }

            if (response.StatusCode == HttpStatusCode.Forbidden)
            {
                _logger.LogWarning("GitHub API hız sınırı aşıldı veya yetkisiz erişim (HTTP 403).");
                throw new GitHubApiException("GitHub API hız sınırı aşıldı veya erişim reddedildi (HTTP 403).", response.StatusCode);
            }

            if (!response.IsSuccessStatusCode)
            {
                var errContent = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                _logger.LogError("GitHub API çağrısı başarısız oldu. Durum: {Status}, Yanıt: {Error}", response.StatusCode, errContent);
                throw new GitHubApiException($"GitHub API hatası (HTTP {(int)response.StatusCode}): {errContent}", response.StatusCode);
            }

            await using var contentStream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
            var pageItems = await JsonSerializer.DeserializeAsync<List<GitHubRepoApiResponseDto>>(contentStream, JsonOptions, cancellationToken).ConfigureAwait(false);

            if (pageItems is null || pageItems.Count == 0)
            {
                break;
            }

            foreach (var item in pageItems)
            {
                if (string.IsNullOrWhiteSpace(item.Name))
                    continue;

                var owner = item.Owner?.Login ?? (item.FullName?.Contains('/') == true ? item.FullName.Split('/')[0] : "user");
                var fullName = item.FullName ?? $"{owner}/{item.Name}";

                allRepos.Add(new GitHubRepositoryDto(
                    Id: item.Id,
                    Name: item.Name,
                    FullName: fullName,
                    Owner: owner,
                    DefaultBranch: string.IsNullOrWhiteSpace(item.DefaultBranch) ? "main" : item.DefaultBranch,
                    IsPrivate: item.Private,
                    HtmlUrl: item.HtmlUrl ?? $"https://github.com/{fullName}",
                    PushedAt: item.PushedAt,
                    UpdatedAt: item.UpdatedAt));
            }

            if (pageItems.Count < perPage)
            {
                break;
            }

            page++;
        }

        _logger.LogInformation("GitHub üzerinden toplam {Count} depo keşfedildi.", allRepos.Count);
        return allRepos;
    }

    private void ConfigureHttpClientDefaults()
    {
        if (_httpClient.BaseAddress is null && !string.IsNullOrWhiteSpace(_options.BaseUrl))
        {
            var baseUrl = _options.BaseUrl.TrimEnd('/') + "/";
            _httpClient.BaseAddress = new Uri(baseUrl);
        }

        if (!_httpClient.DefaultRequestHeaders.Contains("User-Agent"))
        {
            _httpClient.DefaultRequestHeaders.Add("User-Agent", _options.UserAgent);
        }

        if (_options.TimeoutSeconds > 0 && _httpClient.Timeout == TimeSpan.FromSeconds(100))
        {
            _httpClient.Timeout = TimeSpan.FromSeconds(_options.TimeoutSeconds);
        }
    }

    private sealed class GitHubRepoApiResponseDto
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("full_name")]
        public string? FullName { get; set; }

        [JsonPropertyName("private")]
        public bool Private { get; set; }

        [JsonPropertyName("owner")]
        public GitHubOwnerDto? Owner { get; set; }

        [JsonPropertyName("html_url")]
        public string? HtmlUrl { get; set; }

        [JsonPropertyName("default_branch")]
        public string? DefaultBranch { get; set; }

        [JsonPropertyName("pushed_at")]
        public DateTime? PushedAt { get; set; }

        [JsonPropertyName("updated_at")]
        public DateTime? UpdatedAt { get; set; }
    }

    private sealed class GitHubOwnerDto
    {
        [JsonPropertyName("login")]
        public string? Login { get; set; }
    }

    private sealed class GitHubUserProfileResponse
    {
        [JsonPropertyName("login")]
        public string? Login { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }

        [JsonPropertyName("type")]
        public string? Type { get; set; }

        [JsonPropertyName("email")]
        public string? Email { get; set; }

        [JsonPropertyName("avatar_url")]
        public string? AvatarUrl { get; set; }

        [JsonPropertyName("public_repos")]
        public int? PublicRepos { get; set; }

        [JsonPropertyName("total_private_repos")]
        public int? TotalPrivateRepos { get; set; }
    }
}
