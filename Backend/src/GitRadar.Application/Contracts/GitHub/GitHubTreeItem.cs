namespace GitRadar.Application.Contracts.GitHub;

/// <summary>
/// GitHub Git Tree API yanıtındaki tekil bir ağaç veya blob öğesini temsil eden değişmez modeldir.
/// </summary>
public sealed record GitHubTreeItem(
    string Path,
    string Sha,
    string Type,
    long Size,
    string Url);

