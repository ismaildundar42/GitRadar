using System.Net;

namespace GitRadar.Application.Contracts.GitHub.Exceptions;

/// <summary>
/// Hedef GitHub deposunun veya belirtilen dal/commit referansının bulunamadığını (HTTP 404 Not Found) belirten istisna türüdür.
/// </summary>
public sealed class GitHubRepositoryNotFoundException : GitHubApiException
{
    public string Owner { get; }
    public string Repo { get; }
    public string? CommitOrBranch { get; }

    public GitHubRepositoryNotFoundException(
        string owner,
        string repo,
        string? commitOrBranch,
        string message)
        : base(message, HttpStatusCode.NotFound)
    {
        Owner = owner;
        Repo = repo;
        CommitOrBranch = commitOrBranch;
    }
}

