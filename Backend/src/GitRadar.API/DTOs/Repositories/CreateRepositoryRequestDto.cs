namespace GitRadar.API.DTOs.Repositories;

/// <summary>
/// Yeni depo kayıt isteği modelidir.
/// </summary>
public sealed record CreateRepositoryRequestDto(
    string Owner,
    string Name,
    string? RemoteUrl,
    string? DefaultBranch,
    bool IsPrivate);

