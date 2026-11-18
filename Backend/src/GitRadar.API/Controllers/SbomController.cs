using GitRadar.API.DTOs.Sbom;
using GitRadar.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GitRadar.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public sealed class SbomController : ControllerBase
{
    private readonly GitRadarDbContext _context;

    public SbomController(GitRadarDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    /// <summary>
    /// CIS Controls 16.4: Taranan tüm aktif depoların en güncel tamamlanan taramalarındaki üçüncü parti yazılım bileşenlerini (SBOM) listeler.
    /// repositoryId parametresi verilirse yalnızca o depoya ait bileşenler, verilmezse veya 0 ise GLOBAL tüm envanter listelenir.
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(List<SbomComponentDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetSbom([FromQuery] long? repositoryId, CancellationToken cancellationToken)
    {
        // 1. Hedef depoya veya tüm aktif depolara göre en güncel tamamlanmış tarama ID'lerini belirle
        var repoQuery = _context.Repositories
            .Where(r => r.Status == Domain.Enums.RepositoryStatus.Active);

        if (repositoryId.HasValue && repositoryId.Value > 0)
        {
            repoQuery = repoQuery.Where(r => r.Id == repositoryId.Value);
        }

        var latestScanIds = await repoQuery
            .Select(r => r.ScanExecutions
                .Where(s => s.Status == Domain.Enums.ScanStatus.Completed)
                .OrderByDescending(s => s.CreatedAtUtc)
                .Select(s => (long?)s.Id)
                .FirstOrDefault())
            .Where(id => id.HasValue)
            .Select(id => id!.Value)
            .ToListAsync(cancellationToken);

        // Fallback: Depo navigasyonu henüz ilişkilendirilmemişse doğrudan ScanExecutions tablosundan en son tamamlananları al
        if (latestScanIds.Count == 0)
        {
            var scanQuery = _context.ScanExecutions
                .Where(s => s.Status == Domain.Enums.ScanStatus.Completed);

            if (repositoryId.HasValue && repositoryId.Value > 0)
            {
                scanQuery = scanQuery.Where(s => s.RepositoryId == repositoryId.Value);
            }

            latestScanIds = await scanQuery
                .GroupBy(s => s.RepositoryId)
                .Select(g => g.Max(s => s.Id))
                .ToListAsync(cancellationToken);
        }

        if (latestScanIds.Count == 0)
        {
            return Ok(new List<SbomComponentDto>());
        }

        // 2. Bu taramalardaki keşfedilen paketleri ve depo bilgilerini çek (SQL Server için güvenli kolon haritalaması)
        var rawPackages = await _context.DiscoveredPackages
            .AsNoTracking()
            .Where(p => latestScanIds.Contains(p.ScanExecutionId))
            .Join(_context.ScanExecutions, p => p.ScanExecutionId, s => s.Id, (p, s) => new { p, s })
            .Join(_context.Repositories, ps => ps.s.RepositoryId, r => r.Id, (ps, r) => new
            {
                ps.p.Id,
                ps.p.ScanExecutionId,
                PackageName = ps.p.Name,
                PackageVersion = ps.p.Version,
                Ecosystem = ps.p.Ecosystem.ToString(),
                DirectDependency = ps.p.IsDirectDependency,
                ManifestRelativePath = ps.p.ManifestPath,
                PackageUrl = ps.p.PackageUrl,
                Scope = ps.p.Scope.ToString(),
                RepositoryId = r.Id,
                RepositoryName = r.Name,
                RepositoryOwner = r.Owner,
                ps.s.CreatedAtUtc
            })
            .ToListAsync(cancellationToken);

        // 3. Bellek içi DTO haritalaması
        var list = rawPackages
            .OrderBy(p => p.PackageName)
            .Select(p =>
            {
                var repoFullName = !string.IsNullOrWhiteSpace(p.RepositoryOwner) && !string.IsNullOrWhiteSpace(p.RepositoryName)
                    ? $"{p.RepositoryOwner}/{p.RepositoryName}"
                    : (!string.IsNullOrWhiteSpace(p.RepositoryName) ? p.RepositoryName : "Repository");

                var eco = string.IsNullOrWhiteSpace(p.Ecosystem) ? "NuGet" : p.Ecosystem;
                var url = !string.IsNullOrWhiteSpace(p.PackageUrl)
                    ? p.PackageUrl
                    : (eco.Equals("nuget", StringComparison.OrdinalIgnoreCase)
                        ? $"https://www.nuget.org/packages/{p.PackageName}/{p.PackageVersion}"
                        : (eco.Equals("npm", StringComparison.OrdinalIgnoreCase)
                            ? $"https://www.npmjs.com/package/{p.PackageName}/v/{p.PackageVersion}"
                            : string.Empty));

                return new SbomComponentDto
                {
                    Id = p.Id,
                    ScanExecutionId = p.ScanExecutionId,
                    PackageName = p.PackageName,
                    Name = p.PackageName,
                    PackageVersion = p.PackageVersion,
                    Version = p.PackageVersion,
                    Ecosystem = eco,
                    DirectDependency = p.DirectDependency,
                    IsDirect = p.DirectDependency,
                    RelationType = p.DirectDependency ? "Doğrudan (Direct)" : "Geçişli (Transitive)",
                    Scope = string.IsNullOrWhiteSpace(p.Scope) ? "Production" : p.Scope,
                    ManifestRelativePath = p.ManifestRelativePath,
                    ManifestPath = p.ManifestRelativePath,
                    PackageUrl = url,
                    RepositoryId = p.RepositoryId,
                    RepositoryName = p.RepositoryName,
                    RepositoryFullName = repoFullName,
                    ProjectName = p.RepositoryName,
                    DetectedAt = p.CreatedAtUtc,
                    LastSeenAt = p.CreatedAtUtc
                };
            })
            .ToList();

        return Ok(list);
    }
}
