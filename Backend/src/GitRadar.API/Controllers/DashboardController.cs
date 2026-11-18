using GitRadar.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GitRadar.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public sealed class DashboardController : ControllerBase
{
    private readonly GitRadarDbContext _context;

    public DashboardController(GitRadarDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    /// <summary>
    /// Dashboard genel durum metriklerini ve CIS sayaçlarını döner.
    /// </summary>
    [HttpGet("stats")]
    [AllowAnonymous]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDashboardStats(CancellationToken cancellationToken)
    {
        // 1. Her aktif depo için en güncel tamamlanan tarama ID'sini belirle
        var latestScanIds = await _context.Repositories
            .Where(r => r.Status == Domain.Enums.RepositoryStatus.Active)
            .Select(r => r.ScanExecutions
                .Where(s => s.Status == Domain.Enums.ScanStatus.Completed)
                .OrderByDescending(s => s.CreatedAtUtc)
                .Select(s => (long?)s.Id)
                .FirstOrDefault())
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .ToListAsync(cancellationToken);

        if (latestScanIds.Count == 0)
        {
            latestScanIds = await _context.ScanExecutions
                .Where(s => s.Status == Domain.Enums.ScanStatus.Completed)
                .GroupBy(s => s.RepositoryId)
                .Select(g => g.Max(s => s.Id))
                .ToListAsync(cancellationToken);
        }

        var totalRepos = await _context.Repositories
            .Where(r => r.Status == Domain.Enums.RepositoryStatus.Active)
            .CountAsync(cancellationToken);

        var totalPkgs = await _context.DiscoveredPackages
            .Where(p => latestScanIds.Contains(p.ScanExecutionId))
            .CountAsync(cancellationToken);

        var alerts = await _context.VulnerabilityAlerts
            .Where(v => latestScanIds.Contains(v.ScanExecutionId))
            .Select(v => new { v.Severity, v.Status })
            .ToListAsync(cancellationToken);

        var activeAlerts = alerts
            .Where(v => v.Status == Domain.Enums.VulnerabilityAlertStatus.Open || v.Status == Domain.Enums.VulnerabilityAlertStatus.InProgress)
            .ToList();

        var critical = activeAlerts.Count(s => s.Severity == Domain.Enums.SeverityLevel.Critical);
        var high = activeAlerts.Count(s => s.Severity == Domain.Enums.SeverityLevel.High);
        var medium = activeAlerts.Count(s => s.Severity == Domain.Enums.SeverityLevel.Medium);
        var low = activeAlerts.Count(s => s.Severity == Domain.Enums.SeverityLevel.Low);

        return Ok(new
        {
            totalRepositories = totalRepos,
            totalComponents = totalPkgs,
            totalVulnerabilities = activeAlerts.Count,
            criticalVulnerabilities = critical,
            highVulnerabilities = high,
            mediumVulnerabilities = medium,
            lowVulnerabilities = low,
            TotalRepositories = totalRepos,
            TotalComponents = totalPkgs,
            TotalVulnerabilities = activeAlerts.Count,
            CriticalVulnerabilities = critical,
            HighVulnerabilities = high,
            MediumVulnerabilities = medium,
            LowVulnerabilities = low,
            RepositoriesCount = totalRepos,
            PackagesCount = totalPkgs,
            VulnerabilitiesCount = activeAlerts.Count,
            CriticalCount = critical,
            HighCount = high
        });
    }
}
