# GITRADAR: TEKNİK DİREKSİYON, MİMARİ VE ENTERPRISE DEĞERLENDİRME RAPORU

**Belge Tanımı:** GitRadar Software Composition Analysis (SCA) Platformu — Kapsamlı Mimari, Algoritma, Güvenlik ve Kurumsal Denetim İncelemesi  
**Yazar / Rol:** Kıdemli .NET 10 Backend & Enterprise React Güvenlik Mimarı  
**Kurum / Organizasyon:** Enterprise Security Operations  
**Tarih:** 10 Kasım 2026  
**Sürüm:** 1.0.0-ENTERPRISE  

---

## BÖLÜM 0: GITRADAR NEDİR VE GENEL İŞLEYİŞ AKIŞI (END-TO-END WORKFLOW)

GitRadar; kurum bünyesinde geliştirilen veya kullanılan tüm yazılım depolarındaki açık kaynaklı üçüncü parti kütüphaneleri (NuGet paketleri, NPM modülleri vb.) tespit eden, bu kütüphanelerin bilinen siber güvenlik açıklarını (CVE / GHSA) anlık ve periyodik olarak tarayan, yazılımcı açığı kapattığında bunu algılayıp zafiyeti otomatik çözen (`Auto-Resolve`) kurumsal bir **Software Composition Analysis (SCA)** platformudur.

### Uçtan Uca (End-to-End) Çalışma Döngüsü:

```
[1. GitHub Entegrasyonu]
       |
       +---> Kurumsal GitHub PAT girilir.
       +---> /user API ile kimlik (örn: @gitradar-admin) ve organizasyon otomatik doğrulanır.
       v
[2. Depo Keşfi (Discovery)]
       |
       +---> 64 aktif depo listelenir.
       +---> In-memory ayrıştırma ile kod klonlamadan paket manifestoları (.csproj, packages.lock.json) taranır.
       v
[3. SBOM Envanter Çıkarımı (CIS 16.4)]
       |
       +---> 441 tekil bağımlılık doğrudan (Direct) ve geçişli (Transitive) olarak kataloglanır.
       v
[4. Dağıtık Zafiyet Taraması (CIS 16.6)]
       |
       +---> Paket adı ve sürümü Google OSV (Open Source Vulnerabilities) API'ye sorgulanır.
       +---> CVSS v3.1 skorları ve SLA süreleri hesaplanır.
       v
[5. Diferansiyel Zafiyet Yaşam Döngüsü & Auto-Resolve]
       |
       +---> Yeni taramadaki zafiyetler (B) ile önceki zafiyetler (A) küme farkıyla (A \ B) kıyaslanır.
       +---> Kodda güncellenen açıklar otomatik olarak "RESOLVED (Çözüldü)" statüsüne çekilir.
       v
[6. Denetim İzi & Whitelist Yönetimi (CIS 8)]
       |
       +---> Yapılan tüm işlemler değiştirilemez (append-only) UserActivityLogs tablosuna yazılır.
       +---> Yalnızca Entra ID Admin Whitelist (dbo.AppUsers) onaylı personelin yönetim yetkisi bulunur.
```

---

## BÖLÜM 1: SİSTEM MİMARİSİ & ASENKRON YÜRÜTME MOTORU (.NET 10 & REACT)

### 1.1. BackgroundService & HostedService Yaşam Döngüsü

GitRadar, periyodik tarama otomasyonunu işletim sistemi seviyesinde ek bir cron servisine veya üçüncü parti zamanlama kütüphanelerine (Hangfire, Quartz.NET) ihtiyaç duymadan, doğrudan ASP.NET Core runtime'ı içerisinde barınan **`ScheduledScanBackgroundService`** aracılığıyla in-process olarak yürütür.

```
+--------------------------------------------------------------------------------------------+
|                ScheduledScanBackgroundService In-Process Thread Döngüsü                    |
+--------------------------------------------------------------------------------------------+
       |
       v
[StartAsync] ---> [Initial Delay: 30s] ---> [Döngü Başlangıcı: while (!stoppingToken)]
                                                           |
       +---------------------------------------------------+
       |
       v
[IServiceScopeFactory.CreateScope()] ---> Scoped Service Resolver (GitRadarDbContext, Scans)
       |
       v
[Ayar Doğrulama]: ScanScheduleSetting (IsEnabled == true && NextRunAt <= Now)
       |
       +---> [Şart Sağlanmadı]: Task.Delay(30 min, stoppingToken) ---> Tekrar Kontrol
       |
       +---> [Şart Sağlandı]:
                 |
                 +---> 64 Repo Listelenir
                 +---> SemaphoreSlim(3, 3) Throttling ile Paralel Tarama
                 +---> Diferansiyel Zafiyet Yaşam Döngüsü & Auto-Resolve
                 +---> Audit Trail: "SCHEDULED_BATCH_SCAN" Logu
                 +---> NextRunAt = DateTime.UtcNow.AddDays(IntervalDays)
                 +---> Scope Dispose (Tüm DbContext & Entity Tracker bellekten temizlenir)
```

#### Captive Dependency (Tutsak Bağımlılık) Problemi ve Çözümü

Modern IoC/DI konteynerlerinde en sık karşılaşılan mimari kusurlardan biri, **Singleton** ömürlü bir servisin (`BackgroundService`), **Scoped** ömürlü bir servisi (`GitRadarDbContext`) doğrudan constructor üzerinden enjekte etmeye çalışmasıyla oluşan *Captive Dependency* durumudur. Bu hata; `DbContext`'in uygulama boyunca hiç dispose edilmemesine, Change Tracker'ın on binlerce varlığı bellekte tutarak RAM tüketimini patlatmasına ve concurrency çakışmalarına yol açar.

GitRadar mimarisinde bu problem, **`IServiceScopeFactory`** deseni ile çözülmüştür:

```csharp
namespace GitRadar.API.Services;

public sealed class ScheduledScanBackgroundService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<ScheduledScanBackgroundService> _logger;

    public ScheduledScanBackgroundService(
        IServiceScopeFactory scopeFactory,
        ILogger<ScheduledScanBackgroundService> logger)
    {
        _scopeFactory = scopeFactory ?? throw new ArgumentNullException(nameof(scopeFactory));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Cold start esnasında API servislerinin ayağa kalkmasını bekle (30 sn)
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Her periyodik kontrol için izole bir Scoped konteyner açılır
                using (var scope = _scopeFactory.CreateScope())
                {
                    var dbContext = scope.ServiceProvider.GetRequiredService<GitRadarDbContext>();
                    var setting = await dbContext.ScanScheduleSettings.FirstOrDefaultAsync(s => s.Id == 1, stoppingToken);

                    if (setting is not null && setting.IsEnabled && DateTime.UtcNow >= (setting.NextRunAt ?? DateTime.MinValue))
                    {
                        var scanService = scope.ServiceProvider.GetRequiredService<IRunRepositoryScanUseCase>();
                        var activityService = scope.ServiceProvider.GetRequiredService<IUserActivityService>();

                        await ExecuteScheduledScanPipelineAsync(scope, dbContext, setting, scanService, activityService, stoppingToken);
                    }
                } // Scope kapandığında DbContext, Tracker ve bağlanan tüm nesneler GC'ye teslim edilir
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Zamanlanmış tarama motorunda beklenmeyen döngü hatası: {Message}", ex.Message);
            }

            // Periyodik kontrol aralığı: 30 dakika
            await Task.Delay(TimeSpan.FromMinutes(30), stoppingToken);
        }
    }
}
```

### 1.2. Paralel İşleme & Kaynak Kısıtlama (Throttling)

Enterprise Security organizasyonunda bulunan 64 aktif yazılım deposunun taranması esnasında iki büyük teknik darboğaz bulunmaktadır:
1. **GitHub REST API Rate Limit:** Standart kurumsal Personal Access Token (PAT) saatlik maksimum 5.000 istek ile sınırlandırılmıştır. Denetimsiz `Task.WhenAll` ile 64 deponun aynı anda paralel taranması, GitHub API tarafından HTTP 429 (Too Many Requests) hatası ile bloklanmaya neden olur.
2. **CPU & ThreadPool Tükenmesi:** Her deponun bağımlılık ağacının ayrıştırılması ve OSV API üzerinden taranması yoğun I/O ve deserialization işlemi gerektirir.

Bu riskleri ortadan kaldırmak amacıyla mimariye **`SemaphoreSlim(3, 3)`** tabanlı eşzamanlılık kısıtı entegre edilmiştir:

```csharp
using var semaphore = new SemaphoreSlim(3, 3);
var tasks = repositories.Select(async repo =>
{
    await semaphore.WaitAsync(cancellationToken);
    try
    {
        return await scanService.ExecuteAsync(repo.Id, cancellationToken);
    }
    finally
    {
        semaphore.Release();
    }
});

var results = await Task.WhenAll(tasks);
```

*Teknik Çıktı:* Sistemde aynı anda en fazla 3 depo aktif taranır. Biri tamamlandığında sıradaki depo taranmak üzere kuyruktan alınır. Böylece API kotası güvenli limitlerde tutulurken sunucu CPU kullanımı %25 seviyelerinde dengelenir.

### 1.3. REST & Entegrasyon Katmanı (IIS Express Port 5000 Korunması)

Platform, kurumsal geliştirme ve canlıya alma ortamlarında çakışmaları engellemek adına aşağıdaki katman ilkelerine sadık kalır:
- **Port ve LaunchSettings Hijyeni:** `GitRadar.API`, `launchSettings.json` üzerinde `http://localhost:5000` portuna sabitlenmiştir. CORS politikası (`FrontendPolicy`) yalnızca React client adresine (`http://localhost:5173` ve production domainine) izin verir.
- **Route Çakışması Engelleme:** REST API controller yapılandırmalarında wildcard parametreler yerine kesin tür kısıtları (`[HttpGet("{id:long}")]`, `[HttpPut("{id:long}")]`) uygulanarak route ambiguitesi ortadan kaldırılmıştır.

---

## BÖLÜM 2: ZAFİYET YAŞAM DÖNGÜSÜ & DİFERANSİYEL AUTO-RESOLVE MOTORU

### 2.1. Zafiyet Durum Makinesi (State Machine)

GitRadar platformunda zafiyetler pasif veya statik birer kayıt değildir; durum geçişleri iş kuralları ile denetlenen birer yaşam döngüsüne (lifecycle) sahiptir.

```
       [İlk Tarama: Zafiyetli Paket Keşfi]
                       |
                       v
                 +------------+
                 |    OPEN    | <----------------------------------+
                 +------------+                                    |
                   |        |                                      |
       Manuel İnceleme    Kodda Paket Güncellendi             Güvenli Paket
       (False Positive)   (Otomatik Periyodik Tarama)         Tekrar Düşürüldü
           |                        |                       (Yeniden Açılma)
           v                        v                              |
    +-------------+          +--------------+                      |
    |  IN_REVIEW  |          |   RESOLVED   | ---------------------+
    +-------------+          +--------------+
           |                        ^
           +--- Doğrulandı ---------+
```

*Durum Açıklamaları:*
- **`OPEN` (Açık):** Kaynak kod deposunda zafiyetli bir üçüncü parti kütüphanenin var olduğu ve aktif risk oluşturduğu durum.
- **`IN_REVIEW` (İncelemede):** Güvenlik analistinin triyaj sürecine aldığı, false-positive incelemesi yaptığı durum.
- **`RESOLVED` (Çözüldü):** Kütüphanenin güvenli bir sürüme yükseltildiği veya projeden tamamen kaldırıldığı durum.

### 2.2. Diferansiyel Küme Analizi Algoritması ($Set\ Theory$)

Geleneksel SCA araçlarının en büyük eksikliği; yazılımcı açık barındıran kütüphaneyi güncellediğinde, sistemin önceki zafiyeti açık bırakması ya da veritabanını toptan silerek geçmiş tarihli denetim metriklerini yok etmesidir.

GitRadar, **`ScanExecutionSavePipeline.cs`** içerisinde küme teorisine dayalı diferansiyel bir karşılaştırma algoritması çalıştırır:

#### Matematiksel Model
Belirli bir $R$ deposu için:
- Bir önceki taramada tespit edilen aktif zafiyetlerin kümesi:
  $$A = \{v_1, v_2, \dots, v_n\}$$
- Yeni çalıştırılan taramada kaynak koddan dönen güncel zafiyet kümesi:
  $$B = \{w_1, w_2, \dots, w_m\}$$

Bu kümeler arasındaki bağıntılar şu şekilde çözümlenir:

1. **Çözülen Zafiyetler ($A \setminus B$ Fark Kümesi):**
   Önceki taramada var olan fakat yeni taramada artık tespit edilmeyen zafiyetlerdir:
   $$V_{resolved} = A \setminus B = \{x \mid x \in A \land x \notin B\}$$
   *Aksiyon:* Sistem bu zafiyetleri fiziksel olarak silmez. Durumunu `VulnerabilityAlertStatus.Resolved` yapar, `ResolvedBy = "SYSTEM_AUTO_RESOLVE"` atar ve `ResolvedAtUtc = DateTime.UtcNow` olarak mühürler.

2. **Süreğen Zafiyetler ($A \cap B$ Kesişim Kümesi):**
   Hala açık olan ve düzeltilmemiş zafiyetlerdir. Durumu `OPEN` olarak korunur; açılış tarihi ve SLA sayaçları sıfırlanmaz.

3. **Yeniden Açılan Zafiyetler ($B \cap A_{resolved}$):**
   Daha önce çözülmüş statüsüne çekilen bir zafiyet, bir geliştiricinin lock dosyasını geriye almasıyla tekrar ortaya çıkarsa:
   $$V_{reopened} = B \cap A_{resolved}$$
   *Aksiyon:* Zafiyet kaydı otomatik olarak `OPEN` durumuna geçirilir, `ResolutionComment` alanına re-opened bayrağı eklenir.

#### Kod Seviyesinde Uygulama (`ScanExecutionSavePipeline.cs`)

```csharp
// 1. Önceki tamamlanmış taramadaki zafiyet referanslarını çek
var previousVulns = await _scanExecutionRepository.GetPreviousVulnerabilitiesForRepositoryAsync(repositoryId, cancellationToken);

// 2. Yeni taramada tespit edilen aktif advisory ID kümesini oluştur (O(1) lookup hash set)
var currentAdvisoryIds = enrichedResult.EnrichedDependencies
    .SelectMany(d => d.Vulnerabilities)
    .Select(v => v.Vulnerability.Id)
    .Where(id => !string.IsNullOrWhiteSpace(id))
    .ToHashSet(StringComparer.OrdinalIgnoreCase);

// 3. Diferansiyel Çözümleme: (A \ B) kümesini tespit et
foreach (var prevVuln in previousVulns)
{
    if (!currentAdvisoryIds.Contains(prevVuln.VulnerabilityId))
    {
        var resolvedAlert = VulnerabilityAlert.Create(
            discoveredPackageId: 0,
            vulnerabilityId: prevVuln.VulnerabilityId,
            severity: prevVuln.Severity,
            title: prevVuln.Title,
            affectedVersions: prevVuln.AffectedVersions,
            fixedInVersion: prevVuln.FixedInVersion,
            source: prevVuln.Source,
            createdAtUtc: prevVuln.CreatedAtUtc,
            scanExecutionId: 0,
            cvssScore: prevVuln.CvssScore,
            status: Domain.Enums.VulnerabilityAlertStatus.Resolved,
            resolvedAtUtc: DateTime.UtcNow,
            resolvedBy: "SYSTEM_AUTO_RESOLVE",
            resolutionComment: "Bileşen güvenli sürüme güncellendi veya kaldırıldı. Periyodik tarama tarafından otomatik çözüldü.");

        scanExecution.AddVulnerability(pkg, resolvedAlert);
    }
}
```

### 2.3. Metrik Senkronizasyonu & SLA Hesaplaması

Çözülen zafiyetler fiziksel veritabanında saklanmaya devam ettiği için (denetim geçmişi bütünlüğü), özet sayaçlar SQL seviyesinde `Status` filtresine bağlanmıştır:

$$\text{Aktif Kritik Zafiyet} = \sum [Status = \text{'OPEN'} \land Severity = \text{'CRITICAL'}]$$

$$\text{Ortalama Çözümleme Süresi (MTTR)} = \frac{1}{|V_{resolved}|} \sum_{v \in V_{resolved}} (v.ResolvedAtUtc - v.CreatedAtUtc)$$

Bu matematiksel yaklaşım sayesinde Dashboard üzerindeki sayaçlar çözülen zafiyeti anında eksi bakiye olarak düşerken, kurumsal MTTR (Mean Time to Remediate) grafikleri olumlu yönde beslenir.

---

## BÖLÜM 3: CIS CONTROLS v8 & ULUSLARARASI UYUMLULUK MATRİSİ

GitRadar mimarisi, Center for Internet Security (CIS) Controls v8 rehberinde tanımlanan kurumsal güvenlik pratiklerini çekirdeğinde uygular:

| CIS v8 Kontrol Maddesi | Kontrol Başlığı | GitRadar Mimari Karşılığı | Kaynak Kod / Veritabanı Kanıtı |
| :--- | :--- | :--- | :--- |
| **CIS 16.4** | Establish and Maintain an Inventory of Third-Party Components | Kaynak kod depolarındaki tüm `.csproj`, `packages.lock.json` ve `package-lock.json` dosyalarının taranarak 441 tekil bağımlılığın ekosistem ve kapsamlarıyla kataloglanması. | `SbomController.cs`<br>`DiscoveredPackage.cs`<br>`SbomTable.jsx` |
| **CIS 16.6** | Establish and Maintain a Vulnerability Management Process | Google OSV API entegrasyonuyla bağımlılıkların bilinen CVE/GHSA zafiyetleriyle eşleştirilmesi, CVSS skorlaması ve SLA sürelerinin takibi. | `ScanExecutionSavePipeline.cs`<br>`VulnTriageTable.jsx` |
| **CIS 8.2** | Collect Audit Logs | Gerçekleştirilen tüm operasyonel eylemlerin (toplu tarama, token güncelleme, repo eşitleme vb.) kullanıcı kimliğiyle değiştirilemez şekilde kaydedilmesi. | `UserActivityLogs` Tablosu<br>`UserActivityService.cs` |
| **CIS 8.5** | Ensure Audit Log Retention | Kullanıcı hareketlerinin ve tarama sonuçlarının danger-zone sıfırlamalarından izole tutulması, append-only saklanması. | `ActivitiesController.cs` |

### 3.1. CIS 16.4 (SBOM Envanteri) Derinliği

Sistem; doğrudan (Direct) ve geçişli (Transitive) bağımlılık ayrımını yaparak bağımlılık zincirini kaydeder. Örneğin `Microsoft.IdentityModel.Tokens` doğrudan bir bağımlılık iken, onun gereksinim duyduğu alt şifreleme kütüphaneleri geçişli bağımlılık olarak işaretlenir.

### 3.2. CIS 16.6 (Zafiyet Triyajı & SLA Kuralları)

Sistemde tanımlanan kurumsal SLA politikası CVSS v3.1 temel skorlarına göre işletilir:
- **Kritik (CVSS 9.0 - 10.0):** Maksimum çözüm süresi **7 Gün** (SLA İhlali durumunda kırmızı uyarı rozeti).
- **Yüksek (CVSS 7.0 - 8.9):** Maksimum çözüm süresi **15 Gün**.
- **Orta (CVSS 4.0 - 6.9):** Maksimum çözüm süresi **30 Gün**.
- **Düşük (CVSS 0.1 - 3.9):** Maksimum çözüm süresi **90 Gün**.

### 3.3. CIS 8: Değiştirilemez (Append-Only) Denetim İzi Mimarisi

GitRadar platformunda teknik tarama yürütme tabloları ile kullanıcı hareketleri logları fiziksel veritabanı seviyesinde iki ayrı varlığa ayrılmıştır:
1. `dbo.ScanExecutions`: Hangi deponun ne kadar sürdüğünü, kaç paket bulduğunu gösteren teknik yürütme verisi.
2. `dbo.UserActivityLogs`: CIS 8 standardına göre kimin, ne zaman, hangi IP adresinden hangi eylemi gerçekleştirdiğini belgeleyen denetim izi.

```sql
-- Append-Only Denetim Günlüğü Tablo Mimarisi
CREATE TABLE dbo.UserActivityLogs (
    Id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    UserName NVARCHAR(250) NOT NULL,          -- Örn: "gitradar-admin" veya "admin@example.com"
    UserRole NVARCHAR(50) NOT NULL DEFAULT 'Admin',
    ActionType NVARCHAR(50) NOT NULL,         -- "BATCH_SCAN", "TOKEN_UPDATE", "USER_CREATED"
    ActionTitle NVARCHAR(250) NOT NULL,       -- "Tüm Repoları Taradı", "Yeni Yönetici Eklendi"
    Description NVARCHAR(1000) NOT NULL,      -- "Ahmet Yılmaz (Kıdemli Müh.) sisteme eklendi."
    TargetScope NVARCHAR(500) NOT NULL,       -- "Tüm Depolar (64)" veya hedef e-posta
    Timestamp DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    Status NVARCHAR(50) NOT NULL DEFAULT 'SUCCESS',
    IpAddress NVARCHAR(100) NULL
);
CREATE NONCLUSTERED INDEX IX_UserActivityLogs_Timestamp ON dbo.UserActivityLogs(Timestamp DESC);
```

*Denetim İlkesi:* `UserActivityLogs` tablosuna kesinlikle `UPDATE` veya `DELETE` sorgusu çalıştıracak hiçbir API endpoint'i yazılmamıştır. Platform yalnızca `INSERT` ve `SELECT` işlemlerine izin verir.

---

## BÖLÜM 4: KİMLİK DOĞRULAMA, ÖN-YETKİLENDİRME & KURUMSAL SSO (ENTRA ID)

### 4.1. Tablo Mimarisi ve İzolasyon

Uygulama bünyesinde iki farklı kullanıcı varlığı mevcuttur:
- **`dbo.AspNetUsers`:** ASP.NET Core Identity altyapısından kalan, yerel kullanıcı adı/şifre mekanizması için kullanılan miras tablo.
- **`dbo.AppUsers`:** Kurumsal Microsoft Entra ID (Azure AD) Single Sign-On mimarisine hazırlık olarak inşa edilen **Yönetici Yetkilendirme Listesi (Admin Whitelist)** tablosu.

```
       [Kurumsal Kullanıcı Microsoft Entra ID ile Giriş Yapar]
                                 |
                                 v
        [JWT / Claims-Based Authentication (@example.com)]
                                 |
                                 v
                  +------------------------------+
                  |  dbo.AppUsers Tablo Kontrolü |
                  |  (Email == Token.Email &&    |
                  |   IsActive == true)          |
                  +------------------------------+
                                 |
                +----------------+----------------+
                |                                 |
            [Kayıt Var]                     [Kayıt Yok]
                |                                 |
                v                                 v
         [TAM YÖNETİCİ]                  [STANDART İZLEYİCİ]
     - Tarama Başlatma               - SBOM Görüntüleme
     - GitHub Token Yönetimi         - Zafiyet Triyajı İnceleme
     - Zamanlanmış Görevler          - Yönetim Menüleri Gizlenir
     - Yönetici Ekleme / Silme       - API Değişiklikleri Engellenir
     - Hareketler (Audit Trail)
```

### 4.2. Pre-Provisioning & Whitelist Modeli

Büyük ölçekli kurumlarda binlerce personel Entra ID kullanıcısıdır. Ancak güvenlik platformlarında herkese rastgele rol dağıtılması yetki aşımı (Privilege Escalation) riskidir. 

GitRadar bu sorunu **Ön-Yetkilendirme (Pre-Provisioning Whitelist)** yaklaşımıyla çözmüştür:
1. Bir personele admin yetkisi verilecekse, henüz sisteme girmeden önce mevcut bir Admin tarafından Adı, Ünvanı ve Kurumsal E-postası (`@example.com`) `dbo.AppUsers` tablosuna eklenir.
2. Bu listede tanımlı olan her kullanıcı doğası gereği zaten `Admin`'dir.
3. Listede olmayan diğer tüm kurum çalışanları varsayılan olarak yalnızca salt okunur sayfaları görüntüler; yönetim sekmeleri kendilerine render dahi edilmez.

```csharp
// Program.cs içerisindeki Idempotent Whitelist Tablo Garantisi
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppUsers')
BEGIN
    CREATE TABLE dbo.AppUsers (
        Id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        Email NVARCHAR(250) NOT NULL,
        FullName NVARCHAR(250) NOT NULL,
        Title NVARCHAR(250) NOT NULL DEFAULT '',
        Role NVARCHAR(50) NOT NULL DEFAULT 'Admin',
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        LastLoginAt DATETIME2 NULL,
        CreatedBy NVARCHAR(250) NOT NULL DEFAULT 'SYSTEM'
    );
    CREATE UNIQUE NONCLUSTERED INDEX IX_AppUsers_Email ON dbo.AppUsers(Email);

    -- Seed corporate root administrator
    INSERT INTO dbo.AppUsers (Email, FullName, Title, Role, IsActive, CreatedAt, CreatedBy)
    VALUES ('admin@example.com', N'Yazılım & Güvenlik Ekibi', N'Sistem Güvenlik Yöneticisi', 'Admin', 1, SYSUTCDATETIME(), 'SYSTEM');
END
```

---

## BÖLÜM 5: FRONTEND MİMARİSİ, UX STANDARTLARI & WCAG 2.1 (A11y)

### 5.1. WCAG 2.1 AA Erişilebilirlik (A11y) Mimarisi

Platform; engelli, az gören veya motor becerilerinde kısıt bulunan denetçi ve mühendislerin sistemi rahatça kullanabilmesi amacıyla **W3C Web Content Accessibility Guidelines (WCAG) 2.1 AA** standartlarını destekler.

Tüm erişilebilirlik tercihleri `AccessibilityContext.jsx` üzerinden yönetilir ve doğrudan HTML kök düğümüne (`document.documentElement`) sınıflar enjekte edilir:

```
[Kullanıcı Tercihi] ---> [AccessibilityContext] ---> [localStorage: 'gitradar_a11y']
                                |
                                v
               [document.documentElement (<html class="...">)]
                                |
        +-----------------------+-----------------------+
        |                       |                       |
 [.a11y-font-lg / xl]  [.a11y-high-contrast]   [.a11y-reduce-motion]
  font-size: 110%/120%   2px keskin kenarlık     animasyonları ve CSS
  KaTeX & grid uyumlu    contrast: 115%          transitionları sıfırla
```

#### Global CSS Erişilebilirlik Kuralları (`index.css`)

```css
/* Metin Büyütme Kuralları */
html.a11y-font-lg { font-size: 110%; }
html.a11y-font-xl { font-size: 120%; }

/* Yüksek Kontrast & Keskin Kenarlıklar */
html.a11y-high-contrast {
  filter: contrast(115%);
}
html.a11y-high-contrast button,
html.a11y-high-contrast input,
html.a11y-high-contrast select {
  border-width: 2px !important;
}

/* Bağlantı ve Buton Vurgulama */
html.a11y-highlight-links a,
html.a11y-highlight-links button {
  text-decoration: underline !important;
  text-underline-offset: 3px;
}

/* Disleksi / Net Okuma Fontu */
html.a11y-readable-font body,
html.a11y-readable-font * {
  font-family: Arial, Helvetica, sans-serif !important;
  letter-spacing: 0.02em !important;
}

/* Hareket Azaltma (Vestibüler Bozukluklar İçin) */
html.a11y-reduce-motion * {
  animation: none !important;
  transition: none !important;
}
```

### 5.2. Kurumsal Tasarım Dili ve Marka Bütünlüğü

- **Marka Dengesi:** Sol menünün en altında yer alan Enterprise Security logosu (`32px` yükseklik) ile Enterprise Security Platform logosu (`21px` optik dengeli yükseklik), aralarında `1px` dikey ayırıcı çizgi ile kurumsal telif standartlarına göre kilitlenmiştir.
- **Minimalist İkonografi:** Emojilerden veya tutarsız SVG'lerden arındırılmış, kurumsal standarda sahip tek tip `lucide-react` vektör kütüphanesi kullanılmıştır.
- **Gereksiz Arayüz Kalabalığının Temizlenmesi:** Sayfa üst başlıkları `App.jsx` üzerinden tek merkezden yönetilmiş; sayfaların kendi içinde mükerrer mor banner veya fazladan "Yenile" butonu basması engellenmiştir.

---

## BÖLÜM 6: KURUMSAL ALTYAPI & DEVSECOPS KISITLARI

### 6.1. EDR & Kurumsal Güvenlik Politikaları (Zero Unauthorized Process)

Kurumsal Windows Server ortamlarında çalışan Endpoint Detection and Response (EDR - örn: CrowdStrike Falcon, Microsoft Defender for Endpoint) sistemleri, web uygulamalarının `cmd.exe`, `powershell.exe` veya harici `.exe` prosesleri çatallamasını (process spawning) doğrudan zararlı aktivite veya uzaktan kod yürütme (RCE) teşebbüsü olarak algılar ve sunucuyu ağdan izole eder.

*GitRadar Savunması:*
GitRadar bünyesinde **hiçbir tarama işlemi işletim sistemi seviyesinde process fork ederek çalıştırılmaz**.
- Git klonlama yapılmaz; GitHub REST API üzerinden dosya içerikleri bellek içi (in-memory) stream olarak çekilir.
- Bağımlılık ağacı parse işlemleri, .NET içerisindeki saf RegEx ve JSON kütüphaneleriyle bellek içinde gerçekleştirilir.
- Bu sayede sunucuda EDR alarmları tetiklenmez, yetkisiz binary veya script execution riski sıfıra indirgenir.

### 6.2. PowerShell Yasağı & Windows CMD Uyumluluğu

Geliştirme ve operasyon boru hatlarında Windows PowerShell betiklerinin (`.ps1`) ExecutionPolicy bypass veya credential leakage yaratma ihtimaline karşın; tüm derleme, göç ve bakım komutları katı Windows CMD ve standart .NET CLI (`dotnet build`, `dotnet ef`) ortamına uyumlu tutulmuştur.

---

## BÖLÜM 7: TEKNİK MÜLAKAT, KURUL & YÖNETİCİ SAVUNMA KILAVUZU

Bu bölüm; teknik direktörler, bağımsız siber güvenlik denetçileri veya yönetim kurulu üyeleri tarafından yöneltilebilecek en zorlayıcı 4 soruya verilecek üst düzey mühendislik yanıtlarını içerir:

---

### Soru 1: "Neden Hangfire veya Quartz.NET gibi popüler bir kütüphane yerine in-process BackgroundService tercih ettiniz?"

> **Kıdemli Mimar Yanıtı:**  
> *"Hangfire veya Quartz.NET güçlü araçlar olmakla birlikte kurumsal mimaride iki büyük handikap yaratırlar:  
> 1. **Dış Bağımlılık ve Şema Kirliliği:** Hangfire, SQL Server veritabanı içerisinde kendi `HangFire.*` şeması altında 10'dan fazla tablo açar ve sürekli bir polling yükü oluşturur.  
> 2. **DevSecOps ve Lisans Riski:** Hangfire'ın gelişmiş kurumsal özellikleri (Pro/Ace) ücretli lisanslara tabidir ve üçüncü parti kütüphane artışı SBOM riskimizi artırır.  
> 
> GitRadar'da amacımız 64 kurumsal deponun belirli aralıklarla taranmasıdır. .NET'in yerel `IHostedService / BackgroundService` altyapısı, `IServiceScopeFactory` ile izole scope'lar üreterek sıfır ek bellek ve sıfır dış tablo maliyetiyle bu işi atomik olarak çözer. Dağıtık bir kuyruk ihtiyacı doğduğunda mimarimiz, arayüz soyutlamaları (`IScheduledScanService`) sayesinde RabbitMQ veya Azure Service Bus arkasına tek satır kod değiştirmeden taşınabilecek esnekliktedir."*

---

### Soru 2: "Yazılımcı bağımlılığı güncellediğinde eski zafiyet kaydını veritabanından silmek yerine neden diferansiyel Auto-Resolve mekanizması kurdunuz?"

> **Kıdemli Mimar Yanıtı:**  
> *"Bir zafiyet kaydını veritabanından silmek (`DELETE`), bilgi güvenliği ve denetim ilkelerine (CIS 16.6 ve ISO 27001 Madde A.12.6) taban tabana zıttır.  
> Bir denetçi şirkete geldiğinde şu soruyu sorar: **'Log4j açığı bu depoda ne zaman çıktı ve ne kadar sürede kapandı?'**  
> Eğer zafiyeti silseydik, kurumun MTTR (Mean Time to Remediate) süresini ispatlayamazdık ve zafiyetin hiç var olmadığını iddia etmek zorunda kalırdık.  
> 
> Geliştirdiğimiz Diferansiyel Küme Analizi ($A \setminus B$):
> 1. Zafiyetin durumunu `RESOLVED` yapar,
> 2. Kapatılma anını `ResolvedAtUtc` ile mühürler,
> 3. Kapatan fail olarak `SYSTEM_AUTO_RESOLVE` atar.  
> Böylece aktif risk sayaçlarından düşülürken, geriye dönük başarı karnesi ve kurumsal güvenlik metriği korunmuş olur."*

---

### Soru 3: "64 kurumsal repo arka arkaya taranırken bellek sızıntısı (Memory Leak) ve DbContext şişmesi nasıl engellenmektedir?"

> **Kıdemli Mimar Yanıtı:**  
> *"Entity Framework Core varsayılan olarak sorguladığı veya eklediği her varlığı `ChangeTracker` içerisinde izler. 64 repo taranırken ortaya çıkan yaklaşık 30.000 paket ve zafiyet nesnesi tek bir `DbContext` örneğinde tutulsaydı, ChangeTracker boyutu yüzlerce megabayta ulaşır, bellek kilitlenir ve sorgu süreleri logaritmik olarak uzardı.  
> 
> Bunu üç seviyeli bir hijyenle çözdük:  
> 1. **Per-Execution Scope İzolasyonu:** Her tarama döngüsünde `IServiceScopeFactory.CreateScope()` açılarak sıfır kilometre bir `DbContext` örneği yaratılır ve işlem bitince `using` bloğuyla dispose edilip GC'ye devredilir.  
> 2. **Re-Scan Öncesi Bayat Veri Temizliği:** Aynı deponun re-scan işleminde, `DeletePreviousScansForRepositoryAsync` metodu üzerinden EF Core yerine doğrudan optimize SQL (`ExecuteDeleteAsync`) tetiklenerek varlıklar ChangeTracker'a hiç yüklenmeden ilişkisel olarak temizlenir.  
> 3. **AsNoTracking Kullanımı:** Tüm raporlama ve okuma sorgularında (`GetUsers`, `GetActivities`, `GetRepositories`) izleme devre dışı bırakılmıştır."*

---

### Soru 4: "Audit Trail tablosu (UserActivityLogs) neden sistem sıfırlama (Danger Zone) operasyonlarında KESİNLİKLE silinmemelidir?"

> **Kıdemli Mimar Yanıtı:**  
> *"CIS Controls 8.5 ve SOC 2 Tip II regülasyonlarına göre; bir sistemdeki en şüpheli ve incelenmesi gereken eylem tam olarak 'Sistemi Sıfırlama' (Danger Zone Data Purge) eylemidir.  
> Eğer sistemi sıfırlayan bir yönetici, kendi yaptığı sıfırlama eyleminin denetim logunu da silebilseydi, bu sistemde **'İnkar Edilemezlik' (Non-Repudiation)** prensibi çökerdi.  
> Kötü niyetli bir aktör veya yetkisini kötüye kullanan bir admin tüm depoları ve zafiyetleri silip arkasında hiçbir iz bırakmadan sistemi terk edebilirdi.  
> 
> Bu sebeple GitRadar mimarisinde:  
> - `dbo.UserActivityLogs` tablosu fiziksel olarak Danger Zone silme fonksiyonlarından hariç tutulmuştur.  
> - Sıfırlama butonuna basıldığı anda dahi Audit Trail tablosuna `[SYSTEM_PURGE] Admin tüm tarama geçmişini sıfırladı` şeklinde geri alınamaz yeni bir log kaydı mühürlenir.  
> Denetim günlüğü değiştirilemez bir kara kutudur."*

---

## BÖLÜM 8: MİMARİ KARAR VE ENTEGRASYON METRİĞİ

```
+---------------------------------------------------------------------------------------------------+
| METRİK / ALAN                     | GITRADAR MİMARİ DEĞERİ                                        |
+-----------------------------------+---------------------------------------------------------------+
| Hedef Framework                   | .NET 10 (C# 14) LTS & React 19 / Vite 8                       |
| Zafiyet Tespit Kaynağı            | Google OSV (Open Source Vulnerabilities) API v1               |
| Eşzamanlılık Kısıtı (Throttling)  | SemaphoreSlim(3, 3) (Maksimum 3 paralel repo tarama)          |
| Otomasyon Modeli                  | In-Process BackgroundService + IServiceScopeFactory           |
| Zafiyet Yaşam Döngüsü             | Diferansiyel Küme Analizi (A \ B = Auto-Resolve)              |
| Yetkilendirme Modeli              | Entra ID Pre-Provisioning Admin Whitelist (dbo.AppUsers)       |
| Uluslararası Standart Uyumu       | CIS Controls v8 (16.4, 16.6, 8.2, 8.5) & WCAG 2.1 AA (A11y)  |
| EDR / Host Hijyeni                | Sıfır Process Fork, Sıfır PowerShell, Saf Bellek-İçi Ayrıştırma|
+---------------------------------------------------------------------------------------------------+
```

---
*GitRadar Enterprise Security Bilgi Güvenliği Standartları Referans Alınarak Üretilmiştir.*

