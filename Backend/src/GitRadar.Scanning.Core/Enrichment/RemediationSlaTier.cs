using GitRadar.Advisory.Abstractions.Models;

namespace GitRadar.Scanning.Core.Enrichment;

/// <summary>
/// Zafiyet önem derecesine göre azami çözüm penceresi ve öncelik derecesi belirten SLA modelidir.
/// CIS Controls v8 Safeguard 16.6 önceliklendirme standardını uygular.
/// </summary>
public sealed record RemediationSlaTier(
    SeverityLevel Severity,
    TimeSpan MaxResolutionWindow,
    int PriorityRank);

