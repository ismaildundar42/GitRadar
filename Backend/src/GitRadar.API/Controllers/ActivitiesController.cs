using GitRadar.Domain.Entities;
using GitRadar.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace GitRadar.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public sealed class ActivitiesController : ControllerBase
{
    private readonly GitRadarDbContext _context;

    public ActivitiesController(GitRadarDbContext context)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
    }

    /// <summary>
    /// Sistemde yetkili kullanıcıların gerçekleştirdiği son denetim ve operasyonel hareketleri döner.
    /// Yalnızca gerçek zamanlı veritabanı kayıtlarını listeler.
    /// </summary>
    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetActivities(
        [FromQuery] int take = 100,
        CancellationToken cancellationToken = default)
    {
        if (take < 1) take = 20;
        if (take > 200) take = 200;

        var logs = await _context.UserActivityLogs
            .AsNoTracking()
            .OrderByDescending(x => x.Timestamp)
            .Take(take)
            .ToListAsync(cancellationToken);

        return Ok(logs);
    }
}

