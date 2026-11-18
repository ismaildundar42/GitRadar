namespace GitRadar.API.DTOs.Common;

/// <summary>
/// Güvenli, hassas verilerden arındırılmış hata yanıt modelidir (SEC-02).
/// </summary>
public sealed record ErrorResponseDto(
    string Message,
    string? Detail = null,
    string? TraceId = null);

