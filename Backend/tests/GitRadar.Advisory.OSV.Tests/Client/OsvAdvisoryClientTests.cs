using System.Net;
using GitRadar.Advisory.Abstractions.Models;
using GitRadar.Advisory.OSV.Tests.TestHelpers;
using Xunit;

namespace GitRadar.Advisory.OSV.Tests.Client;

public sealed class OsvAdvisoryClientTests
{
    [Fact]
    public async Task Scenario1_SingleVulnerablePackage_DeserializesVulnerabilityRecordAccurately()
    {
        // Arrange
        const string responseJson = """
            {
              "vulns": [
                {
                  "id": "GHSA-5crp-9r3c-p9vr",
                  "summary": "Improper Handling of Exceptional Conditions in Newtonsoft.Json",
                  "details": "Newtonsoft.Json prior to 13.0.1 is vulnerable to DoS attacks.",
                  "aliases": ["CVE-2024-21907"],
                  "published": "2024-01-08T22:25:01Z",
                  "modified": "2024-01-08T22:25:01Z",
                  "severity": [
                    {
                      "type": "CVSS_V3",
                      "score": "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H"
                    }
                  ],
                  "affected": [
                    {
                      "package": {
                        "name": "Newtonsoft.Json",
                        "ecosystem": "NuGet"
                      },
                      "ranges": [
                        {
                          "type": "ECOSYSTEM",
                          "events": [
                            { "introduced": "0" },
                            { "fixed": "13.0.1" }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
            """;

        var handler = MockHttpMessageHandler.Json(responseJson);
        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.osv.dev/v1/") };
        var client = new OsvAdvisoryClient(httpClient);

        var query = new PackageQuery("NuGet", "Newtonsoft.Json", "12.0.1");

        // Act
        var result = await client.QueryVulnerabilitiesAsync(query, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Null(result.DiagnosticMessage);
        Assert.Equal(query, result.Query);

        var vuln = Assert.Single(result.Vulnerabilities);
        Assert.Equal("GHSA-5crp-9r3c-p9vr", vuln.Id);
        Assert.Equal("Improper Handling of Exceptional Conditions in Newtonsoft.Json", vuln.Summary);
        Assert.Equal("Newtonsoft.Json prior to 13.0.1 is vulnerable to DoS attacks.", vuln.Details);
        Assert.Contains("CVE-2024-21907", vuln.Aliases);
        Assert.Equal("13.0.1", vuln.FixedVersion);
        Assert.Equal(SeverityLevel.High, vuln.Severity);
        Assert.NotNull(vuln.Cvss);
        Assert.Equal(7.5m, vuln.Cvss.BaseScore);
        Assert.NotNull(vuln.PublishedAtUtc);
    }

    [Fact]
    public async Task Scenario2_CleanPackage_ReturnsSuccessWithEmptyVulnerabilities()
    {
        // Arrange: Zero vulnerabilities return empty object
        const string emptyResponseJson = "{}";

        var handler = MockHttpMessageHandler.Json(emptyResponseJson);
        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.osv.dev/v1/") };
        var client = new OsvAdvisoryClient(httpClient);

        var query = new PackageQuery("NuGet", "Microsoft.Extensions.Logging", "10.0.0");

        // Act
        var result = await client.QueryVulnerabilitiesAsync(query, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Empty(result.Vulnerabilities);
        Assert.Null(result.DiagnosticMessage);
    }

    [Fact]
    public async Task Scenario3_BatchQuery_ChunkingAbove1000Queries_SplitsRequestsAndMapsAccurately()
    {
        // Arrange: 1050 queries (Chunk 1: 1000, Chunk 2: 50)
        const int totalCount = 1050;
        var queries = Enumerable.Range(1, totalCount)
            .Select(i => new PackageQuery("NuGet", $"Package{i}", "1.0.0"))
            .ToList();

        var handler = new MockHttpMessageHandler((req, _) =>
        {
            // Simulate batch response matching the batch size
            var response = new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"results": []}""", System.Text.Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        });

        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.osv.dev/v1/") };
        var client = new OsvAdvisoryClient(httpClient);

        // Act
        var batchResult = await client.QueryBatchAsync(queries, CancellationToken.None);

        // Assert: 1050 items split into 2 HTTP POST calls
        Assert.Equal(2, handler.RequestCount);
        Assert.Equal(totalCount, batchResult.Count);

        foreach (var q in queries)
        {
            Assert.True(batchResult.ContainsKey(q));
            Assert.True(batchResult[q].IsSuccess);
        }
    }

    [Fact]
    public async Task Scenario4_LargeDescription_SanitizesAndTruncatesExcessiveLength()
    {
        // Arrange: Massive 15,000 characters description
        var largeDetails = new string('A', 15000);
        var json = $$"""
            {
              "vulns": [
                {
                  "id": "GHSA-TEST-OVERSIZE",
                  "details": "{{largeDetails}}"
                }
              ]
            }
            """;

        var handler = MockHttpMessageHandler.Json(json);
        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.osv.dev/v1/") };
        var client = new OsvAdvisoryClient(httpClient);

        var query = new PackageQuery("NuGet", "HugePackage", "1.0.0");

        // Act
        var result = await client.QueryVulnerabilitiesAsync(query, CancellationToken.None);

        // Assert
        Assert.True(result.IsSuccess);
        var vuln = Assert.Single(result.Vulnerabilities);
        Assert.NotNull(vuln.Details);
        // Truncated to 10,000 + "... [truncated]"
        Assert.True(vuln.Details.Length <= 10020);
        Assert.EndsWith("... [truncated]", vuln.Details);
    }
}

