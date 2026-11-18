namespace GitRadar.Application.Contracts.GitHub;

/// <summary>
/// GitHub REST API üzerinden keşfedilen kurumsal deponun modelidir.
/// </summary>
public sealed record GitHubRepositoryDto(
    long Id,
    string Name,
    string FullName,
    string Owner,
    string DefaultBranch,
    bool IsPrivate,
    string HtmlUrl,
    DateTime? PushedAt,
    DateTime? UpdatedAt);

