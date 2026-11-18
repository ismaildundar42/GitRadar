namespace GitRadar.Advisory.Abstractions.Models;

/// <summary>
/// Bir paket sorgusunun zafiyet arama sonucu.
/// Değişmezdir (Immutable).
/// </summary>
public sealed record AdvisoryQueryResult(
    PackageQuery Query,
    IReadOnlyList<AdvisoryVulnerability> Vulnerabilities,
    bool IsSuccess,
    string? DiagnosticMessage)
{
    public static AdvisoryQueryResult Success(PackageQuery query, IReadOnlyList<AdvisoryVulnerability> vulnerabilities) =>
        new(query, vulnerabilities, IsSuccess: true, DiagnosticMessage: null);

    public static AdvisoryQueryResult Failure(PackageQuery query, string diagnosticMessage) =>
        new(query, Vulnerabilities: [], IsSuccess: false, DiagnosticMessage: diagnosticMessage);
}

