using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using GitRadar.Advisory.Abstractions;
using GitRadar.Advisory.Abstractions.Models;
using GitRadar.Advisory.OSV.Cvss;
using GitRadar.Advisory.OSV.Models;
using Microsoft.Extensions.Logging;

namespace GitRadar.Advisory.OSV;

/// <summary>
/// Google tarafından yönetilen açık kaynaklı OSV.dev REST API v1 istemcisidir.
/// CIS Controls v8 Safeguard 16.5 ve 16.6 standartlarıyla tam uyumlu çalışır.
/// Hata durumlarında üst katmana exception fırlatmaz (SEC-02 hata izolasyonu).
/// </summary>
public sealed class OsvAdvisoryClient : IAdvisoryClient
{
    public const string DefaultClientName = "OsvAdvisoryClient";
    public const string DefaultBaseAddress = "https://api.osv.dev/v1/";
    public const int MaxBatchChunkSize = 1000;

    private readonly HttpClient? _httpClient;
    private readonly IHttpClientFactory? _httpClientFactory;
    private readonly string _clientName;
    private readonly ILogger<OsvAdvisoryClient>? _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        PropertyNameCaseInsensitive = true
    };

    public string ProviderName => "OSV.dev";

    public OsvAdvisoryClient(HttpClient httpClient, ILogger<OsvAdvisoryClient>? logger = null)
    {
        _httpClient = httpClient ?? throw new ArgumentNullException(nameof(httpClient));
        _logger = logger;
        _clientName = DefaultClientName;
    }

    public OsvAdvisoryClient(
        IHttpClientFactory httpClientFactory,
        ILogger<OsvAdvisoryClient>? logger = null,
        string clientName = DefaultClientName)
    {
        _httpClientFactory = httpClientFactory ?? throw new ArgumentNullException(nameof(httpClientFactory));
        _logger = logger;
        _clientName = clientName;
    }

    /// <inheritdoc />
    public async Task<AdvisoryQueryResult> QueryVulnerabilitiesAsync(PackageQuery query, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(query);
        cancellationToken.ThrowIfCancellationRequested();

        var requestPayload = new OsvQueryRequest
        {
            Version = query.Version,
            Package = new OsvPackage
            {
                Name = query.PackageName,
                Ecosystem = query.Ecosystem
            }
        };

        var client = ResolveClient();
        var requestUri = ResolveUri(client, "query");

        try
        {
            using var response = await client.PostAsJsonAsync(requestUri, requestPayload, JsonOptions, cancellationToken).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                var statusCode = (int)response.StatusCode;
                var reason = response.ReasonPhrase ?? "Unknown";
                _logger?.LogWarning("OSV.dev API query returned HTTP {StatusCode} {Reason}", statusCode, reason);

                return AdvisoryQueryResult.Failure(
                    query,
                    $"OSV service query failed with HTTP status {statusCode} ({reason}).");
            }

            var responseBody = await response.Content.ReadFromJsonAsync<OsvQueryResponse>(JsonOptions, cancellationToken).ConfigureAwait(false);
            var vulnerabilities = MapVulnerabilities(responseBody?.Vulns);

            return AdvisoryQueryResult.Success(query, vulnerabilities);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Çağıranın bilinçli iptal talebi yukarıya iletilir
            throw;
        }
        catch (OperationCanceledException)
        {
            // HttpClient timeout kaynaklı iptal
            _logger?.LogWarning("OSV.dev API query timed out for package {Package}", query);
            return AdvisoryQueryResult.Failure(query, "OSV service request timed out.");
        }
        catch (HttpRequestException ex)
        {
            _logger?.LogError(ex, "OSV.dev API network error for package {Package}", query);
            return AdvisoryQueryResult.Failure(query, "OSV service network communication failure.");
        }
        catch (JsonException ex)
        {
            _logger?.LogError(ex, "OSV.dev API JSON deserialization error for package {Package}", query);
            return AdvisoryQueryResult.Failure(query, "OSV service response deserialization failed.");
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Unexpected error querying OSV.dev for package {Package}", query);
            return AdvisoryQueryResult.Failure(query, $"OSV service query encountered an unexpected error ({ex.GetType().Name}).");
        }
    }

    /// <inheritdoc />
    public async Task<IReadOnlyDictionary<PackageQuery, AdvisoryQueryResult>> QueryBatchAsync(
        IReadOnlyList<PackageQuery> queries,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(queries);
        cancellationToken.ThrowIfCancellationRequested();

        if (queries.Count == 0)
        {
            return new Dictionary<PackageQuery, AdvisoryQueryResult>();
        }

        var results = new Dictionary<PackageQuery, AdvisoryQueryResult>();

        // 1000'lik güvenli yığınlar (chunks) halinde sorgula
        for (var i = 0; i < queries.Count; i += MaxBatchChunkSize)
        {
            cancellationToken.ThrowIfCancellationRequested();

            var chunk = queries.Skip(i).Take(MaxBatchChunkSize).ToList();
            await ProcessBatchChunkAsync(chunk, results, cancellationToken).ConfigureAwait(false);
        }

        return results;
    }

    private async Task ProcessBatchChunkAsync(
        IReadOnlyList<PackageQuery> chunk,
        Dictionary<PackageQuery, AdvisoryQueryResult> destination,
        CancellationToken cancellationToken)
    {
        var batchRequest = new OsvBatchQueryRequest
        {
            Queries = chunk.Select(q => new OsvQueryRequest
            {
                Version = q.Version,
                Package = new OsvPackage
                {
                    Name = q.PackageName,
                    Ecosystem = q.Ecosystem
                }
            }).ToList()
        };

        var client = ResolveClient();
        var requestUri = ResolveUri(client, "querybatch");

        try
        {
            using var response = await client.PostAsJsonAsync(requestUri, batchRequest, JsonOptions, cancellationToken).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                var statusCode = (int)response.StatusCode;
                var reason = response.ReasonPhrase ?? "Unknown";
                _logger?.LogWarning("OSV.dev batch query returned HTTP {StatusCode} {Reason}", statusCode, reason);

                foreach (var query in chunk)
                {
                    destination[query] = AdvisoryQueryResult.Failure(
                        query,
                        $"OSV service batch query failed with HTTP status {statusCode} ({reason}).");
                }
                return;
            }

            var batchResponse = await response.Content.ReadFromJsonAsync<OsvBatchQueryResponse>(JsonOptions, cancellationToken).ConfigureAwait(false);
            var resultList = batchResponse?.Results;

            for (var idx = 0; idx < chunk.Count; idx++)
            {
                var query = chunk[idx];
                if (resultList is not null && idx < resultList.Count)
                {
                    var itemResponse = resultList[idx];
                    var vulns = MapVulnerabilities(itemResponse?.Vulns);
                    destination[query] = AdvisoryQueryResult.Success(query, vulns);
                }
                else
                {
                    destination[query] = AdvisoryQueryResult.Success(query, []);
                }
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            _logger?.LogWarning("OSV.dev batch query timed out for {Count} items", chunk.Count);
            foreach (var query in chunk)
            {
                destination[query] = AdvisoryQueryResult.Failure(query, "OSV service batch request timed out.");
            }
        }
        catch (HttpRequestException ex)
        {
            _logger?.LogError(ex, "OSV.dev batch network communication error");
            foreach (var query in chunk)
            {
                destination[query] = AdvisoryQueryResult.Failure(query, "OSV service batch network communication failure.");
            }
        }
        catch (JsonException ex)
        {
            _logger?.LogError(ex, "OSV.dev batch JSON deserialization error");
            foreach (var query in chunk)
            {
                destination[query] = AdvisoryQueryResult.Failure(query, "OSV service batch response deserialization failed.");
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Unexpected error during OSV.dev batch query");
            foreach (var query in chunk)
            {
                destination[query] = AdvisoryQueryResult.Failure(query, $"OSV service batch query encountered an unexpected error ({ex.GetType().Name}).");
            }
        }
    }

    private static IReadOnlyList<AdvisoryVulnerability> MapVulnerabilities(List<OsvVulnerability>? osvVulns)
    {
        if (osvVulns is null || osvVulns.Count == 0)
            return [];

        var list = new List<AdvisoryVulnerability>(osvVulns.Count);

        foreach (var v in osvVulns)
        {
            if (string.IsNullOrWhiteSpace(v.Id))
                continue;

            var (cvss, severity) = CvssScoreParser.ParseCvssAndSeverity(v.Severity, v.DatabaseSpecific, v.EcosystemSpecific);
            var fixedVersion = ExtractFixedVersion(v.Affected);
            var sanitizedDetails = SanitizeDetails(v.Details);

            list.Add(new AdvisoryVulnerability(
                Id: v.Id.Trim(),
                Summary: v.Summary?.Trim(),
                Details: sanitizedDetails,
                Aliases: v.Aliases?.Where(a => !string.IsNullOrWhiteSpace(a)).Select(a => a.Trim()).ToList() ?? [],
                Severity: severity,
                Cvss: cvss,
                FixedVersion: fixedVersion,
                PublishedAtUtc: v.Published,
                ModifiedAtUtc: v.Modified));
        }

        return list;
    }

    private static string? ExtractFixedVersion(List<OsvAffected>? affectedList)
    {
        if (affectedList is null || affectedList.Count == 0)
            return null;

        foreach (var affected in affectedList)
        {
            if (affected.Ranges is null)
                continue;

            foreach (var range in affected.Ranges)
            {
                if (range.Events is null)
                    continue;

                foreach (var evt in range.Events)
                {
                    if (evt.TryGetValue("fixed", out var fixedVer) && !string.IsNullOrWhiteSpace(fixedVer))
                    {
                        return fixedVer.Trim();
                    }
                }
            }
        }

        return null;
    }

    private static string? SanitizeDetails(string? details)
    {
        if (string.IsNullOrWhiteSpace(details))
            return null;

        var text = details.Trim();

        // 10.000 karakterlik güvenli üst sınır clamping
        if (text.Length > 10000)
        {
            text = text[..10000] + "... [truncated]";
        }

        return text;
    }

    private HttpClient ResolveClient()
    {
        if (_httpClient is not null)
            return _httpClient;

        return _httpClientFactory!.CreateClient(_clientName);
    }

    private static Uri ResolveUri(HttpClient client, string relativePath)
    {
        if (client.BaseAddress is not null)
        {
            return new Uri(client.BaseAddress, relativePath);
        }

        return new Uri(new Uri(DefaultBaseAddress), relativePath);
    }
}

