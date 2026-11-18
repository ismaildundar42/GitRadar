using System.Text.Json;
using System.Text.Json.Serialization;

namespace GitRadar.Advisory.OSV.Models;

internal sealed class OsvQueryRequest
{
    [JsonPropertyName("version")]
    public string? Version { get; set; }

    [JsonPropertyName("package")]
    public OsvPackage? Package { get; set; }
}

internal sealed class OsvPackage
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("ecosystem")]
    public string Ecosystem { get; set; } = string.Empty;
}

internal sealed class OsvBatchQueryRequest
{
    [JsonPropertyName("queries")]
    public List<OsvQueryRequest> Queries { get; set; } = [];
}

internal sealed class OsvQueryResponse
{
    [JsonPropertyName("vulns")]
    public List<OsvVulnerability>? Vulns { get; set; }
}

internal sealed class OsvBatchQueryResponse
{
    [JsonPropertyName("results")]
    public List<OsvQueryResponse>? Results { get; set; }
}

internal sealed class OsvVulnerability
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = string.Empty;

    [JsonPropertyName("summary")]
    public string? Summary { get; set; }

    [JsonPropertyName("details")]
    public string? Details { get; set; }

    [JsonPropertyName("aliases")]
    public List<string>? Aliases { get; set; }

    [JsonPropertyName("published")]
    public DateTimeOffset? Published { get; set; }

    [JsonPropertyName("modified")]
    public DateTimeOffset? Modified { get; set; }

    [JsonPropertyName("severity")]
    public List<OsvSeverity>? Severity { get; set; }

    [JsonPropertyName("database_specific")]
    public JsonElement? DatabaseSpecific { get; set; }

    [JsonPropertyName("ecosystem_specific")]
    public JsonElement? EcosystemSpecific { get; set; }

    [JsonPropertyName("affected")]
    public List<OsvAffected>? Affected { get; set; }
}

internal sealed class OsvSeverity
{
    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("score")]
    public string? Score { get; set; }
}

internal sealed class OsvAffected
{
    [JsonPropertyName("package")]
    public OsvPackage? Package { get; set; }

    [JsonPropertyName("ranges")]
    public List<OsvRange>? Ranges { get; set; }
}

internal sealed class OsvRange
{
    [JsonPropertyName("type")]
    public string? Type { get; set; }

    [JsonPropertyName("events")]
    public List<Dictionary<string, string>>? Events { get; set; }
}

