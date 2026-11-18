using GitRadar.Domain.Enums;

namespace GitRadar.Domain.Entities;

/// <summary>
/// Kaynak kod deposunu temsil eden ana varlık (Aggregate Root).
/// </summary>
public class Repository
{
    private readonly List<ScanExecution> _scanExecutions = [];

    public long Id { get; private set; }
    public long GitHubRepositoryId { get; private set; }
    public string Owner { get; private set; }
    public string Name { get; private set; }
    public string FullName => $"{Owner}/{Name}";
    public string RemoteUrl { get; private set; }
    public string DefaultBranch { get; private set; }
    public bool IsPrivate { get; private set; }
    public RepositoryStatus Status { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? UpdatedAtUtc { get; private set; }

    public IReadOnlyCollection<ScanExecution> ScanExecutions => _scanExecutions.AsReadOnly();

#pragma warning disable CS8618
    protected Repository() { }
#pragma warning restore CS8618

    public Repository(
        long gitHubRepositoryId,
        string owner,
        string name,
        string defaultBranch,
        bool isPrivate,
        DateTime createdAtUtc,
        string? remoteUrl = null,
        long id = 0)
    {
        if (id < 0)
            throw new ArgumentOutOfRangeException(nameof(id), "Repository kimliği negatif olamaz.");

        if (gitHubRepositoryId <= 0)
            throw new ArgumentOutOfRangeException(nameof(gitHubRepositoryId), "GitHub repository ID pozitif bir tamsayı olmalıdır.");

        if (string.IsNullOrWhiteSpace(owner))
            throw new ArgumentException("Repository sahibi (owner) boş olamaz.", nameof(owner));

        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Repository adı boş olamaz.", nameof(name));

        if (string.IsNullOrWhiteSpace(defaultBranch))
            throw new ArgumentException("Varsayılan dal (default branch) boş olamaz.", nameof(defaultBranch));

        ValidateUtc(createdAtUtc, nameof(createdAtUtc));

        Id = id;
        GitHubRepositoryId = gitHubRepositoryId;
        Owner = owner.Trim();
        Name = name.Trim();
        DefaultBranch = defaultBranch.Trim();
        IsPrivate = isPrivate;
        RemoteUrl = !string.IsNullOrWhiteSpace(remoteUrl)
            ? remoteUrl.Trim()
            : $"https://github.com/{Owner}/{Name}";
        Status = RepositoryStatus.Active;
        CreatedAtUtc = createdAtUtc;
    }

    /// <summary>
    /// Yeni bir Repository örneği oluşturur.
    /// </summary>
    public static Repository Create(
        long gitHubRepositoryId,
        string owner,
        string name,
        string defaultBranch,
        bool isPrivate,
        DateTime createdAtUtc,
        string? remoteUrl = null)
    {
        return new Repository(
            gitHubRepositoryId,
            owner,
            name,
            defaultBranch,
            isPrivate,
            createdAtUtc,
            remoteUrl);
    }

    /// <summary>
    /// Depoya yeni bir tarama çalıştırması iliştirir.
    /// </summary>
    public void AddScanExecution(ScanExecution scanExecution)
    {
        ArgumentNullException.ThrowIfNull(scanExecution);

        if (Id != 0 && scanExecution.RepositoryId != 0 && scanExecution.RepositoryId != Id)
            throw new InvalidOperationException($"Tarama repository kimliği ({scanExecution.RepositoryId}) bu depo kimliği ({Id}) ile eşleşmiyor.");

        if (scanExecution.Id != 0 && _scanExecutions.Any(s => s.Id == scanExecution.Id))
            return;

        _scanExecutions.Add(scanExecution);
    }

    /// <summary>
    /// Depoyu pasif hale getirir; yeni taramaları durdurur, geçmiş verileri korur.
    /// </summary>
    public void Deactivate(DateTime utcNow)
    {
        ValidateUtc(utcNow, nameof(utcNow));

        if (Status == RepositoryStatus.Inactive)
            return;

        Status = RepositoryStatus.Inactive;
        UpdatedAtUtc = utcNow;
    }

    /// <summary>
    /// Pasif depoyu tekrar aktif ve taranabilir hale getirir.
    /// </summary>
    public void Activate(DateTime utcNow)
    {
        ValidateUtc(utcNow, nameof(utcNow));

        if (Status == RepositoryStatus.Active)
            return;

        Status = RepositoryStatus.Active;
        UpdatedAtUtc = utcNow;
    }

    /// <summary>
    /// Deponun GitHub üzerindeki meta bilgilerini günceller.
    /// </summary>
    public void UpdateDetails(string owner, string name, string defaultBranch, bool isPrivate, DateTime utcNow, string? remoteUrl = null)
    {
        ValidateUtc(utcNow, nameof(utcNow));

        if (string.IsNullOrWhiteSpace(owner))
            throw new ArgumentException("Repository sahibi boş olamaz.", nameof(owner));

        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Repository adı boş olamaz.", nameof(name));

        if (string.IsNullOrWhiteSpace(defaultBranch))
            throw new ArgumentException("Varsayılan dal boş olamaz.", nameof(defaultBranch));

        Owner = owner.Trim();
        Name = name.Trim();
        DefaultBranch = defaultBranch.Trim();
        IsPrivate = isPrivate;
        if (!string.IsNullOrWhiteSpace(remoteUrl))
        {
            RemoteUrl = remoteUrl.Trim();
        }
        UpdatedAtUtc = utcNow;
    }

    private static void ValidateUtc(DateTime dateTime, string paramName)
    {
        if (dateTime.Kind != DateTimeKind.Utc)
            throw new ArgumentException($"'{paramName}' parametresi UTC (DateTimeKind.Utc) olmalıdır. Verilen tür: {dateTime.Kind}", paramName);
    }
}
