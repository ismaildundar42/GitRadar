namespace GitRadar.Application.Contracts.GitHub;

/// <summary>
/// GitHub /user endpoint'i üzerinden doğrulanan hesap ve kimlik profil DTO'sudur.
/// </summary>
public sealed record GitHubAccountProfileDto(
    string Login,
    string? Name,
    string Type,
    string? Email,
    string? AvatarUrl,
    int? PublicRepos,
    int? TotalPrivateRepos);

