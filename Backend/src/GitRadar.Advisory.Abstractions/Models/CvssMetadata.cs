namespace GitRadar.Advisory.Abstractions.Models;

/// <summary>
/// Common Vulnerability Scoring System (CVSS) v3.x ve v4.0 meta veri modeli.
/// Değişmezdir (Immutable).
/// </summary>
public sealed record CvssMetadata(
    string? VectorString,
    decimal? BaseScore,
    string Version);

