import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  GitBranch,
  Eye,
  FileSpreadsheet,
  Layers,
  Columns,
  ChevronDown,
  Check,
  PieChart,
  X,
  Filter,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import DexDataGrid from '../common/DexDataGrid';

/**
 * Format date-time for corporate display (DD.MM.YYYY HH:mm:ss)
 */
function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleString('tr-TR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * Sütun Görünürlük Listesi (Popover için)
 */
const AVAILABLE_COLUMNS = [
  { id: 'fullName', name: 'Depo Adı (Full Name)' },
  { id: 'defaultBranch', name: 'Varsayılan Dal' },
  { id: 'isPrivate', name: 'Gizlilik' },
  { id: 'scanCount', name: 'Toplam Tarama' },
  { id: 'lastScanStatus', name: 'Son Tarama Durumu' },
  { id: 'lastScanAt', name: 'Son Tarama Zamanı' },
];

export default function RepositoriesTable({ repositories = [] }) {
  const { isAdmin } = useAuth();
  const { isDark } = useTheme();

  const gridApiRef = useRef(null);
  const groupMenuRef = useRef(null);
  const colMenuRef = useRef(null);

  // Eylem Çubuğu Durumları
  const [groupMode, setGroupMode] = useState('none'); // 'none' | 'isPrivate' | 'lastScanStatus' | 'defaultBranch'
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showColMenu, setShowColMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    fullName: true,
    defaultBranch: true,
    isPrivate: true,
    scanCount: true,
    lastScanStatus: true,
    lastScanAt: true,
  });

  // Depo Dağılım Grafiği ve Gizlilik Filtreleme
  const [showChart, setShowChart] = useState(false);
  const [activePrivacyFilter, setActivePrivacyFilter] = useState(null); // null | 'Private' | 'Public'

  // Dışarı tıklama ve Escape tuşu ile menü kapatma dinleyicisi
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

  // Dex-Grid için hazırlanmış satır verileri (Row Data)
  const gridRows = useMemo(() => {
    return repositories.map((repo, idx) => {
      const fullName =
        repo.fullName || (repo.owner && repo.name ? `${repo.owner}/${repo.name}` : repo.name || '-');
      const defaultBranch = repo.defaultBranch || 'main';
      const isPrivate = Boolean(repo.isPrivate);
      const privacyLabel = isPrivate ? 'Private' : 'Public';
      const scanCount = repo.totalScansCount ?? repo.scanCount ?? 0;
      const lastScanStatus = repo.lastScanStatus || 'Henüz Taranmadı';
      const lastScanAt = repo.lastScanDateUtc ? formatDateTime(repo.lastScanDateUtc) : '-';
      const remoteUrl =
        repo.remoteUrl ||
        repo.url ||
        (fullName !== '-' ? `https://github.com/${fullName}` : null);

      return {
        id: repo.id || `${fullName}-${idx}`,
        fullName,
        defaultBranch,
        isPrivate,
        privacyLabel,
        scanCount,
        lastScanStatus,
        lastScanAt,
        lastScanSessionId: repo.lastScanSessionId,
        lastCommitSha: repo.lastCommitSha,
        remoteUrl,
        _raw: repo,
      };
    });
  }, [repositories]);

  // Depo ve Tarama İstatistikleri
  const repoStats = useMemo(() => {
    let privateCount = 0;
    let publicCount = 0;
    let completedCount = 0;
    let failedCount = 0;
    let pendingCount = 0;

    gridRows.forEach((r) => {
      if (r.isPrivate) privateCount++;
      else publicCount++;

      const st = (r.lastScanStatus || '').toLowerCase();
      if (st.includes('completed') || st.includes('tamam')) completedCount++;
      else if (st.includes('fail') || st.includes('hata')) failedCount++;
      else pendingCount++;
    });

    const total = gridRows.length;
    return {
      total,
      privateCount,
      publicCount,
      privatePct: total ? Math.round((privateCount / total) * 100) : 0,
      publicPct: total ? Math.round((publicCount / total) * 100) : 0,
      completedCount,
      failedCount,
      pendingCount,
      completedPct: total ? Math.round((completedCount / total) * 100) : 0,
    };
  }, [gridRows]);

  // İnteraktif Donut Grafiği SVG Dilimleri (Gizlilik: Private vs Public)
  const donutSegments = useMemo(() => {
    const C = 238.761; // 2 * PI * 38
    const total = repoStats.total;
    if (total === 0) return [];

    const items = [
      { key: 'Private', label: 'Private', count: repoStats.privateCount, color: '#f59e0b' },
      { key: 'Public', label: 'Public', count: repoStats.publicCount, color: '#10b981' },
    ];

    let currentOffset = 0;
    const segments = [];
    const activeItems = items.filter((s) => s.count > 0);
    for (const item of activeItems) {
      const segLength = (item.count / total) * C;
      segments.push({
        ...item,
        strokeDasharray: `${segLength} ${C - segLength}`,
        strokeDashoffset: -currentOffset,
      });
      currentOffset += segLength;
    }
    return segments;
  }, [repoStats]);

  // Aktif Gizlilik Filtresine göre filtrelenen satırlar
  const displayedRows = useMemo(() => {
    if (!activePrivacyFilter) return gridRows;
    return gridRows.filter((r) => r.privacyLabel === activePrivacyFilter);
  }, [gridRows, activePrivacyFilter]);

  // Gruplama Fonksiyonu (Düz Liste, Gizlilik, Durum, Dal)
  const applyGrouping = useCallback((mode) => {
    setGroupMode(mode);
    setShowGroupMenu(false);
    if (!gridApiRef.current) return;

    if (mode === 'isPrivate') {
      gridApiRef.current.setRowGroupColumns?.(['isPrivate']);
    } else if (mode === 'lastScanStatus') {
      gridApiRef.current.setRowGroupColumns?.(['lastScanStatus']);
    } else if (mode === 'defaultBranch') {
      gridApiRef.current.setRowGroupColumns?.(['defaultBranch']);
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

  // Depo Grafiği Panelini Açma / Kapama
  const toggleChart = useCallback(() => {
    setShowChart((prev) => !prev);
    setTimeout(() => {
      gridApiRef.current?.sizeColumnsToFit?.();
    }, 80);
  }, []);

  // Gizlilik Filtresi Değiştirme
  const handleTogglePrivacyFilter = useCallback((privacyKey) => {
    setActivePrivacyFilter((prev) => (prev === privacyKey ? null : privacyKey));
  }, []);

  // Excel Raporu İndirme Fonksiyonu
  const handleExportExcel = useCallback(() => {
    if (gridApiRef.current?.exportDataAsExcel) {
      gridApiRef.current.exportDataAsExcel({
        fileName: 'GitRadar_Repositories_Report_2026.xlsx',
        sheetName: 'Kaynak Kod Depoları',
        columnKeys: ['fullName', 'defaultBranch', 'isPrivate', 'scanCount', 'lastScanStatus', 'lastScanAt'],
        processCellCallback: ({ value, column }) => {
          const colId = column.getColId();
          if (colId === 'isPrivate') {
            return value ? 'Private' : 'Public';
          }
          return value;
        },
      });
    }
  }, []);

  // Sağ Tık Bağlam Menüsü (Context Menu)
  const getContextMenuItems = useCallback(
    (params) => {
      const data = params.node?.data;
      if (!data) return params.defaultItems;

      const fullName = data.fullName || '';
      const remoteUrl = data.remoteUrl || '';
      const lastScanAt = data.lastScanAt || '';

      return [
        {
          name: 'Depo Adını Kopyala',
          shortcut: 'Ctrl+C',
          icon: '<svg class="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>',
          disabled: !fullName,
          action: () => {
            if (fullName && navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(fullName);
            }
          },
        },
        {
          name: "GitHub URL'sini Kopyala",
          shortcut: 'URL',
          icon: '<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>',
          disabled: !remoteUrl,
          action: () => {
            if (remoteUrl && navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(remoteUrl);
            }
          },
        },
        {
          name: 'Son Tarama Tarihini Kopyala',
          shortcut: 'Tarih',
          icon: '<svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
          disabled: !lastScanAt || lastScanAt === '-',
          action: () => {
            if (lastScanAt && navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(lastScanAt);
            }
          },
        },
        'separator',
        {
          name: 'Bu Duruma Göre Grupla',
          shortcut: 'Durum',
          icon: '<svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>',
          action: () => {
            applyGrouping('lastScanStatus');
          },
        },
        {
          name: 'Gizliliğe Göre Grupla',
          shortcut: 'Gizlilik',
          icon: '<svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>',
          action: () => {
            applyGrouping('isPrivate');
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
          name: showChart ? '📊 Depo Dağılım Grafiğini Gizle' : '📊 Depo Dağılım Grafiğini Göster',
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
    const cols = [
      {
        field: 'fullName',
        headerName: 'Depo Adı (Full Name)',
        flex: 1.5,
        minWidth: 260,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: (params) => {
          const data = params.data || {};
          const name = data.fullName || '-';
          const url = data.remoteUrl;
          const el = document.createElement('div');
          el.className = 'flex items-center h-full space-x-1.5';
          if (url) {
            el.innerHTML = `
              <a href="${url}" target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                <span class="truncate max-w-[200px]" title="${name}">${name}</span>
                <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
              </a>
            `;
            const a = el.querySelector('a');
            if (a) {
              a.addEventListener('click', (e) => e.stopPropagation());
            }
          } else {
            el.innerHTML = `<span class="font-semibold text-slate-900 dark:text-white truncate" title="${name}">${name}</span>`;
          }
          return el;
        },
      },
      {
        field: 'defaultBranch',
        headerName: 'Varsayılan Dal',
        width: 150,
        minWidth: 130,
        sortable: true,
        filter: 'agSetColumnFilter',
        enableRowGroup: true,
        cellRenderer: (params) => {
          const b = params.value || 'main';
          const el = document.createElement('div');
          el.className = 'flex items-center h-full font-mono text-xs';
          el.innerHTML = `
            <span class="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold">
              ${b}
            </span>
          `;
          return el;
        },
      },
      {
        field: 'isPrivate',
        headerName: 'Gizlilik',
        width: 140,
        minWidth: 120,
        sortable: true,
        filter: 'agSetColumnFilter',
        enableRowGroup: true,
        filterValueGetter: (params) => (params.data?.isPrivate ? 'Private' : 'Public'),
        cellRenderer: (params) => {
          const isPriv = params.data?.isPrivate;
          const el = document.createElement('div');
          el.className = 'flex items-center h-full';
          if (isPriv) {
            el.innerHTML = `
              <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40">
                <svg class="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                <span>Private</span>
              </span>
            `;
          } else {
            el.innerHTML = `
              <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40">
                <svg class="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/></svg>
                <span>Public</span>
              </span>
            `;
          }
          return el;
        },
      },
      {
        field: 'scanCount',
        headerName: 'Toplam Tarama',
        width: 150,
        minWidth: 130,
        sortable: true,
        cellRenderer: (params) => {
          const count = params.value ?? 0;
          const el = document.createElement('div');
          el.className = 'flex items-center h-full font-mono text-xs text-slate-700 dark:text-slate-300 font-bold';
          el.innerHTML = `<span>${count}</span>`;
          return el;
        },
      },
      {
        field: 'lastScanStatus',
        headerName: 'Son Tarama Durumu',
        width: 170,
        minWidth: 150,
        sortable: true,
        filter: 'agSetColumnFilter',
        enableRowGroup: true,
        cellRenderer: (params) => {
          const status = params.value;
          const el = document.createElement('div');
          el.className = 'flex items-center h-full';
          if (!status || status === 'Henüz Taranmadı') {
            el.innerHTML = `<span class="text-slate-400 dark:text-slate-500 text-[11px]">Henüz taranmadı</span>`;
          } else if (status === 'Completed') {
            el.innerHTML = `
              <span class="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Completed</span>
              </span>
            `;
          } else if (status === 'Failed') {
            el.innerHTML = `
              <span class="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40">
                <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                <span>Failed</span>
              </span>
            `;
          } else {
            el.innerHTML = `
              <span class="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40">
                <span class="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                <span>${status}</span>
              </span>
            `;
          }
          return el;
        },
      },
      {
        field: 'lastScanAt',
        headerName: 'Son Tarama Zamanı',
        width: 210,
        minWidth: 180,
        sortable: true,
        cellRenderer: (params) => {
          const val = params.value;
          const sessionId = params.data?.lastScanSessionId;
          const commitSha = params.data?.lastCommitSha;
          const shortSha = commitSha ? commitSha.substring(0, 7) : null;
          const el = document.createElement('div');
          el.className = 'flex flex-col justify-center h-full text-slate-500 dark:text-slate-400 text-[11px] font-mono leading-tight py-1';
          if (val && val !== '-') {
            let sessionBadge = '';
            if (sessionId) {
              sessionBadge = `<span class="inline-flex items-center text-[10px] text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.2 rounded border border-blue-200 dark:border-blue-900/40">Oturum #${sessionId}</span>`;
            }
            let shaBadge = '';
            if (shortSha) {
              shaBadge = `<span class="text-[10px] text-slate-400 dark:text-slate-500 font-mono">${shortSha}</span>`;
            }
            el.innerHTML = `
              <div class="flex items-center space-x-1.5">
                <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <span>${val}</span>
              </div>
              ${(sessionBadge || shaBadge) ? `<div class="flex items-center gap-1.5 mt-0.5">${sessionBadge}${shaBadge}</div>` : ''}
            `;
          } else {
            el.innerHTML = `<span>-</span>`;
          }
          return el;
        },
      },
    ];

    return cols;
  }, []);

  return (
    <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-5 shadow-xs space-y-4 transition-colors">
      {/* Üst Bilgi, Başlık ve Ana Aksiyonlar (Card Header) */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/10">
        <div>
          <div className="flex items-center space-x-2">
            <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              Kayıtlı Kaynak Kod Depoları
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Sistemde izlenen kurumsal GitHub depoları ve son tarama durumları.
          </p>
        </div>

        {/* Sağ Taraf: Rol Rozeti & Depo Sayacı & Excel İndir */}
        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start lg:self-auto">
          {isAdmin ? (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-[#C8102E] dark:text-rose-300 text-[11px] font-medium shrink-0">
              <span>Admin Yönetici</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 text-[11px] font-medium shrink-0">
              <Eye className="w-3 h-3" />
              <span>Salt Okunur Görünüm</span>
            </span>
          )}

          {/* Depo Sayacı */}
          <span className="text-xs font-mono bg-slate-50 dark:bg-[#0B1320] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold shrink-0">
            {activePrivacyFilter
              ? `${displayedRows.length} / ${repositories.length} Depo`
              : `Toplam: ${repositories.length} Depo`}
          </span>

          {/* Excel Raporu İndir */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={repositories.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer border border-emerald-500/30 shrink-0 disabled:opacity-40"
            title="Dex-Grid verilerini Excel (.xlsx) formatında indir"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
            <span>Excel Raporu İndir</span>
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
                {groupMode === 'isPrivate'
                  ? 'Grup: Gizlilik'
                  : groupMode === 'lastScanStatus'
                  ? 'Grup: Durum'
                  : groupMode === 'defaultBranch'
                  ? 'Grup: Dal'
                  : 'Gruplama'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
            </button>

            {showGroupMenu && (
              <div className="absolute left-0 top-full mt-1.5 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-1.5 z-50 focus:outline-none text-xs">
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
                  onClick={() => applyGrouping('isPrivate')}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'isPrivate' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  <span>Gizliliğe Göre Grupla</span>
                  {groupMode === 'isPrivate' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => applyGrouping('lastScanStatus')}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'lastScanStatus' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  <span>Son Tarama Durumuna Göre</span>
                  {groupMode === 'lastScanStatus' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
                </button>
                <button
                  type="button"
                  onClick={() => applyGrouping('defaultBranch')}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'defaultBranch' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  <span>Varsayılan Dala Göre Grupla</span>
                  {groupMode === 'defaultBranch' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
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
              <div className="absolute left-0 top-full mt-1.5 w-56 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-2 z-50 focus:outline-none text-xs space-y-1">
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

          {/* 3. Depo Dağılım Grafiği Butonu */}
          <button
            type="button"
            onClick={toggleChart}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer shrink-0 ${
              showChart
                ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-white/10'
            }`}
            title="Depo Gizlilik ve Tarama Dağılım Grafiğini Göster / Gizle"
          >
            <PieChart className={`w-3.5 h-3.5 shrink-0 ${showChart ? 'text-white' : 'text-blue-500'}`} />
            <span>Depo Grafiği</span>
          </button>
        </div>

        {/* Sağ Grup: Hızlı İpuçları & Görünüm Bilgisi */}
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono shrink-0 select-none">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Sağ tık: Aksiyon Menüsü</span>
          </span>
          <span>•</span>
          <span>Ctrl+C: Depo Adı</span>
        </div>
      </div>

      {/* Depo Dağılım ve Tarama Metrikleri Paneli (Collapsible Accordion) */}
      {showChart && repositories.length > 0 && (
        <div className="bg-slate-50 dark:bg-[#0d1527] border border-slate-200 dark:border-white/10 rounded-xl p-4 transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-200/80 dark:border-white/10 gap-2">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-500 shrink-0" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Kayıtlı Depo Dağılımı ve Tarama Metrikleri
              </h3>
              {activePrivacyFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-700/50">
                  <Filter className="w-3 h-3" />
                  <span>{activePrivacyFilter} Filtreli ({displayedRows.length})</span>
                </span>
              )}
            </div>

            {activePrivacyFilter && (
              <button
                type="button"
                onClick={() => setActivePrivacyFilter(null)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 cursor-pointer self-start sm:self-auto"
              >
                <X className="w-3.5 h-3.5" />
                <span>Filtreyi Temizle</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* 1. Sol: İnteraktif Donut Chart (Gizlilik Dağılımı) */}
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
                    const isSelected = activePrivacyFilter === seg.key;
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
                        onClick={() => handleTogglePrivacyFilter(seg.key)}
                      >
                        <title>{`${seg.label}: ${seg.count} depo (Filtrelemek için tıkla)`}</title>
                      </circle>
                    );
                  })}
                </svg>
                {/* Merkez Sayacı */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-bold text-slate-900 dark:text-white font-mono leading-none">
                    {activePrivacyFilter ? displayedRows.length : repoStats.total}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                    {activePrivacyFilter ? activePrivacyFilter : 'Depo'}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                <p className="font-semibold text-slate-700 dark:text-slate-300">Gizlilik Durumu</p>
                <p className="text-[10px]">Dilime veya karta tıklayarak filtreleyin.</p>
              </div>
            </div>

            {/* 2. Orta: Gizlilik Kartları (Interactive Legend) */}
            <div className="md:col-span-4 grid grid-cols-2 gap-2">
              {/* Private */}
              <button
                type="button"
                onClick={() => handleTogglePrivacyFilter('Private')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  activePrivacyFilter === 'Private'
                    ? 'bg-amber-500/20 border-amber-500 ring-2 ring-amber-500/30'
                    : 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-white/10 hover:border-amber-400/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Private
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">%{repoStats.privatePct}</span>
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono mt-1">
                  {repoStats.privateCount}
                </div>
              </button>

              {/* Public */}
              <button
                type="button"
                onClick={() => handleTogglePrivacyFilter('Public')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                  activePrivacyFilter === 'Public'
                    ? 'bg-emerald-500/20 border-emerald-500 ring-2 ring-emerald-500/30'
                    : 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-white/10 hover:border-emerald-400/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Public
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">%{repoStats.publicPct}</span>
                </div>
                <div className="text-base font-bold text-slate-900 dark:text-white font-mono mt-1">
                  {repoStats.publicCount}
                </div>
              </button>
            </div>

            {/* 3. Sağ: Tarama Başarı Oranı & Durum Kartı */}
            <div className="md:col-span-4 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center justify-between">
                <span>Tarama Durumları</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
                  %{repoStats.completedPct} Başarı
                </span>
              </div>
              <div className="space-y-1.5 text-xs font-medium">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Tamamlandı (Completed)
                  </span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    {repoStats.completedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                    Başarısız (Failed)
                  </span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    {repoStats.failedCount}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Bekleyen / Diğer
                  </span>
                  <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                    {repoStats.pendingCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dex-Grid Tablosu */}
      {repositories.length === 0 ? (
        <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-xs border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
          <div className="flex flex-col items-center justify-center space-y-2">
            <GitBranch className="w-8 h-8 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-300 font-medium text-sm">
              Sistemde henüz kayıtlı bir repo bulunamadı.
            </span>
            <span className="text-slate-500 text-xs">
              {isAdmin && '"GitHub\'dan Eşitle" veya "Manuel Depo Tara" butonuna tıklayarak ilk depolarınızı ekleyin.'}
            </span>
          </div>
        </div>
      ) : (
        <DexDataGrid
          apiRef={gridApiRef}
          rowData={displayedRows}
          columnDefs={columnDefs}
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
    </div>
  );
}
