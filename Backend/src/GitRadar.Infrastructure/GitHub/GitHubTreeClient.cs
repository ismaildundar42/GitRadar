using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using GitRadar.Application.Contracts.GitHub;
using GitRadar.Application.Contracts.GitHub.Exceptions;
using GitRadar.Infrastructure.Streams;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace GitRadar.Infrastructure.GitHub;

/// <summary>
/// GitHub Git Tree API ve Blob akış servisleri ile haberleşen salt okunur, bellek içi istemcidir.
/// Hiçbir git clone operasyonu veya disk I/O işlemi yapmadan doğrudan bellek içi akışlarla çalışır (Zero Disk I/O).
/// SEC-02 kuralına tam uyumlu belirteç (Token) maskeleme ve koruma mekanizmalarını barındırır.
/// </summary>
public sealed class GitHubTreeClient : IGitHubTreeClient
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly HttpClient _httpClient;
    private readonly GitHubClientOptions _options;
    private readonly ILogger<GitHubTreeClient> _logger;

    public GitHubTreeClient(
        HttpClient httpClient,
        IOptions<GitHubClientOptions>? options = null,
        ILogger<GitHubTreeClient>? logger = null)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _options = options?.Value ?? new GitHubClientOptions();
        _logger = logger ?? NullLogger<GitHubTreeClient>.Instance;

        ConfigureHttpClientDefaults();
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<GitHubTreeItem>> FetchRepositoryTreeAsync(
        string owner,
        string repo,
        string commitOrBranch,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(owner))
            throw new ArgumentException("Repository sahibi (owner) boş olamaz.", nameof(owner));

        if (string.IsNullOrWhiteSpace(repo))
            throw new ArgumentException("Repository adı (repo) boş olamaz.", nameof(repo));

        if (string.IsNullOrWhiteSpace(commitOrBranch))
            throw new ArgumentException("Commit SHA veya dal adı boş olamaz.", nameof(commitOrBranch));

        cancellationToken.ThrowIfCancellationRequested();

        var trimmedOwner = owner.Trim();
        var trimmedRepo = repo.Trim();
        var trimmedRef = commitOrBranch.Trim();

        // Git Tree API recursive endpoint (Token ASLA query parametresine eklenmez - SEC-02)
        var requestUri = $"repos/{trimmedOwner}/{trimmedRepo}/git/trees/{trimmedRef}?recursive=1";

        using var request = new HttpRequestMessage(HttpMethod.Get, requestUri);
        ApplyAuthorizationHeader(request);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));

        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        await EnsureSuccessResponseAsync(response, trimmedOwner, trimmedRepo, trimmedRef, cancellationToken)
            .ConfigureAwait(false);

        await using var contentStream = await response.Content.ReadAsStreamAsync(cancellationToken)
            .ConfigureAwait(false);

        var treeResponse = await JsonSerializer.DeserializeAsync<GitHubTreeResponse>(contentStream, JsonOptions, cancellationToken)
            .ConfigureAwait(false);

        if (treeResponse?.Tree is null || treeResponse.Tree.Count == 0)
        {
            return Array.Empty<GitHubTreeItem>();
        }

        var results = new List<GitHubTreeItem>(treeResponse.Tree.Count);
        foreach (var item in treeResponse.Tree)
        {
            if (string.IsNullOrWhiteSpace(item.Path) || string.IsNullOrWhiteSpace(item.Sha))
                continue;

            results.Add(new GitHubTreeItem(
                Path: item.Path.Trim(),
                Sha: item.Sha.Trim(),
                Type: item.Type?.Trim() ?? "blob",
                Size: item.Size ?? 0,
                Url: item.Url?.Trim() ?? string.Empty));
        }

        return results.AsReadOnly();
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<GitHubTreeItem>> FetchManifestTreeAsync(
        string owner,
        string repo,
        string commitOrBranch,
        CancellationToken cancellationToken = default)
    {
        var fullTree = await FetchRepositoryTreeAsync(owner, repo, commitOrBranch, cancellationToken)
            .ConfigureAwait(false);

        return NuGetManifestFilter.FilterNuGetManifests(fullTree);
    }

    /// <inheritdoc />
    public async Task<Stream> DownloadManifestStreamAsync(
        string downloadUrlOrBlobSha,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(downloadUrlOrBlobSha))
            throw new ArgumentException("İndirme URL'si veya blob SHA boş olamaz.", nameof(downloadUrlOrBlobSha));

        cancellationToken.ThrowIfCancellationRequested();

        var trimmedTarget = downloadUrlOrBlobSha.Trim();

        if (!trimmedTarget.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
            !trimmedTarget.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException(
                $"Yalnızca SHA verildiğinde repo bağlamı gereklidir. Lütfen DownloadManifestStreamAsync(owner, repo, blobSha) metodunu kullanın veya geçerli bir URL sağlayın. Verilen değer: '{SanitizeMessage(trimmedTarget)}'",
                nameof(downloadUrlOrBlobSha));
        }

        return await DownloadStreamInternalAsync(trimmedTarget, cancellationToken).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async Task<Stream> DownloadManifestStreamAsync(
        string owner,
        string repo,
        string blobSha,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(owner))
            throw new ArgumentException("Repository sahibi boş olamaz.", nameof(owner));

        if (string.IsNullOrWhiteSpace(repo))
            throw new ArgumentException("Repository adı boş olamaz.", nameof(repo));

        if (string.IsNullOrWhiteSpace(blobSha))
            throw new ArgumentException("Blob SHA boş olamaz.", nameof(blobSha));

        cancellationToken.ThrowIfCancellationRequested();

        var trimmedOwner = owner.Trim();
        var trimmedRepo = repo.Trim();
        var trimmedSha = blobSha.Trim();

        var endpoint = $"repos/{trimmedOwner}/{trimmedRepo}/git/blobs/{trimmedSha}";

        return await DownloadStreamInternalAsync(endpoint, cancellationToken, trimmedOwner, trimmedRepo).ConfigureAwait(false);
    }

    private async Task<Stream> DownloadStreamInternalAsync(
        string uri,
        CancellationToken cancellationToken,
        string? owner = null,
        string? repo = null)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        ApplyAuthorizationHeader(request);

        // Ham dosya içeriği (Raw Blob) talep ediyoruz
        request.Headers.Accept.Clear();
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github.raw"));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/octet-stream"));

        var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);

        await EnsureSuccessResponseAsync(response, owner, repo, commitOrRef: null, cancellationToken)
            .ConfigureAwait(false);

        var contentStream = await response.Content.ReadAsStreamAsync(cancellationToken)
            .ConfigureAwait(false);

        // 50 MB güvenlik sınırı ile tamamen bellek içi akışa (MemoryStream) kopyalıyoruz (Zero Disk I/O)
        var memoryStream = new MemoryStream();
        try
        {
            using (var boundedStream = new BoundedReadStream(contentStream, _options.MaxManifestSizeBytes))
            {
                await boundedStream.CopyToAsync(memoryStream, cancellationToken).ConfigureAwait(false);
            }

            memoryStream.Position = 0;
            return memoryStream;
        }
        catch
        {
            await memoryStream.DisposeAsync().ConfigureAwait(false);
            throw;
        }
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

    private void ApplyAuthorizationHeader(HttpRequestMessage request)
    {
        var token = _options.PersonalAccessToken?.Trim();

        if (!string.IsNullOrWhiteSpace(token))
        {
            // SEC-02: Belirteç ASLA query string üzerinden gönderilmez; yalnızca Authorization başlığında taşınır.
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }
    }

    private async Task EnsureSuccessResponseAsync(
        HttpResponseMessage response,
        string? owner,
        string? repo,
        string? commitOrRef,
        CancellationToken cancellationToken)
    {
        if (response.IsSuccessStatusCode)
            return;

        var (remaining, resetTime) = ParseRateLimitHeaders(response.Headers);

        // Rate Limit Kontrolü (HTTP 403 Forbidden)
        if (response.StatusCode == HttpStatusCode.Forbidden && (remaining == 0 || response.Headers.Contains("X-RateLimit-Remaining")))
        {
            var resetStr = resetTime.HasValue ? resetTime.Value.ToString("O") : "Bilinmiyor";
            var msg = SanitizeMessage($"GitHub API hız sınırı (Rate Limit) tükendi. Kalan istek hakkı: {remaining ?? 0}, Sıfırlanma zamanı: {resetStr}.");
            _logger.LogWarning("{Message}", msg);
            throw new GitHubRateLimitException(remaining ?? 0, resetTime ?? DateTimeOffset.UtcNow, msg);
        }

        // Repository / Resource Not Found Kontrolü (HTTP 404 Not Found)
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            var ownerStr = owner ?? "Bilinmeyen";
            var repoStr = repo ?? "Bilinmeyen";
            var msg = SanitizeMessage($"GitHub deposu veya belirtilen dal/commit bulunamadı: {ownerStr}/{repoStr} (Ref: {commitOrRef ?? "N/A"}).");
            _logger.LogWarning("{Message}", msg);
            throw new GitHubRepositoryNotFoundException(ownerStr, repoStr, commitOrRef, msg);
        }

        // Diğer HTTP hata durumları
        string? responseBody = null;
        try
        {
            responseBody = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            // Yanıt gövdesi okunamıyorsa yoksay
        }

        var errorDetail = string.IsNullOrWhiteSpace(responseBody)
            ? response.ReasonPhrase ?? "Bilinmeyen HTTP hatası"
            : responseBody;

        var finalMessage = SanitizeMessage($"GitHub API isteği başarısız oldu. Durum Kodu: {(int)response.StatusCode} ({response.StatusCode}). Detay: {errorDetail}");
        _logger.LogError("{Message}", finalMessage);

        throw new GitHubApiException(finalMessage, response.StatusCode);
    }

    private static (int? remaining, DateTimeOffset? resetTimeUtc) ParseRateLimitHeaders(HttpResponseHeaders headers)
    {
        int? remaining = null;
        DateTimeOffset? resetTime = null;

        if (headers.TryGetValues("X-RateLimit-Remaining", out var remainingValues) &&
            int.TryParse(remainingValues.FirstOrDefault(), out var parsedRemaining))
        {
            remaining = parsedRemaining;
        }

        if (headers.TryGetValues("X-RateLimit-Reset", out var resetValues) &&
            long.TryParse(resetValues.FirstOrDefault(), out var parsedResetEpoch))
        {
            resetTime = DateTimeOffset.FromUnixTimeSeconds(parsedResetEpoch);
        }

        return (remaining, resetTime);
    }

    private string SanitizeMessage(string message)
    {
        if (string.IsNullOrEmpty(_options.PersonalAccessToken))
            return message;

        return message.Replace(_options.PersonalAccessToken.Trim(), "[REDACTED_GITHUB_TOKEN]");
    }

    private sealed class GitHubTreeResponse
    {
        [JsonPropertyName("sha")]
        public string? Sha { get; set; }

        [JsonPropertyName("url")]
        public string? Url { get; set; }

        [JsonPropertyName("tree")]
        public List<GitHubTreeItemDto>? Tree { get; set; }

        [JsonPropertyName("truncated")]
        public bool Truncated { get; set; }
    }

    private sealed class GitHubTreeItemDto
    {
        [JsonPropertyName("path")]
        public string? Path { get; set; }

        [JsonPropertyName("mode")]
        public string? Mode { get; set; }

        [JsonPropertyName("type")]
        public string? Type { get; set; }

        [JsonPropertyName("sha")]
        public string? Sha { get; set; }

        [JsonPropertyName("size")]
        public long? Size { get; set; }

        [JsonPropertyName("url")]
        public string? Url { get; set; }
    }
}

