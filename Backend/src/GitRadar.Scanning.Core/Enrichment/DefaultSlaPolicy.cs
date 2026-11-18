using GitRadar.Advisory.Abstractions.Models;

namespace GitRadar.Scanning.Core.Enrichment;

/// <summary>
/// CIS Controls v8 Safeguard 16.6 standardına dayalı varsayılan kurumsal SLA politikasıdır.
/// </summary>
public static class DefaultSlaPolicy
{
    public static readonly RemediationSlaTier Critical = new(SeverityLevel.Critical, TimeSpan.FromDays(7), 1);
    public static readonly RemediationSlaTier High = new(SeverityLevel.High, TimeSpan.FromDays(14), 2);
    public static readonly RemediationSlaTier Medium = new(SeverityLevel.Medium, TimeSpan.FromDays(30), 3);
    public static readonly RemediationSlaTier Low = new(SeverityLevel.Low, TimeSpan.FromDays(60), 4);
    public static readonly RemediationSlaTier None = new(SeverityLevel.None, TimeSpan.Zero, 5);

    /// <summary>
    /// Belirtilen önem derecesine karşılık gelen kurumsal SLA seviyesini döner.
    /// </summary>
    public static RemediationSlaTier GetTier(SeverityLevel severity) => severity switch
    {
        SeverityLevel.Critical => Critical,
        SeverityLevel.High => High,
        SeverityLevel.Medium => Medium,
        SeverityLevel.Low => Low,
        _ => None
    };
}

