namespace GitRadar.API.DTOs.Settings;

/// <summary>
/// Sistem genelinde aktif GitHub entegrasyonu ve hesap durumunu temsil eden DTO.
/// </summary>
public sealed class GitHubSettingsDto
{
    public string? DetectedLogin { get; set; }
    public string? DetectedName { get; set; }
    public string? Username => DetectedLogin;
    public string? Login => DetectedLogin;
    public string? Name => DetectedName;
    public string? AvatarUrl { get; set; }
    public string? TargetOrg { get; set; }
    public string? TargetOrganization { get; set; }
    public string? AccountType { get; set; } = "User";
    public bool IsValid { get; set; }
    public bool HasToken { get; set; }
    public string? MaskedToken { get; set; }
    public DateTime? LastVerifiedAt { get; set; }
}

/// <summary>
/// GitHub PAT doğrulama isteği DTO'sudur.
/// </summary>
public sealed class VerifyTokenRequestDto
{
    public string? Token { get; set; }
}

/// <summary>
/// GitHub PAT ve Hedef Organizasyon güncelleme isteği DTO'sudur.
/// </summary>
public sealed class UpdateGitHubSettingsRequestDto
{
    public string? Token { get; set; }
    public string? TargetOrganization { get; set; }
}

