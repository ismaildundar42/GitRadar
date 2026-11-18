namespace GitRadar.Scanning.Abstractions.Models;

/// <summary>
/// Manifest ayrıştırma sürecinde üretilen uyarı, hata veya bilgilendirme teşhis kaydı.
/// Değişmezdir (Immutable).
/// </summary>
public sealed class ScannerDiagnostic
{
    public string Message { get; }
    public DiagnosticSeverity Severity { get; }
    public string? ManifestPath { get; }
    public int? LineNumber { get; }
    public string? ErrorCode { get; }

    public ScannerDiagnostic(
        string message,
        DiagnosticSeverity severity,
        string? manifestPath = null,
        int? lineNumber = null,
        string? errorCode = null)
    {
        if (string.IsNullOrWhiteSpace(message))
            throw new ArgumentException("Teşhis mesajı boş olamaz.", nameof(message));

        Message = message.Trim();
        Severity = severity;
        ManifestPath = string.IsNullOrWhiteSpace(manifestPath) ? null : manifestPath.Trim();
        LineNumber = lineNumber > 0 ? lineNumber : null;
        ErrorCode = string.IsNullOrWhiteSpace(errorCode) ? null : errorCode.Trim();
    }

    public static ScannerDiagnostic Info(string message, string? manifestPath = null, int? lineNumber = null) =>
        new(message, DiagnosticSeverity.Info, manifestPath, lineNumber);

    public static ScannerDiagnostic Warning(string message, string? manifestPath = null, int? lineNumber = null, string? errorCode = null) =>
        new(message, DiagnosticSeverity.Warning, manifestPath, lineNumber, errorCode);

    public static ScannerDiagnostic Error(string message, string? manifestPath = null, int? lineNumber = null, string? errorCode = null) =>
        new(message, DiagnosticSeverity.Error, manifestPath, lineNumber, errorCode);

    public override string ToString()
    {
        var location = ManifestPath is not null
            ? LineNumber.HasValue ? $" ({ManifestPath}:{LineNumber})" : $" ({ManifestPath})"
            : string.Empty;

        var code = ErrorCode is not null ? $"[{ErrorCode}] " : string.Empty;
        return $"[{Severity}] {code}{Message}{location}";
    }
}

