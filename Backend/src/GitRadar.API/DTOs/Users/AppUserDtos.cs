namespace GitRadar.API.DTOs.Users;

public sealed class CreateAppUserDto
{
    public string Email { get; set; } = string.Empty;
    public string FullName { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Role { get; set; } = "Admin";
    public bool IsActive { get; set; } = true;
}

public sealed class UpdateAppUserDto
{
    public string? FullName { get; set; }
    public string? Title { get; set; }
    public string? Role { get; set; }
    public bool? IsActive { get; set; }
}

