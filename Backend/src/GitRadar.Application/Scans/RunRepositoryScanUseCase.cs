using System.Security.Cryptography;
using System.Text;
using GitRadar.Advisory.Abstractions;
using GitRadar.Application.Contracts.GitHub;
using GitRadar.Application.Pipelines;
using GitRadar.Domain.Entities;
using GitRadar.Domain.Enums;
using GitRadar.Domain.Repositories;
using GitRadar.Domain.ValueObjects;
using GitRadar.Scanning.Abstractions.Models;
using GitRadar.Scanning.Core.Enrichment;
using GitRadar.Scanning.Core.Orchestration;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;

namespace GitRadar.Application.Scans;

/// <summary>
/// GitHub manifest ağacı sorgulama, NuGet ayrıştırma, OSV zafiyet istihbarat zenginleştirmesi
/// ve veritabanı kalıcılık adımlarını uçtan uca koordine eden orkestrasyon Use Case implementasyonudur.
/// </summary>
public sealed class RunRepositoryScanUseCase : IRunRepositoryScanUseCase
{
    private readonly IGitHubTreeClient _gitHubTreeClient;
    private readonly IScannerOrchestrator _scannerOrchestrator;
    private readonly IVulnerabilityEnricher _vulnerabilityEnricher;
    private readonly IAdvisoryClient _advisoryClient;
    private readonly IScanExecutionSavePipeline _savePipeline;
    private readonly IRepositoryRepository _repositoryRepository;
    private readonly IScanExecutionRepository _scanExecutionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ILogger<RunRepositoryScanUseCase> _logger;

    public RunRepositoryScanUseCase(
        IGitHubTreeClient gitHubTreeClient,
        IScannerOrchestrator scannerOrchestrator,
        IVulnerabilityEnricher vulnerabilityEnricher,
        IAdvisoryClient advisoryClient,
        IScanExecutionSavePipeline savePipeline,
        IRepositoryRepository repositoryRepository,
        IScanExecutionRepository scanExecutionRepository,
        IUnitOfWork unitOfWork,
        ILogger<RunRepositoryScanUseCase>? logger = null)
    {
        _gitHubTreeClient = gitHubTreeClient ?? throw new ArgumentNullException(nameof(gitHubTreeClient));
        _scannerOrchestrator = scannerOrchestrator ?? throw new ArgumentNullException(nameof(scannerOrchestrator));
        _vulnerabilityEnricher = vulnerabilityEnricher ?? throw new ArgumentNullException(nameof(vulnerabilityEnricher));
        _advisoryClient = advisoryClient ?? throw new ArgumentNullException(nameof(advisoryClient));
        _savePipeline = savePipeline ?? throw new ArgumentNullException(nameof(savePipeline));
        _repositoryRepository = repositoryRepository ?? throw new ArgumentNullException(nameof(repositoryRepository));
        _scanExecutionRepository = scanExecutionRepository ?? throw new ArgumentNullException(nameof(scanExecutionRepository));
        _unitOfWork = unitOfWork ?? throw new ArgumentNullException(nameof(unitOfWork));
        _logger = logger ?? NullLogger<RunRepositoryScanUseCase>.Instance;
    }

    /// <inheritdoc />
    public async Task<RunRepositoryScanResult> ExecuteAsync(
        RunRepositoryScanCommand command,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(command);

        if (string.IsNullOrWhiteSpace(command.Owner) ||
            string.IsNullOrWhiteSpace(command.RepositoryName) ||
            string.IsNullOrWhiteSpace(command.BranchOrCommit))
        {
            return new RunRepositoryScanResult(
                ScanExecutionId: 0,
                RepositoryId: 0,
                CommitSha: string.Empty,
                DiscoveredPackagesCount: 0,
                VulnerabilitiesCount: 0,
                CriticalCount: 0,
                HighCount: 0,
                Status: ScanStatus.Failed.ToString(),
                IsSuccess: false,
                ErrorMessage: "Owner, RepositoryName ve BranchOrCommit alanları zorunludur.");
        }

        var queuedAtUtc = DateTime.UtcNow;
        var startedAtUtc = queuedAtUtc;
        var commitSha = ResolveCommitSha(command.BranchOrCommit);
        Repository? repo = null;

        try
        {
            // 1. Depo Kaydı Çözümleme (Repository Resolution)
            repo = await _repositoryRepository.GetByNameAsync(command.RepositoryName, cancellationToken)
                .ConfigureAwait(false);

            if (repo is null)
            {
                repo = Repository.Create(
                    gitHubRepositoryId: 1,
                    owner: command.Owner.Trim(),
                    name: command.RepositoryName.Trim(),
                    defaultBranch: command.BranchOrCommit.Trim(),
                    isPrivate: true,
                    createdAtUtc: startedAtUtc,
                    remoteUrl: $"https://github.com/{command.Owner.Trim()}/{command.RepositoryName.Trim()}");

                await _repositoryRepository.AddAsync(repo, cancellationToken).ConfigureAwait(false);
                await _unitOfWork.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
            }

            // 2. Ağaç Taraması (GitHub Manifest Tree)
            var manifestItems = await _gitHubTreeClient.FetchManifestTreeAsync(
                command.Owner,
                command.RepositoryName,
                command.BranchOrCommit,
                cancellationToken).ConfigureAwait(false);

            // Manifest bulunamazsa: Boş tarama kaydı oluştur ve 0 paket ile tamamla
            if (manifestItems.Count == 0)
            {
                var emptyExecution = ScanExecution.CreatePending(repo.Id, CommitSha.Create(commitSha), queuedAtUtc);
                if (command.ScanId.HasValue)
                {
                    emptyExecution.SetScanId(command.ScanId.Value);
                }
                emptyExecution.Start(startedAtUtc);
                emptyExecution.Complete(DateTime.UtcNow);

                await _scanExecutionRepository.AddAsync(emptyExecution, cancellationToken).ConfigureAwait(false);
                await _unitOfWork.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

                return new RunRepositoryScanResult(
                    ScanExecutionId: emptyExecution.Id,
                    RepositoryId: repo.Id,
                    CommitSha: commitSha,
                    DiscoveredPackagesCount: 0,
                    VulnerabilitiesCount: 0,
                    CriticalCount: 0,
                    HighCount: 0,
                    Status: emptyExecution.Status.ToString(),
                    IsSuccess: true,
                    ErrorMessage: null);
            }

            // 3. Manifest İndirme ve Ayrıştırma (Scanning Engine)
            var manifestItemMap = manifestItems
                .Where(m => !string.IsNullOrWhiteSpace(m.Path))
                .ToDictionary(m => m.Path, m => m, StringComparer.OrdinalIgnoreCase);

            var discoveredManifests = manifestItems.Select(item => new DiscoveredManifest(
                manifestPath: item.Path,
                manifestType: Path.GetExtension(item.Path).TrimStart('.'),
                ecosystem: ScannerEcosystem.NuGet,
                sizeBytes: item.Size,
                contentHash: item.Sha)).ToList();

            var aggregatedResult = await _scannerOrchestrator.ExecuteScanAsync(
                discoveredManifests,
                async (m, ct) =>
                {
                    if (manifestItemMap.TryGetValue(m.ManifestPath, out var item) && !string.IsNullOrWhiteSpace(item.Url))
                    {
                        return await _gitHubTreeClient.DownloadManifestStreamAsync(item.Url, ct).ConfigureAwait(false);
                    }

                    return await _gitHubTreeClient.DownloadManifestStreamAsync(
                        command.Owner,
                        command.RepositoryName,
                        m.ContentHash ?? string.Empty,
                        ct).ConfigureAwait(false);
                },
                cancellationToken).ConfigureAwait(false);

            // 4. Zafiyet Zenginleştirmesi (Enrichment & SLA)
            var enrichedResult = await _vulnerabilityEnricher.EnrichScanResultAsync(
                aggregatedResult,
                _advisoryClient,
                cancellationToken).ConfigureAwait(false);

            // 5. Veritabanına Kalıcılık (Save Pipeline)
            var completedAtUtc = DateTime.UtcNow;
            var scanExecution = await _savePipeline.SaveEnrichedScanAsync(
                repositoryId: repo.Id,
                commitSha: commitSha,
                enrichedResult: enrichedResult,
                queuedAtUtc: queuedAtUtc,
                startedAtUtc: startedAtUtc,
                completedAtUtc: completedAtUtc,
                scanId: command.ScanId,
                cancellationToken: cancellationToken).ConfigureAwait(false);

            // 6. Başarılı Sonuç Üretimi
            return new RunRepositoryScanResult(
                ScanExecutionId: scanExecution.Id,
                RepositoryId: repo.Id,
                CommitSha: commitSha,
                DiscoveredPackagesCount: scanExecution.Packages.Count,
                VulnerabilitiesCount: scanExecution.VulnerabilityAlerts.Count,
                CriticalCount: enrichedResult.CriticalCount,
                HighCount: enrichedResult.HighCount,
                Status: scanExecution.Status.ToString(),
                IsSuccess: scanExecution.Status != ScanStatus.Failed,
                ErrorMessage: scanExecution.FailureReason);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            var sanitizedMessage = SanitizeError(ex.Message);
            _logger.LogError(ex, "Depo taraması yürütülürken hata oluştu: {Message}", sanitizedMessage);

            long failedScanId = 0;
            if (repo is not null)
            {
                try
                {
                    var failedExecution = ScanExecution.CreatePending(repo.Id, CommitSha.Create(commitSha), queuedAtUtc);
                    if (command.ScanId.HasValue)
                    {
                        failedExecution.SetScanId(command.ScanId.Value);
                    }
                    failedExecution.Start(startedAtUtc);
                    failedExecution.Fail(sanitizedMessage, DateTime.UtcNow);

                    await _scanExecutionRepository.AddAsync(failedExecution, CancellationToken.None).ConfigureAwait(false);
                    await _unitOfWork.SaveChangesAsync(CancellationToken.None).ConfigureAwait(false);
                    failedScanId = failedExecution.Id;
                }
                catch (Exception saveEx)
                {
                    _logger.LogError(saveEx, "Başarısız tarama durumu veritabanına kaydedilemedi.");
                }
            }

            return new RunRepositoryScanResult(
                ScanExecutionId: failedScanId,
                RepositoryId: repo?.Id ?? 0,
                CommitSha: commitSha,
                DiscoveredPackagesCount: 0,
                VulnerabilitiesCount: 0,
                CriticalCount: 0,
                HighCount: 0,
                Status: ScanStatus.Failed.ToString(),
                IsSuccess: false,
                ErrorMessage: sanitizedMessage);
        }
    }

    private static string ResolveCommitSha(string branchOrCommit)
    {
        var trimmed = branchOrCommit.Trim();
        if ((trimmed.Length == 40 || trimmed.Length == 64) && IsHex(trimmed))
        {
            return trimmed.ToLowerInvariant();
        }

        // Dal adı verildiğinde SHA-1 ile deterministik 40 karakterlik hex üretilir
        var hashBytes = SHA1.HashData(Encoding.UTF8.GetBytes(trimmed));
        return Convert.ToHexString(hashBytes).ToLowerInvariant();
    }

    private static bool IsHex(string input)
    {
        foreach (var c in input)
        {
            if (c is not ((>= '0' and <= '9') or (>= 'a' and <= 'f') or (>= 'A' and <= 'F')))
                return false;
        }
        return true;
    }

    private static string SanitizeError(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return "Bilinmeyen bir hata oluştu.";

        // SEC-02: Belirteç veya secret sızıntılarını maskele
        if (message.Contains("ghp_") || message.Contains("Bearer "))
        {
            return "GitHub API isteğinde kimlik doğrulama veya yetkilendirme hatası oluştu. [REDACTED]";
        }

        return message;
    }
}

