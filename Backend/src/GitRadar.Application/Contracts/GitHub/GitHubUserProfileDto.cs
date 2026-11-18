namespace GitRadar.Application.Contracts.GitHub;

/// <summary>
/// GitHub API (/user) üzerinden otomatik çekilen profil ve kimlik DTO'sudur.
/// </summary>
public class GitHubUserProfileDto
{
    public string Login { get; set; } = "";
    public string Name { get; set; } = "";
    public string AvatarUrl { get; set; } = "";
    public string Type { get; set; } = "User";
    public bool IsValid { get; set; } = true;
    public string Username => Login;
}

