namespace GitRadar.Application.Contracts.Activities;

/// <summary>
/// Sistemde gerçekleştirilen kullanıcı hareketlerini (tarama, token, senkronizasyon vb.) denetim altına alan servis arayüzüdür.
/// </summary>
public interface IUserActivityService
{
    Task LogActivityAsync(
        string userName,
        string actionType,
        string actionTitle,
        string description,
        string targetScope,
        string status = "SUCCESS",
        string? ipAddress = null,
        CancellationToken cancellationToken = default);
}

