using System.Net;

namespace GitRadar.Application.Contracts.GitHub.Exceptions;

/// <summary>
/// GitHub REST API iletişiminde meydana gelen HTTP veya protokol seviyesindeki hataları temsil eden temel istisna sınıfıdır.
/// Güvenlik gereği hassas belirteçleri (Token) mesaj içeriğinde barındırmaz.
/// </summary>
public class GitHubApiException : HttpRequestException
{
    public HttpStatusCode? ResponseStatusCode { get; }

    public GitHubApiException(
        string message,
        HttpStatusCode? statusCode = null,
        Exception? innerException = null)
        : base(message, innerException, statusCode)
    {
        ResponseStatusCode = statusCode;
    }
}

