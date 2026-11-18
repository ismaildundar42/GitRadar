# dex-grid — Kullanıma hazırlık raporu

Tarih: 2026-10-16 · Sürüm: 0.1.0 · Temel: AG Grid Community 36.2.0 (MIT)

## Özet

dex-grid, DexShed'in AG Grid Enterprise'dan kullandığı özelliklerin tamamını,
ücretsiz AG Grid Community üzerine kendi kodumuzla ekliyor. 41 birim testi ve
69 tarayıcı testi geçiyor. Bunların içinde DexShed'in ana grid ayarlarını birebir
taklit eden bir uyumluluk testi de var; bu testte AG Grid hiçbir uyarı veya hata
vermiyor. 50.000 satırlık denemede ölçülen hiçbir işlem 300 ms'yi geçmedi.

**Durum: denemeye hazır.** Production'a almadan önce başka bir projede gerçek
veriyle ve gerçek kullanıcı etkileşimiyle (fare, klavye, sürükle-bırak) denenmesi
gerekiyor. Testler programatik; gerçek kullanıcı akışları elle test edilmedi
(bkz. "Doğrulanmayanlar").

## DexShed'in kullandığı özellikler

| Özellik | DexShed'de nerede | dex-grid | Test |
|---|---|---|---|
| Set filter (`agSetColumnFilter`) | `main.js` 4 kolon | ✅ | 11 + uyumluluk |
| Rich select editörü | `main.js:1520` | ✅ | 4 + uyumluluk |
| Kolon paneli (`sideBar`) | `main.js:324` | ✅ | 6 + uyumluluk |
| Satır gruplama, `groupDefaultExpanded`, `autoGroupColumnDef` | `main.js:344-359`, tüm kolonlarda `enableRowGroup` | ✅ | 10 + uyumluluk |
| Pivot (panelde açık) | tüm kolonlarda `enablePivot` | ✅ | 5 |
| Hücre aralığı seçimi (`cellSelection`) | `main.js:363` | ✅ | 7 |
| Grafik (`enableCharts`, `chartRange`) | `main.js:345` | ✅ (AG Charts Community) | 5 + uyumluluk |
| Sağ tık menüsü (`getContextMenuItems`) | `main.js:425-449` | ✅ | 5 + uyumluluk |
| Kopyala / başlıklarla kopyala / yapıştır | menü öğeleri | ✅ | 6 |
| Excel dışa aktarım | `main.js:1911`, `queue.js:333` | ✅ (SheetJS) | 6 + gruplu |
| Community özellikleri (sıralama, metin/sayı/tarih filtresi, düzenleme, geri alma, CSV, sabit kolonlar, Türkçe dil) | her yerde | AG Grid Community | uyumluluk |

Kullanılmayan ve eklenmeyen Enterprise özellikleri: SSRM, tree data,
master/detail, multi filter, advanced filter, filtre paneli, status bar,
sparkline'lar.

## AG Grid Enterprise'dan farklar

Bilerek farklı yapılanlar (AG Grid analizinde bulunan tuzakları önlemek için):

- **Excel:** `"0012"` gibi metinler sayıya çevrilmiyor; `=` ile başlayan metinler
  formüle dönüşmüyor. Sayılar sayı kalıyor ve isteğe bağlı bir sayı formatı
  alabiliyor. Global paylaşılan durum yok; iki grid birbirini etkilemiyor.
- **Set filter:** kolonun `valueFormatter`'ı listede ve aramada kullanılıyor.
  Arama Türkçe karakterlerde (İ/ı) doğru çalışıyor. Model sessizce yeniden
  yazılmıyor.
- **Yapıştırma:** `"1,5"` ve `"1.234,5"` gibi Türkçe sayı yazımları doğru çözülüyor.

Teknik zorunluluktan farklı olanlar:

- **Grup satırları:** sıradan satırlar. `node.group` `false`, grup bilgisi
  `node.data.__dexGroup` içinde. DexShed `forEachNode` ile satır gezdiği
  yerlerde gruplama açıkken grup satırlarını atlamalı (`api.isGroupNode(node)`).
- **Kimlikler:** grup satırı kimlikleri `dex-group-`, otomatik grup kolonu
  `dex-auto-group` (AG Grid `row-group-` ve `ag-Grid-AutoColumn`'u kendine ayırmış).
- **Pivot kolonları:** tüm verilerden üretiliyor; filtre değerleri değiştiriyor,
  kolon setini değiştirmiyor.
- **Ortalama:** `avg` sonucu `{value, count}` nesnesi değil, düz sayı.

## Performans (50.000 satır, tek ölçüm, sekme önde)

| İşlem | Süre |
|---|---|
| Grid oluşturma | 79 ms |
| İki seviyeli gruplama (1.000 grup) | 117 ms |
| Gruplu görünümde filtre | 54 ms |
| Tümünü aç (~26.000 satır) | 42 ms |
| Set filter listesi (500 değer) | 222 ms |
| Excel dışa aktarım (gruplu / düz) | 279 / 257 ms |
| Gruplamayı kaldırma | 184 ms |

JS bellek kullanımı yaklaşık 169 MB. CPU süresi ayrıca ölçülmedi.

## Doğrulanmayanlar

- **Gerçek kullanıcı etkileşimi:** fare sürükleme, kolon panelinden
  sürükle-bırak, klavye ile Shift+ok seçimi ve gerçek pano (Ctrl+C/V)
  testlerde olay gönderilerek denendi; elle denenmedi.
- **Tarayıcılar:** yalnızca uygulama içi Chromium'da test edildi. Firefox ve
  Safari denenmedi.
- **Excel dosyası:** SheetJS ile geri okunarak doğrulandı; gerçek Excel'de
  açılmadı.
- **Erişilebilirlik:** ekran okuyucu ve tam klavye gezintisi denetlenmedi.
- **DexShed:** DexShed'in kendi kodu dex-grid ile çalıştırılmadı (istendiği gibi
  DexShed'e dokunulmadı). Uyumluluk, DexShed ayarlarının kopyasıyla test edildi.

## Bilinen sınırlar

- Yapıştırma geri alınamıyor (`undoRedoCellEditing` yalnızca hücre düzenlemeyi kapsıyor).
- Gruplu görünümde grup satırları `forEachNode` içinde görünüyor (yukarıya bakın).
- Grafik penceresinde AG Grid Enterprise'daki grafik düzenleme paneli yok;
  grafik türü değiştirme ve PNG indirme var.
- Kolon panelinden gruplama, panel içindeki sürükle-bırakla yapılıyor; grid
  başlığından gruplama paneline sürükleme yok.

## DexShed kopyasında gerçek test (2026-10-19)

Kopya: `C:\Users\DE10000318\source\repos\dexshed-dexgrid` (orijinal DexShed
değişmedi). Yalnızca 7 HTML dosyasındaki script/CSS etiketleri değişti:
AG Grid Enterprise (CDN, sürümsüz) → `ag-grid-community` 36.2.0 +
`ag-grid-compat.js`; `ag-charts-enterprise` → `ag-charts-community` 14.2.0.
DexShed'in JavaScript kodu değişmedi. Sunucu `NODE_ENV=test` ile
(`dexshed_test` veritabanı) `dexgrid-test-server.cjs` üzerinden
`http://localhost:8091`'de çalıştırıldı; giriş kullanıcı tarafından yapıldı.

Ana veri grid'i, `tbldhlithology` (34.774 satır, 40 kolon; 30 set filter,
14 rich select kolonu):

| Özellik | Sonuç | Gözlem |
|---|---|---|
| Sayfa yükleme | ✅ | AG Grid uyarısı/hatası yok |
| Set filter | ✅ | `Hole_ID`: 2.219 değer, 369 ms; 2 kuyu → 90 satır; diğer filtreye göre daralma; "(Boş)" `tr.js`'ten |
| Rich select | ✅ | 233 kod değeri, DexShed formatı ("ADAG — Andezitik Aglomera"), arama; iptal veriyi değiştirmedi |
| Düzenleme + geri alma | ✅ | değer değişti, DexShed "düzenlendi" stilini uyguladı, `undoCellEditing` geri aldı |
| Kolon paneli | ✅ | 40 kolon, gizle/göster, gruplama alanı, pivot anahtarı; sekme adı "Sütunlar" (düzeltme sonrası) |
| Sağ tık menüsü | ✅ | DexShed'in özel öğeleri + Türkçe yerleşik öğeler; durumlar doğru (aralık yokken grafik pasif) |
| Hücre aralığı + kopyalama | ✅ | 15 hücre işaretlendi; başlıklı TSV doğru |
| Grafik | ✅ | aralıktan pencere + çizim, kapatma |
| Excel (bellekte) | ✅ | filtreli 90 satır 62 ms; tüm tablo 34.774×40 ≈ 2,0 sn, 5 MB; sayılar sayı |
| Gruplama | ✅ | `Lith1_Code`: 206 grup, 696 ms; filtreyle birlikte; menüdeki daralt/genişlet etkin |
| Pivot | ✅ | 393 ms; çıkışta tablo eski haline döndü |

Diğer sayfalar: `index.html`, `queue.html`, `imported-lab-data.html`,
`qaqc-reports.html`, `missing-data.html`, `lab.html` hatasız yüklendi.
`imported-lab-data` ve `qaqc-reports` grid'leri oluştu. QAQC Dynamic Reports
ekranı (önizleme verisiyle) kullanıcı tarafından elle denendi ve tüm
işlevleriyle çalıştığı bildirildi. Test veritabanında kuyruk ve içe aktarılmış
parti olmadığı için `queue` ve `imported-lab-data` grid'leri veriyle denenmedi.

Veritabanına yazma: test boyunca ağda yalnızca `GET` istekleri ve kullanıcının
`/api/login` istekleri görüldü; kaydet/sil yapılmadı.

Gözlemler:
- Düzeltildi: kolon paneli sekme adı `labelKey`'i dikkate almıyordu (AG Grid
  `localeText[labelKey]`'i önceler); dex-grid'de düzeltildi.
- Grup satırlarında DexShed'in boş birincil anahtar `cellStyle` kuralı
  hücreleri kırmızı gösteriyor (grup satırının bu alanları boş). AG Grid
  Enterprise'ın aynı durumdaki davranışı doğrulanmadı.
- DexShed'de, dex-grid'den bağımsız: `ssl.key`/`ssl.pfx` ve `.env*` dosyaları
  git'e commit'li; kopya bunları da aldı.

## Başka bir projede denemek için

1. `npm install` (dex-grid klasöründe).
2. `npm run demo` → <http://localhost:5180/> (2.000 satırlık örnek, tüm özellikler).
3. Tarayıcı testleri: `/test/browser/index.html?suites=excel,setFilter,richSelect,clipboard,contextMenu,columnsPanel,cellSelection,grouping,pivot,charts,dexshed`.
4. Kendi projende: README'deki "Migrating from AG Grid Enterprise" adımları.
