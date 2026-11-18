import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  ShieldAlert,
  Clock,
  Terminal,
  Copy,
  Check,
  Package,
  Layers,
  ChevronDown,
  Info,
  ShieldCheck,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  FileCode,
} from 'lucide-react';
import { SeverityBadge } from './VulnTriageTable';

export const STATUS_CONFIG = {
  OPEN: {
    label: 'Açık (Open)',
    shortLabel: 'Open',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/40',
    dotClass: 'bg-rose-500',
  },
  INREVIEW: {
    label: 'İnceleniyor (In Review)',
    shortLabel: 'In Review',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40',
    dotClass: 'bg-blue-500',
  },
  INPROGRESS: {
    label: 'İnceleniyor (In Review)',
    shortLabel: 'In Review',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40',
    dotClass: 'bg-blue-500',
  },
  RISKACCEPTED: {
    label: 'Risk Kabul Edildi (Risk Accepted)',
    shortLabel: 'Risk Accepted',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40',
    dotClass: 'bg-amber-500',
  },
  FALSEPOSITIVE: {
    label: 'Yanlış Pozitif (False Positive)',
    shortLabel: 'False Positive',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/40',
    dotClass: 'bg-purple-500',
  },
  RESOLVED: {
    label: 'Çözüldü (Resolved)',
    shortLabel: 'Resolved',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40',
    dotClass: 'bg-emerald-500',
  },
};

/**
 * OSV / GitHub Advisory zafiyet verisini işleyerek yönetici ve geliştirici
 * için zengin Türkçe kurumsal güvenlik açıklaması ve yapılandırılmış etki analizi üretir.
 */
export function formatVulnerabilityBrief(vuln, pkg) {
  const advisoryId = (vuln?.advisoryId || 'GHSA-XXXX-XXXX').trim();
  const packageName = pkg?.packageName || vuln?.packageName || 'Bileşen';
  const affectedVersion = pkg?.packageVersion || vuln?.packageVersion || '-';

  const rawEco = (pkg?.ecosystem || vuln?.ecosystem || 'NuGet').trim();
  const ecosystem =
    rawEco.toLowerCase() === 'npm'
      ? 'npm'
      : rawEco.toLowerCase() === 'nuget'
      ? 'NuGet'
      : rawEco;

  const rawFixed = (vuln?.fixedInVersion || vuln?.fixedVersion || '').trim();
  const hasFixedVersion = Boolean(
    rawFixed && rawFixed !== '-' && rawFixed.toLowerCase() !== 'null' && rawFixed.toLowerCase() !== 'none'
  );
  const fixedVersion = hasFixedVersion ? rawFixed : null;

  const rawScore = vuln?.cvssScore ?? vuln?.cvss ?? vuln?.score ?? null;
  const hasCvssScore =
    rawScore !== null && rawScore !== undefined && rawScore !== '' && !isNaN(Number(rawScore));
  const cvssScore = hasCvssScore ? Number(rawScore).toFixed(1) : null;

  // Önem derecesi (Severity) normalizasyonu
  let severity = (vuln?.severity || 'HIGH').toUpperCase().trim();
  if (hasCvssScore) {
    const num = Number(rawScore);
    if (num >= 9.0) severity = 'CRITICAL';
    else if (num >= 7.0) severity = 'HIGH';
    else if (num >= 4.0) severity = 'MEDIUM';
    else if (num >= 0.1) severity = 'LOW';
  } else if (severity === 'MODERATE') {
    severity = 'MEDIUM';
  } else if (!['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL'].includes(severity)) {
    severity = 'HIGH';
  }

  // Ham açıklama/özet kontrolü
  const candidateSummary = (vuln?.summary || vuln?.description || vuln?.title || '').trim();
  const candidateDetails = (vuln?.details || '').trim();
  const primaryRawText = candidateSummary || candidateDetails;

  const isBareCodePattern = /^(GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}|CVE-\d{4}-\d+|OSV-\d{4}-\d+)$/i.test(
    primaryRawText
  );
  const isEmptyOrRawCode =
    !primaryRawText ||
    primaryRawText.toUpperCase() === advisoryId.toUpperCase() ||
    isBareCodePattern ||
    primaryRawText.length < 25;

  let mainDescription = '';
  let hasTechnicalSourceSummary = false;
  let technicalSourceSummary = '';
  let technicalSourceDetails = '';

  if (isEmptyOrRawCode) {
    mainDescription = `${packageName} (${ecosystem}) paketinin ${affectedVersion} sürümünde ${advisoryId} referanslı bir güvenlik zafiyeti tespit edilmiştir. İlgili bileşenin mevcut sürümü, bilinen güvenlik açıklarına karşı korumasız durumdadır ve uygulama katmanında yetkisiz erişim, veri bütünlüğü kaybı veya servis kesintisi riskleri oluşturabilir.`;
  } else {
    mainDescription = `${packageName} (@${affectedVersion}) bağımlılığında tespit edilen ${advisoryId} kodlu güvenlik bulgusu:`;
    hasTechnicalSourceSummary = true;
    technicalSourceSummary = primaryRawText;
    if (
      candidateDetails &&
      candidateDetails.length >= 25 &&
      candidateDetails !== primaryRawText &&
      candidateDetails.toUpperCase() !== advisoryId.toUpperCase()
    ) {
      technicalSourceDetails = candidateDetails;
    }
  }

  // Risk Düzeyi & Öncelik aksiyon notu
  let priorityActionNote = 'Planlı sürüm yükseltmesi gerekir';
  if (severity === 'CRITICAL' || severity === 'HIGH') {
    priorityActionNote = 'Acil yama önerilir';
  } else if (severity === 'MEDIUM') {
    priorityActionNote = 'Planlı sürüm yükseltmesi gerekir';
  } else {
    priorityActionNote = 'İzleme ve bakım periyodunda güncellenmelidir';
  }

  // 3 Yapılandırılmış Etki ve Risk Özeti Satırı
  const affectedLayer = `${ecosystem} Bağımlılık Zinciri (${packageName})`;
  const riskPriority = `${severity} Seviye — ${priorityActionNote}`;
  const resolutionStatus = hasFixedVersion
    ? `${fixedVersion} sürümü ile giderilmiştir`
    : 'Üretici yaması bekleniyor / Alternatif izolasyon önerilir';

  return {
    advisoryId,
    packageName,
    affectedVersion,
    fixedVersion,
    hasFixedVersion,
    ecosystem,
    severity,
    cvssScore,
    hasCvssScore,
    isEmptyOrRawCode,
    mainDescription,
    hasTechnicalSourceSummary,
    technicalSourceSummary,
    technicalSourceDetails,
    affectedLayer,
    riskPriority,
    resolutionStatus,
  };
}

export default function VulnDetailDrawer({
  isOpen,
  onClose,
  vuln,
  pkg,
  sla,
  isAdmin = false,
  currentStatus = 'OPEN',
  onStatusChange,
}) {
  const [copied, setCopied] = useState(false);
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState(null);

  // ESC tuşu ile modalı kapatma desteği
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !vuln) return null;

  const brief = formatVulnerabilityBrief(vuln, pkg);
  const pkgName = brief.packageName;
  const pkgVersion = brief.affectedVersion;
  const ecosystemLower = brief.ecosystem.toLowerCase();
  const repoName =
    vuln.repositoryName ||
    (vuln.repositoryFullName ? vuln.repositoryFullName.split('/')[1] : null) ||
    'Repo';
  const repoFullName =
    vuln.repositoryFullName ||
    (vuln.repositoryOwner ? `${vuln.repositoryOwner}/${repoName}` : repoName);
  const repoBranch = vuln.defaultBranch || 'main';
  const repoUrl = vuln.htmlUrl || `https://github.com/${repoFullName}`;
  const rawScore = vuln.cvssScore ?? vuln.cvss ?? vuln.score;

  const remediationCommand =
    ecosystemLower === 'npm'
      ? brief.hasFixedVersion
        ? `npm install ${pkgName}@${brief.fixedVersion}`
        : `npm update ${pkgName}`
      : brief.hasFixedVersion
      ? `dotnet add package ${pkgName} --version ${brief.fixedVersion}`
      : `dotnet add package ${pkgName}`;

  const handleCopyCommand = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(remediationCommand);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const advisoryUrl = brief.advisoryId.startsWith('GHSA-')
    ? `https://github.com/advisories/${brief.advisoryId}`
    : `https://osv.dev/vulnerability/${brief.advisoryId}`;

  const normalizedStatus = (currentStatus || 'OPEN').toUpperCase().replace(/[^A-Z]/g, '');
  const statusInfo = STATUS_CONFIG[normalizedStatus] || STATUS_CONFIG.OPEN;

  const handleSelectStatus = (statusKey, cfg) => {
    onStatusChange?.(statusKey);
    setIsStatusMenuOpen(false);
    setStatusFeedback(`Durum "${cfg.shortLabel}" olarak güncellendi`);
    setTimeout(() => setStatusFeedback(null), 3000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4 sm:p-6"
      onClick={onClose}
    >
      {/* Merkezlenmiş Kurumsal Executive Modal Kutusu */}
      <div
        className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vuln-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* =========================================================================
            1. SABİT ÜST BAŞLIK (Sticky Header)
            ========================================================================= */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50/80 dark:bg-slate-900/90 backdrop-blur-md shrink-0">
          {/* Sol Taraf: Kalkan/Uyarı İkonu Rozeti + GHSA ID + Harici Link + Alt Başlık */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="p-2 rounded-xl bg-[#C8102E]/10 text-[#C8102E] border border-[#C8102E]/20 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2
                  id="vuln-modal-title"
                  className="text-base font-bold font-mono text-slate-900 dark:text-white truncate"
                >
                  {brief.advisoryId}
                </h2>
                <a
                  href={advisoryUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Resmi Zafiyet Danışma Kaydını Yeni Sekmede Aç"
                  className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors shrink-0"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                CIS Safeguard 16.6 Güvenlik Triyaj Detayı
              </p>
            </div>
          </div>

          {/* Sağ Taraf: Önem Derecesi Rozeti (Severity + CVSS) ve Kapat (X) Butonu */}
          <div className="flex items-center gap-3 shrink-0">
            <SeverityBadge severity={brief.severity} cvssScore={rawScore} />
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
              title="Kapat (ESC)"
              aria-label="Modalı Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* =========================================================================
            2. GÖVDE — 2 SÜTUNLU EXECUTIVE GRID (Scrollable Body)
            ========================================================================= */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-xs text-slate-700 dark:text-slate-300">
          {/* ÜST SATIR: Bileşen & Depo Özet Bandı */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Paket Adı ve Sürümü Belirgin Kutuda */}
              <div className="inline-flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 shadow-2xs min-w-0">
                <Package className="w-4 h-4 text-[#C8102E] shrink-0" />
                <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {pkgName}
                </span>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 shrink-0">
                  @{pkgVersion}
                </span>
              </div>

              {/* Sağda Hizalı: SLA Kalan Gün & Durum Seçici */}
              <div className="flex flex-wrap items-center gap-3">
                {/* CIS 16.6 SLA Süresi */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 text-xs">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  {sla?.isBreached ? (
                    <span className="text-rose-600 dark:text-rose-400 font-bold font-mono">
                      SLA Aşıldı ({Math.abs(sla.remainingDays)} gün) - Termin: {sla.deadlineString}
                    </span>
                  ) : (
                    <span className="text-slate-600 dark:text-slate-300 font-mono">
                      <strong className="text-slate-900 dark:text-white">{sla?.remainingDays ?? 14} gün</strong> - Termin: {sla?.deadlineString}
                    </span>
                  )}
                </div>

                {/* Durum Seçici Dropdown */}
                <div className="relative">
                  {isAdmin ? (
                    <div className="relative inline-block text-left">
                      <button
                        type="button"
                        onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all active:scale-95 ${statusInfo.badgeClass}`}
                      >
                        <span className={`w-2 h-2 rounded-full ${statusInfo.dotClass}`} />
                        <span>{statusInfo.shortLabel}</span>
                        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                      </button>

                      {isStatusMenuOpen && (
                        <div className="absolute right-0 mt-1.5 w-52 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl py-1.5 z-30">
                          {Object.entries({
                            OPEN: STATUS_CONFIG.OPEN,
                            INREVIEW: STATUS_CONFIG.INREVIEW,
                            RISKACCEPTED: STATUS_CONFIG.RISKACCEPTED,
                            FALSEPOSITIVE: STATUS_CONFIG.FALSEPOSITIVE,
                            RESOLVED: STATUS_CONFIG.RESOLVED,
                          }).map(([statusKey, cfg]) => (
                            <button
                              key={statusKey}
                              type="button"
                              onClick={() => handleSelectStatus(statusKey, cfg)}
                              className={`w-full text-left px-3.5 py-2 text-xs font-medium flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer ${
                                normalizedStatus === statusKey
                                  ? 'text-[#C8102E] font-bold bg-slate-50/70 dark:bg-slate-800/40'
                                  : 'text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <span className={`w-2 h-2 rounded-full ${cfg.dotClass}`} />
                              <span>{cfg.label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${statusInfo.badgeClass}`}>
                      <span className={`w-2 h-2 rounded-full ${statusInfo.dotClass}`} />
                      <span>{statusInfo.shortLabel} (Salt Okunur)</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Alt Bant: Etkilenen Depo Linki ve Dal (Branch) */}
            <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <GitBranch className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-slate-500 dark:text-slate-400 font-medium">Etkilenen Depo:</span>
                <a
                  href={repoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-mono text-xs font-semibold border border-blue-200 dark:border-blue-800/50 transition-colors"
                  title="GitHub Deposunu Yeni Sekmede Aç"
                >
                  <span className="truncate max-w-[280px] sm:max-w-[380px]">{repoFullName}</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-75 shrink-0" />
                </a>
              </div>

              <span className="text-xs font-mono text-slate-600 dark:text-slate-300 shrink-0 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                Dal: <strong className="text-slate-900 dark:text-white">{repoBranch}</strong>
              </span>
            </div>
          </div>

          {/* ORTA SATIR: 2 Sütunlu Executive Grid (grid-cols-1 lg:grid-cols-2 gap-6) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            {/* SOL SÜTUN: Zafiyet Tanımı ve Güvenlik Etkisi (3 Katmanlı Yeni Tasarım) + CIS 16.6 Denetim Notu */}
            <div className="space-y-4">
              {/* Zafiyet Tanımı ve Güvenlik Etkisi Kartı */}
              <div className="p-5 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-4">
                {/* Katman A: Üst Başlık ve Referans / CVSS Rozeti */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-200/80 dark:border-slate-700/60">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Zafiyet Tanımı ve Güvenlik Etkisi</span>
                  </h3>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {brief.advisoryId}
                    </span>
                    {brief.hasCvssScore && (
                      <span className="px-2 py-0.5 rounded-md bg-[#C8102E]/10 text-[#C8102E] dark:bg-[#C8102E]/20 dark:text-rose-300 border border-[#C8102E]/20 font-mono text-[11px] font-bold">
                        CVSS {brief.cvssScore}
                      </span>
                    )}
                  </div>
                </div>

                {/* Katman B: Ana Güvenlik Açıklaması & Varsa OSV Teknik Kaynak Özeti */}
                <div className="space-y-3">
                  <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-medium">
                    {brief.mainDescription}
                  </p>

                  {brief.hasTechnicalSourceSummary && (
                    <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-700/80 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <FileCode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span>Teknik Kaynak Özeti (OSV / GitHub Advisory)</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-mono break-words">
                        {brief.technicalSourceSummary}
                      </p>
                      {brief.technicalSourceDetails && (
                        <p className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                          {brief.technicalSourceDetails}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Katman C: Yapılandırılmış Etki ve Risk Özeti (3 Küçük Bilgi Satırı / Pill) */}
                <div className="pt-3 border-t border-slate-200/80 dark:border-slate-700/60 space-y-2">
                  {/* 1. Etkilenen Katman */}
                  <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/60 text-xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                      <Layers className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <span>Etkilenen Katman:</span>
                    </span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 text-right">
                      {brief.affectedLayer}
                    </span>
                  </div>

                  {/* 2. Risk Düzeyi & Öncelik */}
                  <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/60 text-xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Risk Düzeyi & Öncelik:</span>
                    </span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-right">
                      {brief.riskPriority}
                    </span>
                  </div>

                  {/* 3. Çözüm Durumu */}
                  <div className="flex items-start justify-between gap-2 px-3 py-2 rounded-lg bg-white dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-700/60 text-xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>Çözüm Durumu:</span>
                    </span>
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 text-right">
                      {brief.resolutionStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* CIS Controls v8 Safeguard 16.6 Denetim Notu Bilgi Kutusu */}
              <div className="p-4 rounded-xl bg-slate-100/80 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
                  <Layers className="w-4 h-4 text-[#C8102E] shrink-0" />
                  <span>CIS Controls v8 Safeguard 16.6 Denetim Notu</span>
                </div>
                <p className="leading-relaxed">
                  Zafiyet önceliklendirme matrisine göre <strong>{brief.severity}</strong> önem dereceli zafiyetler için kurumsal SLA hedefi <strong>{sla?.maxDays || 14} gündür</strong>. Belirtilen termin tarihi aşıldığında sistem ilgili zafiyeti denetim raporlarında gecikmiş olarak işaretler.
                </p>
              </div>
            </div>

            {/* SAĞ SÜTUN: Önerilen Düzeltme & İyileştirme (Remediation) */}
            <div className="p-5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border-2 border-emerald-500/30 dark:border-emerald-500/30 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Önerilen Düzeltme & İyileştirme</span>
                </h3>

                <span className="font-mono text-xs px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 font-bold border border-emerald-300 dark:border-emerald-700/60">
                  {brief.hasFixedVersion
                    ? `Asgari Güvenli Sürüm: >= ${brief.fixedVersion}`
                    : 'Güvenli Sürüm: Üretici Yaması Bekleniyor'}
                </span>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {brief.hasFixedVersion
                  ? 'Bağımlılık ağacındaki zafiyetli bileşeni güvenli sürüme yükseltmek ve CIS 16.6 uyumluluğunu sağlamak için aşağıdaki paket güncelleme komutunu proje dizininde çalıştırın:'
                  : 'Bu zafiyet için doğrudan bir yama sürümü belirtilmemiştir. Paketi en güncel kararlı sürüme yükseltmek için aşağıdaki komutu çalıştırabilir veya alternatif izolasyon uygulayabilirsiniz:'}
              </p>

              {/* Terminal Komut Kutusu ve Sağ Üst Kopyala / Kopyalandı Butonu */}
              <div className="rounded-xl bg-slate-950 text-slate-100 border border-slate-800 shadow-inner overflow-hidden">
                <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border-b border-slate-800">
                  <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
                    <Terminal className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>CLI İyileştirme Komutu</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyCommand}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-sans font-semibold border border-slate-700 transition-colors cursor-pointer shrink-0"
                    title="Komutu Panoya Kopyala"
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Kopyalandı</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                        <span>Kopyala</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="p-3.5 font-mono text-xs overflow-x-auto select-all flex items-center gap-2">
                  <span className="text-emerald-400 shrink-0 select-none">$</span>
                  <code className="text-slate-100 break-all">{remediationCommand}</code>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            3. SABİT ALT BİLGİ (Sticky Footer)
            ========================================================================= */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 flex items-center justify-between gap-4 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            Enterprise Security & Enterprise Security Platform SCA Portal
          </div>

          <div className="flex items-center gap-3">
            {statusFeedback && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>{statusFeedback}</span>
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              Kapat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
