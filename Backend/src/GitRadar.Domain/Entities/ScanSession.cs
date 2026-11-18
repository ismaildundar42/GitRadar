namespace GitRadar.Domain.Entities;

/// <summary>
/// Toplu veya tekil tarama oturumlarını (Master) temsil eden üst varlık modelidir.
/// Her bir oturumun kullanıcı snapshot'ını, zaman damgalarını ve konsolide istatistiklerini barındırır.
/// </summary>
public class ScanSession
{
    public int Id { get; set; } // INT IDENTITY(1,1) PRIMARY KEY

    // Tarayan kullanıcı bilgileri (AspNetUsers int ID ile FK)
    public int? ScannedUserId { get; set; } // FK -> AspNetUsers.Id (nullable, sistem otomasyonları için)
    public string ScannedUserName { get; set; } = string.Empty; // "GitRadar Admin" (Snapshot)
    public string ScannedUserEmail { get; set; } = string.Empty; // "admin@example.com"

    // Oturum Zaman Bilgileri
    public DateTime ScanDate { get; set; } = DateTime.UtcNow; // Oturum başlangıcı
    public DateTime? CompletedDate { get; set; } // Oturum bitişi
    public long DurationMs { get; set; } // Toplam süre

    // Kapsam ve İstatistikler
    public string ScanType { get; set; } = "BATCH_ALL"; // "BATCH_ALL", "SINGLE_REPO"
    public string Status { get; set; } = "RUNNING"; // "RUNNING", "COMPLETED", "FAILED", "PARTIAL_SUCCESS"
    public int TotalRepositoriesCount { get; set; } // Hedef depo sayısı (örn: 64)
    public int ScannedRepositoriesCount { get; set; } // Tamamlanan depo sayısı
    public int SuccessCount { get; set; }
    public int FailureCount { get; set; }
    public int TotalVulnerabilitiesFound { get; set; } // Bu oturumda tespit edilen toplam açık
    public int AutoResolvedCount { get; set; } // Bu oturumda otomatik kapatılan açık sayısı

    // 1 -> N Navigation Property
    public ICollection<ScanExecution> Executions { get; set; } = new List<ScanExecution>();
}

