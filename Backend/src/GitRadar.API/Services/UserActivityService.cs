using GitRadar.Application.Contracts.Activities;
using GitRadar.Domain.Entities;
using GitRadar.Persistence;
using Microsoft.Extensions.Logging;

namespace GitRadar.API.Services;

/// <summary>
/// Kullanıcı ve yönetici hareketlerini veritabanına kalıcı olarak işleyen servis uygulamasıdır.
/// </summary>
public sealed class UserActivityService : IUserActivityService
{
    private readonly GitRadarDbContext _context;
    private readonly ILogger<UserActivityService> _logger;

    public UserActivityService(GitRadarDbContext context, ILogger<UserActivityService> logger)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public async Task LogActivityAsync(
        string userName,
        string actionType,
        string actionTitle,
        string description,
        string targetScope,
        string status = "SUCCESS",
        string? ipAddress = null,
        CancellationToken cancellationToken = default)
    {
        try
        {
            var log = new UserActivityLog
            {
                UserName = string.IsNullOrWhiteSpace(userName) ? "Admin" : userName.Trim(),
                UserRole = "Admin",
                ActionType = actionType,
                ActionTitle = actionTitle,
                Description = description,
                TargetScope = targetScope,
                Status = status,
                IpAddress = ipAddress,
                Timestamp = DateTime.UtcNow
            };

            await _context.UserActivityLogs.AddAsync(log, cancellationToken).ConfigureAwait(false);
            await _context.SaveChangesAsync(cancellationToken).ConfigureAwait(false);

            _logger.LogInformation("Kullanıcı hareketi kaydedildi: [{ActionType}] {Title} by {User}", actionType, actionTitle, log.UserName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Kullanıcı hareketi kaydedilirken hata oluştu: {Message}", ex.Message);
        }
    }
}

