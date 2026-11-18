using GitRadar.API.DTOs.Common;
using GitRadar.API.DTOs.Repositories;
using GitRadar.Application.Contracts.Activities;
using GitRadar.Application.Contracts.GitHub;
using GitRadar.Application.Contracts.GitHub.Exceptions;
using GitRadar.Domain.Entities;
using GitRadar.Domain.Repositories;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace GitRadar.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public sealed class RepositoriesController : ControllerBase
{
    private readonly IRepositoryRepository _repositoryRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly IGitHubService _gitHubService;
    private readonly IUserActivityService _activityService;

    public RepositoriesController(
        IRepositoryRepository repositoryRepository,
        IUnitOfWork unitOfWork,
        IGitHubService gitHubService,
        IUserActivityService activityService)
    {
        _repositoryRepository = repositoryRepository ?? throw new ArgumentNullException(nameof(repositoryRepository));
        _unitOfWork = unitOfWork ?? throw new ArgumentNullException(nameof(unitOfWork));
        _gitHubService = gitHubService ?? throw new ArgumentNullException(nameof(gitHubService));
        _activityService = activityService ?? throw new ArgumentNullException(nameof(activityService));
    }

    /// <summary>
    /// Sistemde kayıtlı tüm kaynak kod depolarını ve en son tarama özetlerini listeler.
    /// </summary>
    /// <param name="cancellationToken">İptal belirteci.</param>
    /// <returns>Kayıtlı depoların özet listesi.</returns>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<RepositorySummaryDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetRepositories(CancellationToken cancellationToken)
    {
        var repositories = await _repositoryRepository.GetAllAsync(cancellationToken);

        var dtos = repositories.Select(r =>
        {
            // Tamamlanmış başarılı taramayı önceliklendir, yoksa son taramayı al
            var latestCompleted = r.ScanExecutions
                .Where(s => s.Status == Domain.Enums.ScanStatus.Completed)
                .OrderByDescending(s => s.CreatedAtUtc)
                .FirstOrDefault();

            var latestScan = latestCompleted ?? r.ScanExecutions
                .OrderByDescending(s => s.CreatedAtUtc)
                .FirstOrDefault();

            int duration = 0;
            if (latestScan?.CompletedAtUtc.HasValue == true && latestScan?.StartedAtUtc.HasValue == true)
            {
                duration = Math.Max(1, (int)(latestScan.CompletedAtUtc.Value - latestScan.StartedAtUtc.Value).TotalSeconds);
            }
            else if (latestScan?.Status == Domain.Enums.ScanStatus.Completed)
            {
                duration = 12;
            }

            return new RepositorySummaryDto(
                Id: r.Id,
                Name: r.Name,
                Owner: r.Owner,
                FullName: r.FullName,
                RemoteUrl: r.RemoteUrl,
                DefaultBranch: r.DefaultBranch,
                IsPrivate: r.IsPrivate,
                Status: r.Status.ToString(),
                CreatedAtUtc: r.CreatedAtUtc,
                LastScanStatus: latestScan?.Status.ToString() ?? "Henüz Taranmadı",
                LastScanDateUtc: latestScan?.CompletedAtUtc ?? latestScan?.StartedAtUtc,
                TotalScansCount: r.ScanExecutions.Count,
                PackagesCount: latestScan?.Packages?.Count ?? 0,
                VulnerabilitiesCount: latestScan?.VulnerabilityAlerts?.Count ?? 0,
                DurationSeconds: duration,
                LastScanSessionId: latestScan?.ScanId,
                LastCommitSha: latestScan?.CommitSha?.Value);
        }).ToList();

        return Ok(dtos);
    }

    /// <summary>
    /// Sisteme yeni bir kurumsal depo kaydeder. Yalnızca Admin yetkisi gerektirir.
    /// </summary>
    [HttpPost]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponseDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> AddRepository(
        [FromBody] CreateRepositoryRequestDto request,
        CancellationToken cancellationToken)
    {
        if (request is null || string.IsNullOrWhiteSpace(request.Owner) || string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest(new ErrorResponseDto("Depo sahibi ve depo adı zorunludur."));
        }

        var existing = await _repositoryRepository.GetByNameAsync(request.Name.Trim(), cancellationToken);
        if (existing is not null)
        {
            return BadRequest(new ErrorResponseDto("Bu ada sahip bir depo zaten kayıtlıdır."));
        }

        var repository = new Repository(
            gitHubRepositoryId: DateTime.UtcNow.Ticks,
            owner: request.Owner.Trim(),
            name: request.Name.Trim(),
            defaultBranch: request.DefaultBranch ?? "main",
            isPrivate: request.IsPrivate,
            createdAtUtc: DateTime.UtcNow,
            remoteUrl: request.RemoteUrl ?? $"https://github.com/{request.Owner.Trim()}/{request.Name.Trim()}");

        await _repositoryRepository.AddAsync(repository, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Ok(new { message = "Depo başarıyla eklendi.", repositoryId = repository.Id });
    }

    /// <summary>
    /// Kayıtlı bir depoyu sistemden kaldırır. Yalnızca Admin yetkisi gerektirir.
    /// </summary>
    [HttpDelete("{id:long}")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponseDto), StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> DeleteRepository(
        [FromRoute] long id,
        CancellationToken cancellationToken)
    {
        var repository = await _repositoryRepository.GetByIdAsync(id, cancellationToken);
        if (repository is null)
        {
            return NotFound(new ErrorResponseDto($"Kimliği {id} olan depo bulunamadı."));
        }

        repository.Deactivate(DateTime.UtcNow);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return Ok(new { message = $"Depo (#{id}) başarıyla pasife alındı/silindi." });
    }

    /// <summary>
    /// GitHub REST API üzerinden kullanıcının veya organizasyonun tüm depolarını (Public & Private)
    /// otomatik keşfeder (Auto-Discovery) ve sisteme senkronize eder. Yalnızca Admin yetkisi gerektirir.
    /// </summary>
    [HttpPost("sync-github")]
    [Authorize(Roles = "Admin")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErrorResponseDto), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(StatusCodes.Status403Forbidden)]
    public async Task<IActionResult> SyncGitHubRepositories(
        [FromBody] SyncGitHubRequestDto? request,
        CancellationToken cancellationToken)
    {
        try
        {
            var token = request?.Token?.Trim();
            var org = request?.OrgName?.Trim();

            IReadOnlyList<GitHubRepositoryDto> githubRepos;
            if (!string.IsNullOrWhiteSpace(org))
            {
                githubRepos = await _gitHubService.GetOrganizationRepositoriesAsync(org, token, cancellationToken);
            }
            else
            {
                githubRepos = await _gitHubService.GetUserRepositoriesAsync(token, cancellationToken);
            }

            var existingRepos = await _repositoryRepository.GetAllAsync(cancellationToken);
            var existingByFullName = existingRepos.ToDictionary(r => r.FullName.ToLowerInvariant(), r => r);

            int addedCount = 0;
            int updatedCount = 0;
            var nowUtc = DateTime.UtcNow;

            foreach (var ghRepo in githubRepos)
            {
                var key = ghRepo.FullName.ToLowerInvariant();
                if (existingByFullName.TryGetValue(key, out var existing))
                {
                    existing.UpdateDetails(
                        owner: ghRepo.Owner,
                        name: ghRepo.Name,
                        defaultBranch: string.IsNullOrWhiteSpace(ghRepo.DefaultBranch) ? "main" : ghRepo.DefaultBranch,
                        isPrivate: ghRepo.IsPrivate,
                        utcNow: nowUtc,
                        remoteUrl: ghRepo.HtmlUrl);
                    updatedCount++;
                }
                else
                {
                    var newRepo = new Repository(
                        gitHubRepositoryId: ghRepo.Id > 0 ? ghRepo.Id : DateTime.UtcNow.Ticks,
                        owner: ghRepo.Owner,
                        name: ghRepo.Name,
                        defaultBranch: string.IsNullOrWhiteSpace(ghRepo.DefaultBranch) ? "main" : ghRepo.DefaultBranch,
                        isPrivate: ghRepo.IsPrivate,
                        createdAtUtc: nowUtc,
                        remoteUrl: ghRepo.HtmlUrl);

                    await _repositoryRepository.AddAsync(newRepo, cancellationToken);
                    existingByFullName[key] = newRepo;
                    addedCount++;
                }
            }

            await _unitOfWork.SaveChangesAsync(cancellationToken);

            // CIS Audit: Kullanıcı Hareketini Kaydet
            var user = User.Identity?.Name ?? "Admin";
            var ip = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "127.0.0.1";
            await _activityService.LogActivityAsync(
                userName: user,
                actionType: "SYNC_REPOS",
                actionTitle: "Depolar Senkronize Edildi",
                description: $"{githubRepos.Count} depo GitHub API üzerinden çekildi ({addedCount} yeni eklendi, {updatedCount} güncellendi).",
                targetScope: "GitHub Entegrasyonu",
                status: "SUCCESS",
                ipAddress: ip,
                cancellationToken: cancellationToken);

            return Ok(new
            {
                addedCount,
                updatedCount,
                totalCount = githubRepos.Count,
                message = $"GitHub ile eşitlendi: {addedCount} yeni depo sisteme aktarıldı, {updatedCount} depo güncellendi. Toplam: {githubRepos.Count} depo."
            });
        }
        catch (GitHubApiException ex)
        {
            return StatusCode((int)ex.StatusCode.GetValueOrDefault(System.Net.HttpStatusCode.BadRequest),
                new ErrorResponseDto(ex.Message));
        }
        catch (Exception ex)
        {
            return BadRequest(new ErrorResponseDto("GitHub senkronizasyonu sırasında beklenmeyen bir hata oluştu: " + ex.Message));
        }
    }
}

