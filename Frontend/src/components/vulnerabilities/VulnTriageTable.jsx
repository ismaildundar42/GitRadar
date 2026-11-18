import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle,
  Info,
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
  Layers,
  Columns,
  ChevronDown,
  Check,
  PieChart,
  X,
  Filter,
  GitBranch,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import VulnDetailDrawer, { STATUS_CONFIG } from './VulnDetailDrawer';
import DexDataGrid from '../common/DexDataGrid';

/**
 * CIS 16.6 Kurumsal Önem (Severity) ve CVSS Skor Rozeti (React Bileşeni - Drawer vb. için)
 */
export function SeverityBadge({ severity, cvssScore, cvss, score }) {
  const resolvedScore =
    cvssScore !== null && cvssScore !== undefined && cvssScore !== ''
      ? cvssScore
      : cvss !== null && cvss !== undefined && cvss !== ''
      ? cvss
      : score;

  const hasScore =
    resolvedScore !== null &&
    resolvedScore !== undefined &&
    resolvedScore !== '' &&
    !isNaN(Number(resolvedScore));

  const numScore = hasScore ? Number(resolvedScore) : null;
  const formattedScore = hasScore ? numScore.toFixed(1) : null;

  const rawSev = (severity || '').toUpperCase();
  let sev = rawSev;

  if (hasScore) {
    if (numScore >= 9.0) sev = 'CRITICAL';
    else if (numScore >= 7.0) sev = 'HIGH';
    else if (numScore >= 4.0) sev = 'MEDIUM';
    else if (numScore >= 0.1) sev = 'LOW';
  } else if (rawSev === 'HIGH') {
    sev = 'HIGH';
  } else if (rawSev === 'CRITICAL') {
    sev = 'CRITICAL';
  } else if (rawSev === 'MEDIUM' || rawSev === 'MODERATE') {
    sev = 'MEDIUM';
  } else {
    sev = 'LOW';
  }

  let config = {
    label: sev,
    container: 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30 font-medium',
    scoreBg: 'bg-sky-600 text-white',
    icon: Info,
    isCritical: false,
  };

  if (sev === 'CRITICAL') {
    config = {
      label: 'CRITICAL',
      container: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 font-bold',
      scoreBg: 'bg-red-600 text-white',
      icon: ShieldAlert,
      isCritical: true,
    };
  } else if (sev === 'HIGH') {
    config = {
      label: 'HIGH',
      container: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 font-semibold',
      scoreBg: 'bg-orange-600 text-white',
      icon: AlertTriangle,
      isCritical: false,
    };
  } else if (sev === 'MEDIUM') {
    config = {
      label: 'MEDIUM',
      container: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold',
      scoreBg: 'bg-amber-600 text-white',
      icon: AlertCircle,
      isCritical: false,
    };
  }

  const Icon = config.icon;

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs tracking-wide uppercase border ${config.container}`}
      >
        {config.isCritical && (
          <span className="relative flex h-2 w-2 mr-1 before:content-[''] before:animate-ping before:absolute before:h-full before:w-full before:rounded-full before:bg-red-400 before:opacity-75 bg-red-500 rounded-full shrink-0" />
        )}
        <Icon className="w-3.5 h-3.5 shrink-0" />
        <span>{config.label}</span>
      </span>

      {hasScore ? (
        <span
          className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ml-1.5 shadow-xs ${config.scoreBg}`}
          title={`CVSS Skoru: ${formattedScore}`}
        >
          {formattedScore}
        </span>
      ) : (
        <span
          className="bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded text-[11px] font-mono ml-1.5"
          title="CVSS Skoru Belirtilmemiş"
        >
          N/A
        </span>
      )}
    </div>
  );
}

/**
 * CIS 16.6 SLA Gün Hesaplama
 */
export function getSlaInfo(severity, firstDetectedAtUtc, slaDueDateUtc, cvssScore) {
  let sev = (severity || '').toUpperCase();
  const numScore = Number(cvssScore);
  if (!isNaN(numScore) && numScore > 0) {
    if (numScore >= 9.0) sev = 'CRITICAL';
    else if (numScore >= 7.0) sev = 'HIGH';
    else if (numScore >= 4.0) sev = 'MEDIUM';
    else if (numScore >= 0.1) sev = 'LOW';
  }

  let maxDays = 30;
  if (sev === 'CRITICAL') maxDays = 7;
  else if (sev === 'HIGH') maxDays = 14;
  else if (sev === 'MEDIUM') maxDays = 30;
  else if (sev === 'LOW' || sev === 'INFORMATIONAL') maxDays = 60;

  let deadline;
  if (slaDueDateUtc) {
    deadline = new Date(slaDueDateUtc);
  } else {
    const detectedDate = firstDetectedAtUtc ? new Date(firstDetectedAtUtc) : new Date();
    deadline = new Date(detectedDate);
    deadline.setDate(deadline.getDate() + maxDays);
  }

  const now = new Date();
  const remainingDays = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));

  return {
    maxDays,
    remainingDays,
    deadlineString: deadline.toISOString().slice(0, 10),
    isBreached: remainingDays < 0,
    isNearBreach: remainingDays >= 0 && remainingDays <= 3,
  };
}

/**
 * Anlamlı Zafiyet Başlığı & Özeti Yardımcısı
 */
export function getMeaningfulSummary(vuln, pkg) {
  const advisoryId = (vuln?.advisoryId || '').trim();
  const rawSummary = (vuln?.summary || '').trim();
  const rawTitle = (vuln?.title || '').trim();

  if (
    rawSummary &&
    rawSummary.length >= 25 &&
    rawSummary.toUpperCase() !== advisoryId.toUpperCase() &&
    !rawSummary.startsWith('GHSA-') &&
    !rawSummary.startsWith('CVE-')
  ) {
    return rawSummary;
  }
  if (
    rawTitle &&
    rawTitle.length >= 25 &&
    rawTitle.toUpperCase() !== advisoryId.toUpperCase() &&
    !rawTitle.startsWith('GHSA-') &&
    !rawTitle.startsWith('CVE-')
  ) {
    return rawTitle;
  }

  const pkgName = pkg?.packageName || vuln?.packageName || 'Bileşen';
  const pkgVer = pkg?.packageVersion || vuln?.packageVersion || '';
  if (vuln?.advisoryId === 'GHSA-5crp-9r3c-p9vr' || pkgName.includes('Newtonsoft')) {
    return 'Insecure Defaults & Denial of Service (DoS)';
  }
  if (
    vuln?.advisoryId === 'GHSA-cqj4-m2pc-v9m5' ||
    vuln?.advisoryId === 'GHSA-m22m-h4rf-pwq3' ||
    pkgName.includes('SharpZipLib')
  ) {
    return 'Directory Traversal & Arbitrary File Write (Zip-Slip)';
  }
  if (vuln?.advisoryId === 'GHSA-59j7-ghrg-fj52' || pkgName.includes('IdentityModel')) {
    return 'JWT Validation & Memory Exhaustion (DoS)';
  }
  if (vuln?.advisoryId === 'GHSA-5rrx-jjjq-q2r5' || pkgName.includes('Kestrel')) {
    return 'HTTP Request Smuggling & Security Feature Bypass';
  }
  return pkgVer
    ? `${pkgName} (@${pkgVer}) Sürüm Güvenlik Zafiyeti ve Bağımlılık Riski`
    : `${pkgName} Bağımlılık Güvenlik Zafiyeti`;
}

/**
 * Dex-Grid Cell Renderer için DOM Tabanlı SeverityBadge Üreteci
 */
function createSeverityBadgeDOM(severity, cvssScore) {
  const resolvedScore =
    cvssScore !== null && cvssScore !== undefined && cvssScore !== ''
      ? cvssScore
      : null;
  const hasScore = resolvedScore !== null && !isNaN(Number(resolvedScore));
  const numScore = hasScore ? Number(resolvedScore) : null;
  const formattedScore = hasScore ? numScore.toFixed(1) : null;

  let sev = (severity || '').toUpperCase();
  if (hasScore) {
    if (numScore >= 9.0) sev = 'CRITICAL';
    else if (numScore >= 7.0) sev = 'HIGH';
    else if (numScore >= 4.0) sev = 'MEDIUM';
    else if (numScore >= 0.1) sev = 'LOW';
  } else if (sev === 'CRITICAL' || sev === 'HIGH' || sev === 'MEDIUM' || sev === 'MODERATE') {
    if (sev === 'MODERATE') sev = 'MEDIUM';
  } else {
    sev = 'LOW';
  }

  let borderContainer = 'bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30 font-medium';
  let scoreBg = 'bg-sky-600 text-white';
  let isCritical = false;

  if (sev === 'CRITICAL') {
    borderContainer = 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 font-bold';
    scoreBg = 'bg-red-600 text-white';
    isCritical = true;
  } else if (sev === 'HIGH') {
    borderContainer = 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30 font-semibold';
    scoreBg = 'bg-orange-600 text-white';
  } else if (sev === 'MEDIUM') {
    borderContainer = 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold';
    scoreBg = 'bg-amber-600 text-white';
  }

  const container = document.createElement('div');
  container.className = 'flex items-center h-full gap-1.5';
  container.innerHTML = `
    <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs tracking-wide uppercase border ${borderContainer}">
      ${isCritical ? '<span class="relative flex h-2 w-2 mr-0.5 before:content-[\'\'] before:animate-ping before:absolute before:h-full before:w-full before:rounded-full before:bg-red-400 before:opacity-75 bg-red-500 rounded-full shrink-0"></span>' : ''}
      <span>${sev}</span>
    </span>
    ${
      hasScore
        ? `<span class="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold ml-1 shadow-xs ${scoreBg}">${formattedScore}</span>`
        : '<span class="bg-slate-200/60 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded text-[11px] font-mono ml-1">N/A</span>'
    }
  `;
  return container;
}

const AVAILABLE_COLUMNS = [
  { id: 'repositoryName', name: 'Depo / Proje' },
  { id: 'severity', name: 'Önem & CVSS' },
  { id: 'packageName', name: 'İlgili Paket / Sürüm' },
  { id: 'summaryText', name: 'Zafiyet Özeti' },
  { id: 'slaRemainingDays', name: 'CIS 16.6 SLA Süresi' },
  { id: 'currentStatus', name: 'Durum' },
];

export default function VulnTriageTable({ vulnerabilities = [], packages = [] }) {
  const { isAdmin } = useAuth();
  const { isDark } = useTheme();

  const gridApiRef = useRef(null);
  const groupMenuRef = useRef(null);
  const colMenuRef = useRef(null);

  // Eylem Çubuğu Durumları
  const [groupMode, setGroupMode] = useState('none'); // 'none' | 'repository' | 'severity' | 'package'
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showColMenu, setShowColMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    repositoryName: true,
    severity: true,
    packageName: true,
    summaryText: true,
    slaRemainingDays: true,
    currentStatus: true,
  });

  // Çekmece (Drawer) Seçim Durumu
  const [selectedVuln, setSelectedVuln] = useState(null);

  // Zafiyet Durum Yönetimi (Status Overrides)
  const [statusOverrides, setStatusOverrides] = useState({});

  // CIS 16.6 Risk Dağılım Grafiği ve Filtreleme Durumları
  const [showChart, setShowChart] = useState(false);
  const [activeRiskFilter, setActiveRiskFilter] = useState(null);

  // Açılır menüler için dışarı tıklama ve Escape tuşu dinleyicisi
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target)) {
        setShowGroupMenu(false);
      }
      if (colMenuRef.current && !colMenuRef.current.contains(e.target)) {
        setShowColMenu(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowGroupMenu(false);
        setShowColMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Paket haritası (PackageId -> DiscoveredPackage)
  const packageMap = useMemo(() => {
    const map = new Map();
    packages.forEach((p) => {
      if (p.id) map.set(p.id, p);
    });
    return map;
  }, [packages]);

  // Dex-Grid için hazırlanmış satır verileri (Row Data)
  const gridRows = useMemo(() => {
    return vulnerabilities.map((vuln) => {
      const vKey = vuln.id || vuln.advisoryId;
      const pkg = packageMap.get(vuln.discoveredPackageId);
      const pkgName = vuln.packageName || pkg?.packageName || pkg?.name || 'Paket';
      const pkgVersion = vuln.packageVersion || pkg?.packageVersion || pkg?.version || '-';
      const repoName = vuln.repositoryName || (vuln.repositoryFullName ? vuln.repositoryFullName.split('/')[1] : null) || 'Repo';
      const repoFullName = vuln.repositoryFullName || (vuln.repositoryOwner ? `${vuln.repositoryOwner}/${repoName}` : repoName);
      const rowScore = vuln.cvssScore ?? vuln.cvss ?? vuln.score;
      const sla = getSlaInfo(vuln.severity, vuln.firstDetectedAtUtc, vuln.slaDueDateUtc || vuln.slaDueDate, rowScore);

      // Normalize severity for set filter
      const rawSev = (vuln.severity || '').toUpperCase();
      let sev = 'LOW';
      if (rowScore !== null && !isNaN(Number(rowScore))) {
        const ns = Number(rowScore);
        if (ns >= 9.0) sev = 'CRITICAL';
        else if (ns >= 7.0) sev = 'HIGH';
        else if (ns >= 4.0) sev = 'MEDIUM';
        else if (ns >= 0.1) sev = 'LOW';
      } else if (rawSev === 'CRITICAL' || rawSev === 'HIGH' || rawSev === 'MEDIUM' || rawSev === 'LOW' || rawSev === 'MODERATE') {
        sev = rawSev === 'MODERATE' ? 'MEDIUM' : rawSev;
      }

      // Normalize status
      const rawStatus = (statusOverrides[vKey] || vuln.status || 'OPEN').toUpperCase().replace(/[^A-Z]/g, '');
      const currentStatus = STATUS_CONFIG[rawStatus] ? rawStatus : 'OPEN';
      const summaryText = getMeaningfulSummary(vuln, pkg);

      return {
        ...vuln,
        _raw: vuln,
        _pkg: pkg,
        severity: sev,
        repositoryName: repoName,
        repositoryFullName: repoFullName,
        packageName: pkgName,
        packageVersion: pkgVersion,
        packageInfo: `${pkgName} @${pkgVersion}`,
        resolvedScore: rowScore,
        summaryText,
        slaRemainingDays: sla.remainingDays,
        slaDeadline: sla.deadlineString,
        slaIsBreached: sla.isBreached,
        slaIsNearBreach: sla.isNearBreach,
        currentStatus,
      };
    });
  }, [vulnerabilities, packageMap, statusOverrides]);

  // CIS 16.6 Risk ve SLA Dağılım İstatistikleri
  const riskStats = useMemo(() => {
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    let breached = 0;
    let nearBreach = 0;
    let healthy = 0;

    gridRows.forEach((r) => {
      const sev = r.severity;
      if (sev === 'CRITICAL') critical++;
      else if (sev === 'HIGH') high++;
      else if (sev === 'MEDIUM') medium++;
      else low++;

      if (r.slaIsBreached) {
        breached++;
      } else if (r.slaIsNearBreach) {
        nearBreach++;
      } else {
        healthy++;
      }
    });

    const total = gridRows.length;
    return {
      total,
      critical,
      high,
      medium,
      low,
      criticalPct: total ? Math.round((critical / total) * 100) : 0,
      highPct: total ? Math.round((high / total) * 100) : 0,
      mediumPct: total ? Math.round((medium / total) * 100) : 0,
      lowPct: total ? Math.round((low / total) * 100) : 0,
      breached,
      nearBreach,
      healthy,
    };
  }, [gridRows]);

  // İnteraktif Donut Grafiği SVG Dilimleri
  const donutSegments = useMemo(() => {
    const C = 238.761; // 2 * PI * 38
    const total = riskStats.total;
    if (total === 0) return [];

    const order = [
      { key: 'CRITICAL', label: 'Critical', count: riskStats.critical, color: '#ef4444' },
      { key: 'HIGH', label: 'High', count: riskStats.high, color: '#f97316' },
      { key: 'MEDIUM', label: 'Medium', count: riskStats.medium, color: '#f59e0b' },
      { key: 'LOW', label: 'Low', count: riskStats.low, color: '#3b82f6' },
    ];

    let currentOffset = 0;
    const segments = [];
    const activeOrder = order.filter((s) => s.count > 0);
    for (const seg of activeOrder) {
      const segLength = (seg.count / total) * C;
      segments.push({
        ...seg,
        strokeDasharray: `${segLength} ${C - segLength}`,
        strokeDashoffset: -currentOffset,
      });
      currentOffset += segLength;
    }
    return segments;
  }, [riskStats]);

  // Aktif Risk Filtresine göre filtrelenen satırlar
  const displayedRows = useMemo(() => {
    if (!activeRiskFilter) return gridRows;
    return gridRows.filter((r) => r.severity === activeRiskFilter);
  }, [gridRows, activeRiskFilter]);

  // Risk Grafiği Panelini Açma / Kapama (Sütunları otomatik yeniden boyutlandırır)
  const toggleChart = useCallback(() => {
    setShowChart((prev) => !prev);
    setTimeout(() => {
      gridApiRef.current?.sizeColumnsToFit?.();
    }, 80);
  }, []);

  // Risk Filtresi Değiştirme (Aynı seviyeye tıklanırsa filtreyi sıfırlar)
  const handleToggleRiskFilter = useCallback((sev) => {
    setActiveRiskFilter((prev) => (prev === sev ? null : sev));
  }, []);

  const handleStatusChange = (vulnKey, newStatus) => {
    setStatusOverrides((prev) => ({ ...prev, [vulnKey]: newStatus }));
  };

  // Gruplama Fonksiyonu (Düz Liste, Depo, Önem, Paket)
  const applyGrouping = useCallback((mode) => {
    setGroupMode(mode);
    setShowGroupMenu(false);
    if (!gridApiRef.current) return;

    if (mode === 'repository') {
      gridApiRef.current.setRowGroupColumns?.(['repositoryName']);
    } else if (mode === 'severity') {
      gridApiRef.current.setRowGroupColumns?.(['severity']);
    } else if (mode === 'package') {
      gridApiRef.current.setRowGroupColumns?.(['packageName']);
    } else {
      gridApiRef.current.setRowGroupColumns?.([]);
    }

    setTimeout(() => {
      gridApiRef.current?.sizeColumnsToFit?.();
    }, 80);
  }, []);

  // Sütun Gizleme/Gösterme Fonksiyonu
  const toggleColumnVisibility = useCallback((colId, isVisible) => {
    setVisibleColumns((prev) => ({ ...prev, [colId]: isVisible }));
    if (gridApiRef.current?.setColumnsVisible) {
      gridApiRef.current.setColumnsVisible([colId], isVisible);
      setTimeout(() => {
        gridApiRef.current?.sizeColumnsToFit?.();
      }, 60);
    }
  }, []);

  // Excel Raporu İndirme Fonksiyonu
  const handleExportExcel = useCallback(() => {
    if (gridApiRef.current?.exportDataAsExcel) {
      gridApiRef.current.exportDataAsExcel({
        fileName: 'GitRadar_CIS16.6_Triage_Report_2026.xlsx',
        sheetName: 'CIS 16.6 Zafiyet Triyaj',
        columnKeys: ['advisoryId', 'repositoryName', 'severity', 'packageName', 'summaryText', 'slaRemainingDays', 'currentStatus'],
        processCellCallback: ({ value, column, node }) => {
          const colId = column.getColId();
          if (colId === 'currentStatus') {
            const labels = {
              OPEN: 'Açık (Open)',
              INPROGRESS: 'İnceleniyor (In Review)',
              RISKACCEPTED: 'Risk Kabul Edildi (Risk Accepted)',
              FALSEPOSITIVE: 'Yanlış Pozitif (False Positive)',
              RESOLVED: 'Çözüldü (Resolved)',
            };
            return labels[value] || value;
          }
          if (colId === 'slaRemainingDays') {
            const d = node.data;
            if (!d) return value;
            if (d.slaIsBreached) return `SLA Aşıldı (${Math.abs(d.slaRemainingDays)} gün)`;
            return `Kalan: ${d.slaRemainingDays} gün (${d.slaDeadline || ''})`;
          }
          return value;
        },
      });
    }
  }, []);

  // Sağ Tık Bağlam Menüsü (Context Menu - 5 Enterprise Aksiyon)
  const getContextMenuItems = useCallback(
    (params) => {
      const data = params.node?.data;
      if (!data) return params.defaultItems;

      const pkgName = data.packageName || '';
      const remediationCmd = pkgName ? `dotnet add package ${pkgName}` : '';
      const advisoryId = data.advisoryId || '';
      const repoFullName = data.repositoryFullName || (data.repositoryOwner && data.repositoryName ? `${data.repositoryOwner}/${data.repositoryName}` : data.repositoryName || '');

      return [
        {
          name: 'Zafiyet Detayını İncele (Modal)',
          icon: '<svg class="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>',
          action: () => {
            setSelectedVuln(data._raw || data);
          },
        },
        'separator',
        {
          name: '🌿 Bu Depoyu GitHub\'da Aç',
          shortcut: 'GitHub',
          icon: '<svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>',
          disabled: !repoFullName,
          action: () => {
            window.open(`https://github.com/${repoFullName}`, '_blank');
          },
        },
        {
          name: 'Bu Depoya Göre Grupla',
          shortcut: 'Ağaç',
          icon: '<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>',
          action: () => {
            applyGrouping('repository');
          },
        },
        'separator',
        {
          name: 'Advisory ID Kopyala',
          shortcut: 'Ctrl+C',
          icon: '<svg class="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>',
          disabled: !advisoryId,
          action: () => {
            if (advisoryId && navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(advisoryId);
            }
          },
        },
        {
          name: 'Düzeltme CLI Komutunu Kopyala',
          shortcut: 'CLI',
          icon: '<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
          disabled: !pkgName,
          action: () => {
            if (remediationCmd && navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(remediationCmd);
            }
          },
        },
        'separator',
        {
          name: 'Bu Seviyeye Göre Grupla',
          shortcut: 'Önem',
          icon: '<svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>',
          action: () => {
            applyGrouping('severity');
          },
        },
        {
          name: 'Excel Formatında Dışa Aktar',
          shortcut: '.xlsx',
          icon: '<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
          action: () => {
            handleExportExcel();
          },
        },
        'separator',
        {
          name: showChart ? '📊 Risk Grafiğini Gizle' : '📊 Risk Grafiğini Göster',
          shortcut: 'Grafik',
          icon: '<svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"/></svg>',
          action: () => {
            toggleChart();
          },
        },
      ];
    },
    [handleExportExcel, applyGrouping, showChart, toggleChart]
  );

  // Dex-Grid Kolon Tanımları (columnDefs)
  const columnDefs = useMemo(() => {
    return [
      {
        field: 'repositoryName',
        headerName: 'Depo / Proje',
        width: 200,
        minWidth: 170,
        sortable: true,
        enableRowGroup: true,
        filter: 'agSetColumnFilter',
        cellRenderer: (params) => {
          const d = params.data || {};
          const repoName = d.repositoryName || params.value || '-';
          const repoFullName = d.repositoryFullName || (d.repositoryOwner && repoName !== '-' ? `${d.repositoryOwner}/${repoName}` : (repoName !== '-' ? repoName : '-'));
          const url = repoFullName !== '-' ? `https://github.com/${repoFullName}` : '#';

          const el = document.createElement('div');
          el.className = 'flex items-center h-full text-xs';
          el.innerHTML = `
            <a href="${url}" target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-mono text-[11px] font-semibold border border-slate-200/80 dark:border-white/10 hover:border-blue-400 transition-colors max-w-full">
              <svg class="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
              <span class="truncate max-w-[130px]" title="${repoFullName}">${repoName}</span>
            </a>
          `;
          const a = el.querySelector('a');
          if (a && url !== '#') {
            a.addEventListener('click', (e) => e.stopPropagation());
          }
          return el;
        },
      },
      {
        field: 'severity',
        headerName: 'Önem & CVSS',
        width: 140,
        minWidth: 130,
        sortable: true,
        enableRowGroup: true,
        filter: 'agSetColumnFilter',
        filterParams: {
          values: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
          suppressSorting: true,
        },
        cellRenderer: (params) => {
          const data = params.data || {};
          return createSeverityBadgeDOM(data.severity, data.resolvedScore);
        },
      },
      {
        field: 'packageName',
        headerName: 'İlgili Paket / Sürüm',
        width: 220,
        minWidth: 190,
        sortable: true,
        enableRowGroup: true,
        filter: 'agTextColumnFilter',
        cellRenderer: (params) => {
          const data = params.data || {};
          const pkgName = data.packageName || params.value || '-';
          const pkgVer = data.packageVersion || '-';
          const el = document.createElement('div');
          el.className = 'flex items-center h-full text-xs';
          el.innerHTML = `
            <span class="font-bold text-slate-900 dark:text-white truncate max-w-[135px]" title="${pkgName}">${pkgName}</span>
            <span class="text-slate-600 dark:text-slate-300 font-mono text-[11px] ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60">@${pkgVer}</span>
          `;
          return el;
        },
      },
      {
        field: 'summaryText',
        headerName: 'Zafiyet Özeti',
        flex: 1,
        minWidth: 260,
        sortable: true,
        filter: true,
        cellRenderer: (params) => {
          const text = params.value || '-';
          const el = document.createElement('div');
          el.className = 'flex items-center h-full text-xs text-slate-600 dark:text-slate-300';
          el.innerHTML = `<span class="truncate font-medium" title="${text}">${text}</span>`;
          return el;
        },
      },
      {
        field: 'slaRemainingDays',
        headerName: 'CIS 16.6 SLA Süresi',
        width: 180,
        minWidth: 160,
        sortable: true,
        cellRenderer: (params) => {
          const data = params.data || {};
          const days = data.slaRemainingDays;
          const deadline = data.slaDeadline;
          const isBreached = data.slaIsBreached;
          const isNearBreach = data.slaIsNearBreach;
          const el = document.createElement('div');
          el.className = 'flex items-center h-full gap-1.5 font-mono text-[11px]';
          if (isBreached) {
            el.innerHTML = `
              <svg class="w-3.5 h-3.5 text-rose-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span class="text-rose-600 dark:text-rose-400 font-semibold">SLA Aşıldı (${Math.abs(days)} gün)</span>
            `;
          } else {
            const colorCls = isNearBreach
              ? 'text-amber-600 dark:text-amber-400 font-bold'
              : 'text-slate-600 dark:text-slate-300';
            el.innerHTML = `
              <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <span class="${colorCls}">Kalan: ${days} gün (${deadline})</span>
            `;
          }
          return el;
        },
      },
      {
        field: 'currentStatus',
        headerName: 'Durum',
        width: 130,
        minWidth: 120,
        sortable: true,
        editable: isAdmin,
        cellEditor: 'dexRichSelectEditor',
        cellEditorParams: {
          values: ['OPEN', 'INPROGRESS', 'RISKACCEPTED', 'RESOLVED'],
          formatValue: (val) => {
            const labels = {
              OPEN: 'Açık (Open)',
              INPROGRESS: 'İnceleniyor (In Review)',
              RISKACCEPTED: 'Risk Kabul Edildi',
              RESOLVED: 'Çözüldü (Resolved)',
            };
            return labels[val] || val;
          },
        },
        onCellValueChanged: (params) => {
          if (params.newValue && params.data) {
            handleStatusChange(params.data.id || params.data.advisoryId, params.newValue);
          }
        },
        filter: 'agSetColumnFilter',
        filterParams: {
          values: ['OPEN', 'INPROGRESS', 'RISKACCEPTED', 'RESOLVED'],
          valueFormatter: (params) => {
            const labels = {
              OPEN: 'Açık (Open)',
              INPROGRESS: 'İnceleniyor (In Review)',
              RISKACCEPTED: 'Risk Kabul Edildi',
              RESOLVED: 'Çözüldü (Resolved)',
            };
            return labels[params.value] || params.value;
          },
          suppressSorting: true,
        },
        cellRenderer: (params) => {
          const data = params.data || {};
          const status = (data.currentStatus || 'OPEN').toUpperCase().replace(/[^A-Z]/g, '');
          const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.OPEN;
          const el = document.createElement('div');
          el.className = 'flex items-center h-full';
          el.innerHTML = `
            <span class="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.badgeClass}">
              <span class="w-1.5 h-1.5 rounded-full ${cfg.dotClass}"></span>
              <span>${cfg.shortLabel}</span>
            </span>
          `;
          return el;
        },
      },
    ];
  }, [isAdmin]);

  return (
    <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-5 shadow-xs space-y-4 transition-colors">
      {/* Üst Bilgi, Başlık ve Ana Aksiyonlar (Card Header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/10">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-[#C8102E]" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              CIS 16.6: Zafiyet Önceliklendirme ve Triyaj Matrisi
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Google OSV istihbaratıyla zenginleştirilmiş kurumsal Dex-Grid tablosu. Detaylar ve aksiyonlar için satıra tıklayın.
          </p>
        </div>

        {/* Sağ Taraf: Kompakt Zafiyet Sayacı & Excel İndir */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-nowrap">
          <span className="text-xs font-mono bg-slate-50 dark:bg-[#0B1320] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold shrink-0">
            {activeRiskFilter
              ? `${displayedRows.length} / ${vulnerabilities.length} Zafiyet`
              : `${vulnerabilities.length} Zafiyet`}
          </span>

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer border border-emerald-500/30 shrink-0"
            title="Dex-Grid verilerini Excel (.xlsx) formatında indir"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span>Excel İndir</span>
          </button>
        </div>
      </div>

      {/* Grid Üstü İnce Araç Çubuğu (Sub-Toolbar) */}
      <div className="relative z-30 flex items-center justify-between gap-3 pb-2 pt-0.5 border-b border-slate-100 dark:border-slate-800/60">
        {/* Sol Grup: Tablo Kontrolleri */}
        <div className="flex items-center gap-2 flex-nowrap shrink-0">
          {/* 1. Gruplama Seçeneği */}
          <div className="relative" ref={groupMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowGroupMenu(!showGroupMenu);
                setShowColMenu(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg border border-slate-200/80 dark:border-white/10 transition-colors cursor-pointer shrink-0"
            >
              <Layers className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>
                {groupMode === 'repository'
                  ? 'Grup: Depo'
                  : groupMode === 'severity'
                  ? 'Grup: Önem'
                  : groupMode === 'package'
                  ? 'Grup: Paket'
                  : 'Gruplama'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
            </button>

            {showGroupMenu && (
              <div className="absolute left-0 top-full mt-1.5 w-60 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-1.5 z-50 focus:outline-none text-xs">
                <button
                  type="button"
                  onClick={() => applyGrouping('none')}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'none' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  <span>Düz Liste (Grupsuz)</span>
                  {groupMode === 'none' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => applyGrouping('repository')}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'repository' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  <span className="flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-blue-500" />
                    <span>🌿 Depo / Projeye Göre Grupla</span>
                  </span>
                  {groupMode === 'repository' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => applyGrouping('severity')}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'severity' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  <span>Önem Seviyesine Göre</span>
                  {groupMode === 'severity' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => applyGrouping('package')}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'package' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  <span>Pakete Göre</span>
                  {groupMode === 'package' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                </button>
              </div>
            )}
          </div>

          {/* 2. Sütun Yönetim Butonu */}
          <div className="relative" ref={colMenuRef}>
            <button
              type="button"
              onClick={() => {
                setShowColMenu(!showColMenu);
                setShowGroupMenu(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg border border-slate-200/80 dark:border-white/10 transition-colors cursor-pointer shrink-0"
            >
              <Columns className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <span>Sütunlar</span>
              <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
            </button>

            {showColMenu && (
              <div className="absolute left-0 top-full mt-1.5 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-2 z-50 focus:outline-none text-xs space-y-1">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-0.5">
                  Görünür Sütunlar
                </div>
                {AVAILABLE_COLUMNS.map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-slate-700 dark:text-slate-200 select-none"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns[col.id] !== false}
                      onChange={(e) => toggleColumnVisibility(col.id, e.target.checked)}
                      className="rounded text-blue-600 focus:ring-0 cursor-pointer"
                    />
                    <span>{col.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* 3. Risk Dağılım Grafiği Butonu */}
          <button
            type="button"
            onClick={toggleChart}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer shrink-0 ${
              showChart
                ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-white/10'
            }`}
            title="CIS 16.6 Risk ve SLA Dağılım Grafiğini Göster / Gizle"
          >
            <PieChart className={`w-3.5 h-3.5 shrink-0 ${showChart ? 'text-white' : 'text-blue-500'}`} />
            <span>Risk Grafiği</span>
          </button>
        </div>

        {/* Sağ Grup: Hızlı İpuçları & Görünüm Bilgisi */}
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono shrink-0 select-none">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Sağ tık: Aksiyon Menüsü</span>
          </span>
          <span>•</span>
          <span>Ctrl+C: ID Kopyala</span>
        </div>
      </div>

      {/* CIS 16.6 Risk ve SLA Dağılım Paneli (Collapsible Accordion) */}
      {showChart && vulnerabilities.length > 0 && (
        <div className="bg-slate-50 dark:bg-[#0d1527] border border-slate-200 dark:border-white/10 rounded-xl p-4 transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-200/80 dark:border-white/10 gap-2">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-500 shrink-0" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                CIS 16.6 Risk ve SLA Dağılımı
              </h3>
              {activeRiskFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-700/50">
                  <Filter className="w-3 h-3" />
                  <span>{activeRiskFilter} Filtreli ({displayedRows.length})</span>
                </span>
              )}
            </div>

            {activeRiskFilter && (
              <button
                type="button"
                onClick={() => setActiveRiskFilter(null)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer self-start sm:self-auto"
              >
                <X className="w-3.5 h-3.5" />
                <span>Filtreyi Temizle</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* 1. Sol: İnteraktif Donut Chart */}
            <div className="md:col-span-4 flex items-center justify-center gap-3">
              <div className="relative w-28 h-28 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  {/* Arka plan daire */}
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="10"
                    className="text-slate-200 dark:text-slate-800"
                  />
                  {/* Dilimler */}
                  {donutSegments.map((seg) => {
                    const isSelected = activeRiskFilter === seg.key;
                    return (
                      <circle
                        key={seg.key}
                        cx="50"
                        cy="50"
                        r="38"
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth={isSelected ? 13 : 10}
                        strokeDasharray={seg.strokeDasharray}
                        strokeDashoffset={seg.strokeDashoffset}
                        className="transition-all duration-200 cursor-pointer hover:opacity-85"
                        onClick={() => handleToggleRiskFilter(seg.key)}
                      >
                        <title>{`${seg.label}: ${seg.count} zafiyet (Filtrelemek için tıkla)`}</title>
                      </circle>
                    );
                  })}
                </svg>
                {/* Merkez Sayacı */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-bold text-slate-900 dark:text-white font-mono leading-none">
                    {activeRiskFilter ? displayedRows.length : riskStats.total}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                    {activeRiskFilter ? activeRiskFilter : 'Zafiyet'}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                <p className="font-semibold text-slate-700 dark:text-slate-300">Önem Seviyeleri</p>
                <p className="text-[10px]">Dilime veya karta tıklayarak filtreleyin.</p>
              </div>
            </div>

            {/* 2. Orta: 4 Seviye Kartları (Interactive Legend) */}
            <div className="md:col-span-5 grid grid-cols-2 gap-2">
              {/* Critical */}
              <button
                type="button"
                onClick={() => handleToggleRiskFilter('CRITICAL')}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  activeRiskFilter === 'CRITICAL'
                    ? 'bg-red-500/20 border-red-500 ring-2 ring-red-500/30'
                    : 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-white/10 hover:border-red-400/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    CRITICAL
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">%{riskStats.criticalPct}</span>
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                  {riskStats.critical}
                </div>
              </button>

              {/* High */}
              <button
                type="button"
                onClick={() => handleToggleRiskFilter('HIGH')}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  activeRiskFilter === 'HIGH'
                    ? 'bg-orange-500/20 border-orange-500 ring-2 ring-orange-500/30'
                    : 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-white/10 hover:border-orange-400/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500" />
                    HIGH
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">%{riskStats.highPct}</span>
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                  {riskStats.high}
                </div>
              </button>

              {/* Medium */}
              <button
                type="button"
                onClick={() => handleToggleRiskFilter('MEDIUM')}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  activeRiskFilter === 'MEDIUM'
                    ? 'bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/30'
                    : 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-white/10 hover:border-amber-400/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    MEDIUM
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">%{riskStats.mediumPct}</span>
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                  {riskStats.medium}
                </div>
              </button>

              {/* Low */}
              <button
                type="button"
                onClick={() => handleToggleRiskFilter('LOW')}
                className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                  activeRiskFilter === 'LOW'
                    ? 'bg-blue-500/20 border-blue-500 ring-2 ring-blue-500/30'
                    : 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-white/10 hover:border-blue-400/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    LOW
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">%{riskStats.lowPct}</span>
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                  {riskStats.low}
                </div>
              </button>
            </div>

            {/* 3. Sağ: CIS 16.6 SLA Uyum Özeti */}
            <div className="md:col-span-3 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                CIS 16.6 SLA Durumu
              </div>
              <div className="space-y-1.5 text-xs font-medium">
                <div className="flex items-center justify-between">
                  <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    SLA Aşıldı
                  </span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    {riskStats.breached}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    Kritik Yaklaşan (≤7g)
                  </span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {riskStats.nearBreach}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Hedefte Güvenli
                  </span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    {riskStats.healthy}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dex-Grid Tablosu */}
      {vulnerabilities.length === 0 ? (
        <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-xs border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
          <div className="flex flex-col items-center justify-center space-y-2">
            <CheckCircle className="w-8 h-8 text-emerald-500" />
            <span className="text-emerald-700 dark:text-emerald-400 font-medium text-sm">
              İncelenen depolarda açık bir güvenlik zafiyeti tespit edilmedi.
            </span>
            <span className="text-slate-500 text-xs">Tüm bağımlılıklar kurumsal güvenlik standartlarına uygundur.</span>
          </div>
        </div>
      ) : (
        <DexDataGrid
          apiRef={gridApiRef}
          rowData={displayedRows}
          columnDefs={columnDefs}
          onRowClick={(row) => setSelectedVuln(row._raw || row)}
          pagination={true}
          paginationPageSize={15}
          isDark={isDark}
          gridOptions={{
            cellSelection: false,
            enableRangeSelection: false,
            domLayout: 'autoHeight',
            getContextMenuItems,
          }}
        />
      )}

      {/* Sağdan Açılan Zafiyet Detay Çekmecesi (Slide-Over Drawer) */}
      {selectedVuln && (
        <VulnDetailDrawer
          isOpen={Boolean(selectedVuln)}
          onClose={() => setSelectedVuln(null)}
          vuln={selectedVuln}
          pkg={packageMap.get(selectedVuln.discoveredPackageId)}
          sla={getSlaInfo(
            selectedVuln.severity,
            selectedVuln.firstDetectedAtUtc,
            selectedVuln.slaDueDateUtc,
            selectedVuln.cvssScore ?? selectedVuln.cvss ?? selectedVuln.score
          )}
          isAdmin={isAdmin}
          currentStatus={
            statusOverrides[selectedVuln.id || selectedVuln.advisoryId] || selectedVuln.status || 'OPEN'
          }
          onStatusChange={(newStatus) =>
            handleStatusChange(selectedVuln.id || selectedVuln.advisoryId, newStatus)
          }
        />
      )}
    </div>
  );
}
