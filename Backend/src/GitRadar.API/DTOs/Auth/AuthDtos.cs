namespace GitRadar.API.DTOs.Auth;

/// <summary>
/// Kullanıcı giriş isteği DTO'sudur.
/// </summary>
public sealed record LoginDto(
    string Email,
    string Password);

/// <summary>
/// Başarılı kimlik doğrulama sonucu dönen JWT Token ve temel kullanıcı bilgileri yanıtıdır.
/// </summary>
public sealed record AuthResponseDto(
    string Token,
    string Email,
    string Role,
    string? FullName,
    DateTime Expiration);

/// <summary>
/// Anlık aktif kullanıcı oturum profilini dönen DTO'dur.
/// </summary>
public sealed record CurrentUserDto(
    string Id,
    string Email,
    string? FullName,
    string Role,
    string? Department);

/// <summary>
/// Microsoft Entra ID genel istemci yapılandırma DTO'sudur (ClientSecret ASLA dönülmez).
/// </summary>
public sealed record EntraConfigDto(
    string Instance,
    string TenantId,
    string ClientId,
    string CallbackPath,
    bool IsConfigured);

/// <summary>
/// Microsoft Entra ID giriş isteği DTO'sudur.
/// Authorization Code veya doğrudan ID Token ile çalışabilir.
/// </summary>
public sealed record EntraLoginRequestDto(
    string? Code = null,
    string? RedirectUri = null,
    string? IdToken = null);

