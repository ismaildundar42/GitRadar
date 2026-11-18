using System.Net;
using GitRadar.Advisory.Abstractions.Models;
using GitRadar.Advisory.OSV.Tests.TestHelpers;
using Xunit;

namespace GitRadar.Advisory.OSV.Tests.Client;

public sealed class OsvAdvisoryClientResilienceTests
{
    [Theory]
    [InlineData(HttpStatusCode.InternalServerError)]
    [InlineData(HttpStatusCode.NotFound)]
    [InlineData(HttpStatusCode.TooManyRequests)]
    [InlineData(HttpStatusCode.BadGateway)]
    public async Task Scenario1_HttpErrorStatusCodes_ReturnsFailureWithoutThrowingException(HttpStatusCode statusCode)
    {
        // Arrange
        var handler = new MockHttpMessageHandler((_, _) =>
        {
            var response = new HttpResponseMessage(statusCode)
            {
                ReasonPhrase = statusCode.ToString()
            };
            return Task.FromResult(response);
        });

        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.osv.dev/v1/") };
        var client = new OsvAdvisoryClient(httpClient);
        var query = new PackageQuery("NuGet", "FailingPackage", "1.0.0");

        // Act
        var result = await client.QueryVulnerabilitiesAsync(query, CancellationToken.None);

        // Assert: No unhandled exception, IsSuccess is false
        Assert.False(result.IsSuccess);
        Assert.Empty(result.Vulnerabilities);
        Assert.NotNull(result.DiagnosticMessage);
        Assert.Contains(((int)statusCode).ToString(), result.DiagnosticMessage);

        // Security assertion (SEC-02): Must not leak local machine path or stack trace
        Assert.DoesNotContain("at System.", result.DiagnosticMessage);
        Assert.DoesNotContain("C:\\", result.DiagnosticMessage);
    }

    [Fact]
    public async Task Scenario2_NetworkCommunicationFailure_ReturnsFailureSafely()
    {
        // Arrange: Network unreachable exception
        var handler = new MockHttpMessageHandler((_, _) =>
        {
            throw new HttpRequestException("Connection refused by target host");
        });

        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.osv.dev/v1/") };
        var client = new OsvAdvisoryClient(httpClient);
        var query = new PackageQuery("NuGet", "NetworkDropPackage", "1.0.0");

        // Act
        var result = await client.QueryVulnerabilitiesAsync(query, CancellationToken.None);

        // Assert: Handled defensively
        Assert.False(result.IsSuccess);
        Assert.Empty(result.Vulnerabilities);
        Assert.NotNull(result.DiagnosticMessage);
        Assert.Contains("network communication failure", result.DiagnosticMessage, StringComparison.OrdinalIgnoreCase);

        // Security assertion: Raw exception message is not leaked
        Assert.DoesNotContain("Connection refused", result.DiagnosticMessage);
    }

    [Fact]
    public async Task Scenario2_HttpClientTimeout_ReturnsFailureSafely()
    {
        // Arrange: Simulates HttpClient timeout (TaskCanceledException with no user cancellation)
        var handler = new MockHttpMessageHandler((_, _) =>
        {
            throw new TaskCanceledException("The request was canceled due to the configured HttpClient.Timeout.");
        });

        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.osv.dev/v1/") };
        var client = new OsvAdvisoryClient(httpClient);
        var query = new PackageQuery("NuGet", "TimeoutPackage", "1.0.0");

        // Act (User cancellation token is NOT cancelled)
        var result = await client.QueryVulnerabilitiesAsync(query, CancellationToken.None);

        // Assert
        Assert.False(result.IsSuccess);
        Assert.Empty(result.Vulnerabilities);
        Assert.NotNull(result.DiagnosticMessage);
        Assert.Contains("timed out", result.DiagnosticMessage, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Scenario3_UserCancellation_PropagatesOperationCanceledException()
    {
        // Arrange: User provides already cancelled token
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        var handler = MockHttpMessageHandler.Json("{}");
        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.osv.dev/v1/") };
        var client = new OsvAdvisoryClient(httpClient);
        var query = new PackageQuery("NuGet", "CancelledPackage", "1.0.0");

        // Act & Assert: Must throw OperationCanceledException for cooperative cancellation
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
        {
            await client.QueryVulnerabilitiesAsync(query, cts.Token);
        });

        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
        {
            await client.QueryBatchAsync([query], cts.Token);
        });
    }

    [Fact]
    public async Task BatchQuery_HttpFailure_MarksAllItemsFailedWithoutCrashing()
    {
        // Arrange
        var handler = new MockHttpMessageHandler((_, _) =>
        {
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError)
            {
                ReasonPhrase = "Internal Server Error"
            });
        });

        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("https://api.osv.dev/v1/") };
        var client = new OsvAdvisoryClient(httpClient);

        var queries = new List<PackageQuery>
        {
            new("NuGet", "Pkg1", "1.0.0"),
            new("NuGet", "Pkg2", "2.0.0")
        };

        // Act
        var batchResult = await client.QueryBatchAsync(queries, CancellationToken.None);

        // Assert
        Assert.Equal(2, batchResult.Count);
        Assert.All(batchResult.Values, r =>
        {
            Assert.False(r.IsSuccess);
            Assert.Contains("500", r.DiagnosticMessage);
        });
    }
}

