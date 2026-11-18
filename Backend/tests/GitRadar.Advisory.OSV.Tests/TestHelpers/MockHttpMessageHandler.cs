using System.Net;

namespace GitRadar.Advisory.OSV.Tests.TestHelpers;

internal sealed class MockHttpMessageHandler : HttpMessageHandler
{
    private readonly Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> _handler;

    public int RequestCount { get; private set; }
    public List<HttpRequestMessage> RecordedRequests { get; } = [];

    public MockHttpMessageHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler)
    {
        _handler = handler ?? throw new ArgumentNullException(nameof(handler));
    }

    public MockHttpMessageHandler(Func<HttpRequestMessage, HttpResponseMessage> syncHandler)
    {
        ArgumentNullException.ThrowIfNull(syncHandler);
        _handler = (req, _) => Task.FromResult(syncHandler(req));
    }

    public static MockHttpMessageHandler Json(string jsonContent, HttpStatusCode statusCode = HttpStatusCode.OK)
    {
        return new MockHttpMessageHandler((_, _) =>
        {
            var response = new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(jsonContent, System.Text.Encoding.UTF8, "application/json")
            };
            return Task.FromResult(response);
        });
    }

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        RequestCount++;
        RecordedRequests.Add(request);
        return await _handler(request, cancellationToken);
    }
}

