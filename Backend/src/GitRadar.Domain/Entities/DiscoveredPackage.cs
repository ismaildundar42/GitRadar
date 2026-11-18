using GitRadar.Domain.Enums;

namespace GitRadar.Domain.Entities;

/// <summary>
/// Belirli bir tarama sırasında keşfedilen üçüncü taraf bağımlılık bileşenini temsil eden varlık.
/// CIS Controls v8 Safeguard 16.4 envanter standardını uygular.
/// </summary>
public class DiscoveredPackage
{
    private readonly List<VulnerabilityAlert> _vulnerabilities = [];

    public long Id { get; private set; }
    public long ScanExecutionId { get; private set; }
    public string Name { get; private set; }
    public string Version { get; private set; }
    public string PackageUrl { get; private set; }
    public EcosystemType Ecosystem { get; private set; }
    public string ManifestPath { get; private set; }
    public string? DeclaredTargetFramework { get; private set; }

    /// <summary>
    /// Bağımlılığın doğrudan (Direct) veya dolaylı (Transitive) bildirim ilişkisi.
    /// </summary>
    public bool IsDirectDependency { get; private set; }

    /// <summary>
    /// Bağımlılığın kullanım kapsamı (Production, Development, Test, Build, Unknown).
    /// </summary>
    public DependencyScope Scope { get; private set; }

    /// <summary>
    /// Tarama tamamlandığında paketin değiştirilemezliğini (immutability) garanti eden kilit bayrağı.
    /// </summary>
    public bool IsSealed { get; private set; }

    public IReadOnlyCollection<VulnerabilityAlert> Vulnerabilities => _vulnerabilities.AsReadOnly();

#pragma warning disable CS8618
    protected DiscoveredPackage() { }
#pragma warning restore CS8618

    public DiscoveredPackage(
        long scanExecutionId,
        string name,
        string version,
        EcosystemType ecosystem,
        string manifestPath,
        bool isDirectDependency,
        DependencyScope scope = DependencyScope.Production,
        string? packageUrl = null,
        string? declaredTargetFramework = null,
        long id = 0)
    {
        if (id < 0)
            throw new ArgumentOutOfRangeException(nameof(id), "Paket kimliği negatif olamaz.");

        if (scanExecutionId < 0)
            throw new ArgumentOutOfRangeException(nameof(scanExecutionId), "İlişkili tarama çalıştırması kimliği negatif olamaz.");

        if (string.IsNullOrWhiteSpace(name))
            throw new ArgumentException("Paket adı boş olamaz.", nameof(name));

        if (string.IsNullOrWhiteSpace(version))
            throw new ArgumentException("Paket sürümü boş olamaz.", nameof(version));

        if (string.IsNullOrWhiteSpace(manifestPath))
            throw new ArgumentException("Manifest dosya yolu boş olamaz.", nameof(manifestPath));

        Id = id;
        ScanExecutionId = scanExecutionId;
        Name = name.Trim();
        Version = version.Trim();
        Ecosystem = ecosystem;
        ManifestPath = manifestPath.Trim();
        IsDirectDependency = isDirectDependency;
        Scope = scope;
        PackageUrl = !string.IsNullOrWhiteSpace(packageUrl)
            ? packageUrl.Trim()
            : $"pkg:{ecosystem.ToString().ToLowerInvariant()}/{Name}@{Version}";
        DeclaredTargetFramework = string.IsNullOrWhiteSpace(declaredTargetFramework)
            ? null
            : declaredTargetFramework.Trim();
    }

    /// <summary>
    /// Yeni bir DiscoveredPackage örneği oluşturur.
    /// </summary>
    public static DiscoveredPackage Create(
        long scanExecutionId,
        string name,
        string version,
        EcosystemType ecosystem,
        string manifestPath,
        bool isDirectDependency,
        DependencyScope scope = DependencyScope.Production,
        string? packageUrl = null,
        string? declaredTargetFramework = null)
    {
        return new DiscoveredPackage(
            scanExecutionId,
            name,
            version,
            ecosystem,
            manifestPath,
            isDirectDependency,
            scope,
            packageUrl,
            declaredTargetFramework);
    }

    /// <summary>
    /// Tarama kimliğini ilişkilendirir.
    /// </summary>
    internal void SetScanExecutionId(long scanExecutionId)
    {
        if (scanExecutionId <= 0)
            throw new ArgumentOutOfRangeException(nameof(scanExecutionId), "Tarama kimliği pozitif bir sayı olmalıdır.");

        if (ScanExecutionId == 0)
        {
            ScanExecutionId = scanExecutionId;
        }
    }

    /// <summary>
    /// Bu paketle eşleşen bir güvenlik zafiyeti ekler. Mükerrer zafiyet kimliklerini eler.
    /// Tarama tamamlanmışsa (IsSealed == true) eklemeye izin vermez.
    /// </summary>
    public void AddVulnerability(VulnerabilityAlert alert)
    {
        ArgumentNullException.ThrowIfNull(alert);

        if (IsSealed)
            throw new InvalidOperationException("Bu paket kilitlenmiştir. Tamamlanmış veya sonlandırılmış bir taramaya zafiyet eklenemez.");

        if (Id != 0 && alert.DiscoveredPackageId != 0 && alert.DiscoveredPackageId != Id)
            throw new InvalidOperationException($"Zafiyet paket kimliği ({alert.DiscoveredPackageId}) ile bu paketin kimliği ({Id}) eşleşmiyor.");

        if (_vulnerabilities.Any(v => v.VulnerabilityId.Equals(alert.VulnerabilityId, StringComparison.OrdinalIgnoreCase)))
            return;

        _vulnerabilities.Add(alert);
    }

    /// <summary>
    /// Tarama çalıştırması terminal duruma geçtiğinde paketi kilitler (Aggregate Root tarafından çağrılır).
    /// </summary>
    internal void Seal()
    {
        IsSealed = true;
    }
}
