using System.Net;

namespace GitRadar.Application.Contracts.GitHub.Exceptions;

/// <summary>
/// GitHub REST API hız sınırının (Rate Limit) tükendiğini (HTTP 403 Forbidden) belirten özel istisna türüdür.
/// </summary>
public sealed class GitHubRateLimitException : GitHubApiException
{
    public int RemainingRequests { get; }
    public DateTimeOffset ResetTimeUtc { get; }

    public GitHubRateLimitException(
        int remainingRequests,
        DateTimeOffset resetTimeUtc,
        string message)
        : base(message, HttpStatusCode.Forbidden)
    {
        RemainingRequests = remainingRequests;
        ResetTimeUtc = resetTimeUtc;
    }
}

