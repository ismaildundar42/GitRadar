namespace GitRadar.Domain.Entities;

/// <summary>
/// Sistemde yetkili kullanıcıların gerçekleştirdiği tüm operasyonel hareketleri
/// (tarama, token güncelleme, repo eşitleme vb.) kayıt altına alan kurumsal denetim günlüğü varlığıdır.
/// </summary>
public class UserActivityLog
{
    public long Id { get; set; }
    public string UserName { get; set; } = string.Empty;       // Örn: "ismaildundar42", "Mehmet Kaya" veya "Admin"
    public string UserRole { get; set; } = "Admin";            // "Admin", "SecurityAnalyst"
    public string ActionType { get; set; } = string.Empty;     // "BATCH_SCAN", "SINGLE_SCAN", "TOKEN_UPDATE", "SYNC_REPOS"
    public string ActionTitle { get; set; } = string.Empty;    // Örn: "Tüm Repoları Taradı", "Tekil Depo Taradı", "Token Güncelledi"
    public string Description { get; set; } = string.Empty;    // Örn: "64 kurumsal depo toplu tarama kuyruğuna alındı."
    public string TargetScope { get; set; } = string.Empty;    // Örn: "Tüm Depolar (64)", "ismaildundar42/MultiShop"
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    public string Status { get; set; } = "SUCCESS";            // "SUCCESS", "FAILED"
    public string? IpAddress { get; set; }
}

