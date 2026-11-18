using GitRadar.Advisory.Abstractions.Models;
using GitRadar.Scanning.Abstractions.Models;

namespace GitRadar.Scanning.Core.Enrichment;

/// <summary>
/// Taranan bir ham bağımlılık ile ilişkili zafiyetleri ve en yüksek risk seviyesini barındıran zenginleştirilmiş modeldir.
/// </summary>
public sealed record EnrichedPackageDependency(
    RawDependency Dependency,
    IReadOnlyList<EnrichedVulnerability> Vulnerabilities,
    SeverityLevel HighestSeverity,
    bool IsVulnerable);

