using GitRadar.Domain.Enums;
using GitRadar.Domain.ValueObjects;

namespace GitRadar.Domain.Entities;

/// <summary>
/// Belirli bir repository ve commit SHA üzerinde yürütülen tarama çalıştırmasını ve sonuçlarını temsil eden ana varlık.
/// </summary>
public class ScanExecution
{
    private readonly List<DiscoveredPackage> _packages = [];
    private readonly List<VulnerabilityAlert> _vulnerabilityAlerts = [];
    private readonly List<string> _warnings = [];

    public long Id { get; private set; }
    public long RepositoryId { get; private set; }
    public CommitSha CommitSha { get; private set; }
    public ScanStatus Status { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? StartedAtUtc { get; private set; }
    public DateTime? CompletedAtUtc { get; private set; }
    public string? FailureReason { get; private set; }

    // Üst Tarama Oturumu (Prompt 101: Master-Detail FK)
    public int? ScanId { get; set; }
    public ScanSession? Scan { get; set; }

    public IReadOnlyCollection<DiscoveredPackage> Packages => _packages.AsReadOnly();
    public IReadOnlyCollection<VulnerabilityAlert> VulnerabilityAlerts => _vulnerabilityAlerts.AsReadOnly();
    public IReadOnlyCollection<string> Warnings => _warnings.AsReadOnly();

#pragma warning disable CS8618
    protected ScanExecution() { }
#pragma warning restore CS8618

    public ScanExecution(
        long repositoryId,
        CommitSha commitSha,
        DateTime createdAtUtc,
        ScanStatus status = ScanStatus.Pending,
        DateTime? startedAtUtc = null,
        long id = 0)
    {
        if (id < 0)
            throw new ArgumentOutOfRangeException(nameof(id), "Tarama kimliği negatif olamaz.");

        if (repositoryId < 0)
            throw new ArgumentOutOfRangeException(nameof(repositoryId), "Repository kimliği negatif olamaz.");

        ArgumentNullException.ThrowIfNull(commitSha);
        ValidateUtc(createdAtUtc, nameof(createdAtUtc));

        if (startedAtUtc.HasValue)
        {
            ValidateUtc(startedAtUtc.Value, nameof(startedAtUtc));
            if (startedAtUtc.Value < createdAtUtc)
                throw new ArgumentException("Başlangıç zamanı oluşturulma zamanından daha eski olamaz.", nameof(startedAtUtc));
        }

        Id = id;
        RepositoryId = repositoryId;
        CommitSha = commitSha;
        CreatedAtUtc = createdAtUtc;
        Status = status;
        StartedAtUtc = status == ScanStatus.InProgress ? (startedAtUtc ?? createdAtUtc) : startedAtUtc;
    }

    /// <summary>
    /// Kuyrukta bekletilmek üzere 'Pending' durumunda yeni bir tarama oluşturur.
    /// </summary>
    public static ScanExecution CreatePending(long repositoryId, CommitSha commitSha, DateTime createdAtUtc)
    {
        return new ScanExecution(repositoryId, commitSha, createdAtUtc, ScanStatus.Pending);
    }

    /// <summary>
    /// Doğrudan 'InProgress' durumunda başlayan yeni bir tarama oluşturur.
    /// </summary>
    public static ScanExecution StartNew(long repositoryId, CommitSha commitSha, DateTime startedAtUtc)
    {
        return new ScanExecution(repositoryId, commitSha, startedAtUtc, ScanStatus.InProgress, startedAtUtc);
    }

    /// <summary>
    /// Bekleyen (Pending) bir taramayı yürütme durumuna (InProgress) geçirir.
    /// </summary>
    public void Start(DateTime startedAtUtc)
    {
        ValidateUtc(startedAtUtc, nameof(startedAtUtc));

        if (Status != ScanStatus.Pending)
            throw new InvalidOperationException($"Yalnızca Pending durumundaki bir tarama başlatılabilir. Mevcut Durum: {Status}");

        if (startedAtUtc < CreatedAtUtc)
            throw new ArgumentException("Başlangıç zamanı oluşturulma zamanından daha eski olamaz.", nameof(startedAtUtc));

        Status = ScanStatus.InProgress;
        StartedAtUtc = startedAtUtc;
    }

    /// <summary>
    /// Devam eden taramaya keşfedilen bir bağımlılık paketi ekler.
    /// Yalnızca InProgress durumundayken izin verilir (Result Immutability).
    /// </summary>
    public void AddPackage(DiscoveredPackage package)
    {
        ArgumentNullException.ThrowIfNull(package);

        EnsureInProgress();

        if (Id != 0 && package.ScanExecutionId != 0 && package.ScanExecutionId != Id)
            throw new InvalidOperationException($"Paket tarama kimliği ({package.ScanExecutionId}) bu tarama kimliği ({Id}) ile eşleşmiyor.");

        var isDuplicate = _packages.Any(p =>
            (p.Id != 0 && package.Id != 0 && p.Id == package.Id) ||
            (p.Name.Equals(package.Name, StringComparison.OrdinalIgnoreCase) &&
             p.Version.Equals(package.Version, StringComparison.OrdinalIgnoreCase) &&
             p.Ecosystem == package.Ecosystem &&
             p.ManifestPath.Equals(package.ManifestPath, StringComparison.OrdinalIgnoreCase)));

        if (isDuplicate)
            return;

        if (Id != 0 && package.ScanExecutionId == 0)
        {
            package.SetScanExecutionId(Id);
        }

        _packages.Add(package);
    }

    /// <summary>
    /// Devam eden tarama içerisindeki bir pakete güvenlik zafiyeti ekler.
    /// Yalnızca InProgress durumundayken izin verilir.
    /// </summary>
    public void AddVulnerability(long packageId, VulnerabilityAlert alert)
    {
        ArgumentNullException.ThrowIfNull(alert);

        EnsureInProgress();

        var package = _packages.FirstOrDefault(p => p.Id == packageId)
            ?? throw new InvalidOperationException($"Bu tarama içerisinde {packageId} kimliğine sahip bir paket bulunamadı.");

        AddVulnerability(package, alert);
    }

    /// <summary>
    /// Devam eden tarama içerisindeki bir pakete doğrudan nesne referansı üzerinden güvenlik zafiyeti ekler.
    /// EF Core nesne grafiği (in-memory identity resolution) için nesne referansı üzerinden bağlama sağlar.
    /// Yalnızca InProgress durumundayken izin verilir.
    /// </summary>
    public void AddVulnerability(DiscoveredPackage package, VulnerabilityAlert alert)
    {
        ArgumentNullException.ThrowIfNull(package);
        ArgumentNullException.ThrowIfNull(alert);

        EnsureInProgress();

        if (!_packages.Contains(package))
            throw new InvalidOperationException("Belirtilen paket bu taramaya ait değil.");

        if (Id != 0)
        {
            alert.SetScanExecutionId(Id);
        }

        package.AddVulnerability(alert);

        if (!_vulnerabilityAlerts.Contains(alert) &&
            !_vulnerabilityAlerts.Any(v => (v.Id != 0 && alert.Id != 0 && v.Id == alert.Id) ||
                                           (v.DiscoveredPackageId != 0 && alert.DiscoveredPackageId != 0 &&
                                            v.DiscoveredPackageId == alert.DiscoveredPackageId &&
                                            v.VulnerabilityId.Equals(alert.VulnerabilityId, StringComparison.OrdinalIgnoreCase))))
        {
            _vulnerabilityAlerts.Add(alert);
        }
    }

    /// <summary>
    /// Taramayı eksiksiz ve temiz bir şekilde tamamlar.
    /// </summary>
    public void Complete(DateTime completedAtUtc)
    {
        EnsureInProgress();
        ValidateCompletionTime(completedAtUtc);

        Status = ScanStatus.Completed;
        CompletedAtUtc = completedAtUtc;
        SealAllPackages();
    }

    /// <summary>
    /// Taramayı manifest ayrıştırma uyarıları ile tamamlar (envanter tamdır ancak uyarılar vardır).
    /// Uyarı listesi boş olamaz; uyarı yoksa Complete() çağrılmalıdır.
    /// </summary>
    public void CompleteWithWarnings(IEnumerable<string> warnings, DateTime completedAtUtc)
    {
        EnsureInProgress();
        ValidateCompletionTime(completedAtUtc);
        ArgumentNullException.ThrowIfNull(warnings);

        var validWarnings = warnings.Where(w => !string.IsNullOrWhiteSpace(w)).Select(w => w.Trim()).ToList();
        if (validWarnings.Count == 0)
            throw new ArgumentException("Uyarı listesi boş veya yalnızca boşluklardan oluşamaz. Uyarı bulunmayan taramalar Complete() ile tamamlanmalıdır.", nameof(warnings));

        _warnings.AddRange(validWarnings);

        Status = ScanStatus.CompletedWithWarnings;
        CompletedAtUtc = completedAtUtc;
        SealAllPackages();
    }

    /// <summary>
    /// Taramayı kısmi sonuçla tamamlar (kota aşımı veya eksik dosya nedeniyle bazı manifestolar atlanmıştır).
    /// </summary>
    public void CompletePartial(string reason, DateTime completedAtUtc)
    {
        EnsureInProgress();
        ValidateCompletionTime(completedAtUtc);

        if (string.IsNullOrWhiteSpace(reason))
            throw new ArgumentException("Kısmi tamamlama gerekçesi belirtilmelidir.", nameof(reason));

        Status = ScanStatus.Partial;
        FailureReason = reason.Trim();
        CompletedAtUtc = completedAtUtc;
        SealAllPackages();
    }

    /// <summary>
    /// Taramayı başarısız olarak sonlandırır.
    /// </summary>
    public void Fail(string reason, DateTime failedAtUtc)
    {
        ValidateUtc(failedAtUtc, nameof(failedAtUtc));

        if (Status != ScanStatus.InProgress && Status != ScanStatus.Pending)
            throw new InvalidOperationException($"Yalnızca InProgress veya Pending durumundaki bir tarama başarısız yapılabilir. Mevcut Durum: {Status}");

        var referenceTime = StartedAtUtc ?? CreatedAtUtc;
        if (failedAtUtc < referenceTime)
            throw new ArgumentException("Başarısızlık zamanı başlangıç veya oluşturulma zamanından daha eski olamaz.", nameof(failedAtUtc));

        if (string.IsNullOrWhiteSpace(reason))
            throw new ArgumentException("Başarısızlık gerekçesi belirtilmelidir.", nameof(reason));

        Status = ScanStatus.Failed;
        FailureReason = reason.Trim();
        CompletedAtUtc = failedAtUtc;
        SealAllPackages();
    }

    /// <summary>
    /// Taramayı iptal eder.
    /// </summary>
    public void Cancel(string? reason, DateTime cancelledAtUtc)
    {
        ValidateUtc(cancelledAtUtc, nameof(cancelledAtUtc));

        if (Status is ScanStatus.Completed or ScanStatus.CompletedWithWarnings or ScanStatus.Partial or ScanStatus.Failed or ScanStatus.Cancelled)
            throw new InvalidOperationException($"Tamamlanmış ({Status}) bir tarama iptal edilemez.");

        var referenceTime = StartedAtUtc ?? CreatedAtUtc;
        if (cancelledAtUtc < referenceTime)
            throw new ArgumentException("İptal zamanı başlangıç veya oluşturulma zamanından daha eski olamaz.", nameof(cancelledAtUtc));

        Status = ScanStatus.Cancelled;
        FailureReason = string.IsNullOrWhiteSpace(reason) ? "Kullanıcı veya sistem tarafından iptal edildi." : reason.Trim();
        CompletedAtUtc = cancelledAtUtc;
        SealAllPackages();
    }

    /// <summary>
    /// Bu çalıştırmayı üst tarama oturumuna (ScanSession) bağlar.
    /// </summary>
    public void SetScanId(int scanId)
    {
        if (scanId > 0)
        {
            ScanId = scanId;
        }
    }

    private void EnsureInProgress()
    {
        if (Status != ScanStatus.InProgress)
            throw new InvalidOperationException($"Tarama InProgress durumunda değil (Mevcut Durum: {Status}). Tamamlanmış veya henüz başlamamış taramanın sonuçları değiştirilemez.");
    }

    private void ValidateCompletionTime(DateTime completedAtUtc)
    {
        ValidateUtc(completedAtUtc, nameof(completedAtUtc));

        var referenceTime = StartedAtUtc ?? CreatedAtUtc;
        if (completedAtUtc < referenceTime)
            throw new ArgumentException($"Tamamlanma zamanı ({completedAtUtc:O}) başlangıç zamanından ({referenceTime:O}) daha eski olamaz.", nameof(completedAtUtc));
    }

    private void SealAllPackages()
    {
        foreach (var package in _packages)
        {
            package.Seal();
        }
    }

    private static void ValidateUtc(DateTime dateTime, string paramName)
    {
        if (dateTime.Kind != DateTimeKind.Utc)
            throw new ArgumentException($"'{paramName}' parametresi UTC (DateTimeKind.Utc) olmalıdır. Verilen tür: {dateTime.Kind}", paramName);
    }
}
