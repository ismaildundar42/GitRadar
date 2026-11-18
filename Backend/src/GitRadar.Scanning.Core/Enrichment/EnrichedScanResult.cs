using GitRadar.Scanning.Core.Models;

namespace GitRadar.Scanning.Core.Enrichment;

/// <summary>
/// Ham tarama çıktısının zafiyet istihbaratı ve SLA önceliklendirme matrisi ile birleştirilmiş nihai SCA sonucudur.
/// CIS Controls v8 Safeguard 16.4, 16.5 ve 16.6 uyumluluk kanıtıdır.
/// </summary>
public sealed record EnrichedScanResult(
    AggregatedScanResult BaseScanResult,
    IReadOnlyList<EnrichedPackageDependency> EnrichedDependencies,
    int TotalVulnerabilitiesCount,
    int CriticalCount,
    int HighCount,
    int MediumCount,
    int LowCount,
    IReadOnlyList<EnrichedVulnerability> PrioritizedActionList);

