import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  Boxes,
  Check,
  ChevronDown,
  Columns,
  FileSpreadsheet,
  Layers,
  PieChart,
  X,
  Filter,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import DexDataGrid from '../common/DexDataGrid';

/**
 * CIS 16.4 Görünür Sütun Listesi (Sütun Yönetimi Popover için)
 */
const AVAILABLE_COLUMNS = [
  { id: 'packageName', name: 'Paket Adı' },
  { id: 'projectName', name: 'Depo / Proje' },
  { id: 'version', name: 'Tespit Edilen Sürüm' },
  { id: 'manifestPath', name: 'Manifest Dosyası' },
];

export default function SbomTable({ packages = [], scanInfo, _repositories = [] }) {
  const { isDark } = useTheme();

  const gridApiRef = useRef(null);
  const groupMenuRef = useRef(null);
  const colMenuRef = useRef(null);

  // Eylem Çubuğu Durumları
  const [groupMode, setGroupMode] = useState('none'); // 'none' | 'projectName'
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showColMenu, setShowColMenu] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState({
    packageName: true,
    projectName: true,
    version: true,
    manifestPath: true,
  });

  // Ekosistem Dağılım Grafiği ve Filtreleme
  const [showChart, setShowChart] = useState(false);
  const [activeEcoFilter, setActiveEcoFilter] = useState(null);

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
    return packages.map((pkg, idx) => {
      const pkgName = pkg.packageName || '-';
      const version = pkg.packageVersion || '-';
      const ecosystem = (pkg.ecosystem || 'NuGet').trim();
      const isDirect = Boolean(pkg.directDependency);
      const relationType = isDirect ? 'Doğrudan (Direct)' : 'Geçişli (Transitive)';
      const scope = pkg.scope || 'Production';
      const projectName = pkg.repositoryName || pkg.repository || 'Global';
      const manifestPath = pkg.manifestRelativePath || '-';
      const packageUrl =
        pkg.packageUrl ||
        (ecosystem.toLowerCase() === 'nuget'
          ? `https://www.nuget.org/packages/${pkgName}/${version}`
          : ecosystem.toLowerCase() === 'npm'
          ? `https://www.npmjs.com/package/${pkgName}/v/${version}`
          : null);

      return {
        id: pkg.id || `${projectName}-${pkgName}-${version}-${idx}`,
        packageName: pkgName,
        version,
        ecosystem,
        isDirect,
        relationType,
        scope,
        projectName,
        manifestPath,
        packageUrl,
        _raw: pkg,
      };
    });
  }, [packages]);

  // Ekosistem ve Bağımlılık Dağılım İstatistikleri
  const ecoStats = useMemo(() => {
    const counts = {};
    let direct = 0;
    let transitive = 0;

    gridRows.forEach((r) => {
      const eco = r.ecosystem || 'NuGet';
      counts[eco] = (counts[eco] || 0) + 1;
      if (r.isDirect) direct++;
      else transitive++;
    });

    const total = gridRows.length;
    const ecosystemsList = Object.keys(counts).map((eco) => ({
      key: eco,
      label: eco,
      count: counts[eco],
      percentage: total ? Math.round((counts[eco] / total) * 100) : 0,
      color:
        eco.toLowerCase() === 'nuget' || eco.toLowerCase() === '.net'
          ? '#a855f7'
          : eco.toLowerCase() === 'npm'
          ? '#f43f5e'
          : eco.toLowerCase() === 'pypi' || eco.toLowerCase() === 'python'
          ? '#0ea5e9'
          : '#64748b',
    }));

    return {
      total,
      direct,
      transitive,
      directPct: total ? Math.round((direct / total) * 100) : 0,
      transitivePct: total ? Math.round((transitive / total) * 100) : 0,
      ecosystemsList,
    };
  }, [gridRows]);

  // İnteraktif Donut Grafiği SVG Dilimleri
  const donutSegments = useMemo(() => {
    const C = 238.761; // 2 * PI * 38
    const total = ecoStats.total;
    if (total === 0) return [];

    let currentOffset = 0;
    const segments = [];
    const activeList = ecoStats.ecosystemsList.filter((s) => s.count > 0);
    for (const seg of activeList) {
      const segLength = (seg.count / total) * C;
      segments.push({
        ...seg,
        strokeDasharray: `${segLength} ${C - segLength}`,
        strokeDashoffset: -currentOffset,
      });
      currentOffset += segLength;
    }
    return segments;
  }, [ecoStats]);

  // Aktif Ekosistem Filtresine göre filtrelenen satırlar
  const displayedRows = useMemo(() => {
    if (!activeEcoFilter) return gridRows;
    return gridRows.filter((r) => r.ecosystem === activeEcoFilter);
  }, [gridRows, activeEcoFilter]);

  // Gruplama Fonksiyonu (Düz Liste, Proje, Ekosistem, İlişki Türü)
  const applyGrouping = useCallback((mode) => {
    setGroupMode(mode);
    setShowGroupMenu(false);
    if (!gridApiRef.current) return;

    if (mode === 'projectName') {
      gridApiRef.current.setRowGroupColumns?.(['projectName']);
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

  // Ekosistem Grafiği Panelini Açma / Kapama
  const toggleChart = useCallback(() => {
    setShowChart((prev) => !prev);
    setTimeout(() => {
      gridApiRef.current?.sizeColumnsToFit?.();
    }, 80);
  }, []);

  // Ekosistem Filtresi Değiştirme
  const handleToggleEcoFilter = useCallback((ecoKey) => {
    setActiveEcoFilter((prev) => (prev === ecoKey ? null : ecoKey));
  }, []);

  // Excel Raporu İndirme Fonksiyonu
  const handleExportExcel = useCallback(() => {
    if (gridApiRef.current?.exportDataAsExcel) {
      gridApiRef.current.exportDataAsExcel({
        fileName: 'GitRadar_CIS16.4_SBOM_Report_2026.xlsx',
        sheetName: 'CIS 16.4 SBOM Envanteri',
        columnKeys: [
          'packageName',
          'projectName',
          'version',
          'ecosystem',
          'relationType',
          'scope',
          'manifestPath',
        ],
      });
    }
  }, []);

  // Sağ Tık Bağlam Menüsü (Context Menu)
  const getContextMenuItems = useCallback(
    (params) => {
      const data = params.node?.data;
      if (!data) return params.defaultItems;

      const pkgName = data.packageName || '';
      const version = data.version || '';
      const manifestPath = data.manifestPath || '';

      return [
        {
          name: 'Paket Adını Kopyala',
          shortcut: 'Ctrl+C',
          icon: '<svg class="w-4 h-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>',
          disabled: !pkgName,
          action: () => {
            if (pkgName && navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(pkgName);
            }
          },
        },
        {
          name: 'Sürüm Bilgisini Kopyala',
          shortcut: 'Sürüm',
          icon: '<svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h10M7 11h10M7 15h6"/></svg>',
          disabled: !version,
          action: () => {
            if (version && navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(version);
            }
          },
        },
        {
          name: 'Manifest Yolunu Kopyala',
          shortcut: 'Yol',
          icon: '<svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>',
          disabled: !manifestPath,
          action: () => {
            if (manifestPath && navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(manifestPath);
            }
          },
        },
        'separator',
        {
          name: 'Bu Depoya Göre Grupla',
          shortcut: 'Proje',
          icon: '<svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>',
          action: () => {
            applyGrouping('projectName');
          },
        },
        {
          name: 'Excel Olarak Dışa Aktar',
          shortcut: '.xlsx',
          icon: '<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
          action: () => {
            handleExportExcel();
          },
        },
        'separator',
        {
          name: showChart ? '📊 Ekosistem Grafiğini Gizle' : '📊 Ekosistem Grafiğini Göster',
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
        field: 'packageName',
        headerName: 'Paket Adı',
        width: 230,
        minWidth: 200,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: (params) => {
          const data = params.data || {};
          const name = data.packageName || '-';
          const url = data.packageUrl;
          const el = document.createElement('div');
          el.className = 'flex items-center h-full';
          if (url) {
            el.innerHTML = `
              <a href="${url}" target="_blank" rel="noreferrer" class="inline-flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                <span class="truncate max-w-[170px]" title="${name}">${name}</span>
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
        field: 'projectName',
        headerName: 'Depo / Proje',
        width: 190,
        minWidth: 160,
        sortable: true,
        enableRowGroup: true,
        filter: 'agSetColumnFilter',
        cellRenderer: (params) => {
          const name = params.value || 'Global';
          const el = document.createElement('div');
          el.className = 'flex items-center h-full';
          el.innerHTML = `
            <span class="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-300">
              <svg class="w-3 h-3 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/></svg>
              <span class="truncate max-w-[130px]" title="${name}">${name}</span>
            </span>
          `;
          return el;
        },
      },
      {
        field: 'version',
        headerName: 'Tespit Edilen Sürüm',
        width: 140,
        minWidth: 120,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: (params) => {
          const v = params.value || '-';
          const el = document.createElement('div');
          el.className = 'flex items-center h-full font-mono';
          el.innerHTML = `
            <span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-800 dark:text-slate-200">
              ${v}
            </span>
          `;
          return el;
        },
      },
      {
        field: 'manifestPath',
        headerName: 'Manifest Dosyası',
        flex: 1,
        minWidth: 260,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: (params) => {
          const path = params.value || '-';
          const el = document.createElement('div');
          el.className = 'flex items-center h-full text-xs font-mono text-slate-500 dark:text-slate-400 truncate';
          el.innerHTML = `
            <div class="flex items-center space-x-1.5 truncate max-w-full" title="${path}">
              <svg class="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
              <span class="truncate">${path}</span>
            </div>
          `;
          return el;
        },
      },
    ];
  }, []);

  return (
    <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-5 shadow-xs space-y-4 transition-colors">
      {/* Üst Bilgi, Başlık ve Ana Aksiyonlar (Card Header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/10">
        <div>
          <div className="flex items-center space-x-2">
            <Boxes className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              CIS 16.4: Yazılım Bileşen Envanteri (SBOM)
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Üçüncü parti kütüphanelerin değişmez (immutable) kurumsal denetim kaydı.
            {scanInfo?.commitSha ? (
              <span className="font-mono text-slate-600 dark:text-slate-300 ml-1.5 font-medium">
                (Son Commit: {scanInfo.commitSha.slice(0, 8)})
              </span>
            ) : null}
          </p>
        </div>

        {/* Sağ Taraf: Kompakt Bileşen Sayacı & Excel İndir */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto flex-nowrap">
          <span className="text-xs font-mono bg-slate-50 dark:bg-[#0B1320] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold shrink-0">
            {activeEcoFilter
              ? `${displayedRows.length} / ${packages.length} Bileşen`
              : `${packages.length} / ${packages.length} Bileşen`}
          </span>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={packages.length === 0}
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
                {groupMode === 'projectName'
                  ? 'Grup: Proje'
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
                  onClick={() => applyGrouping('projectName')}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'projectName' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  <span>Depo / Projeye Göre Grupla</span>
                  {groupMode === 'projectName' && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
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

          {/* 3. Bileşen Grafiği Butonu */}
          <button
            type="button"
            onClick={toggleChart}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer shrink-0 ${
              showChart
                ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200/80 dark:border-white/10'
            }`}
            title="CIS 16.4 Ekosistem ve Bağımlılık Dağılım Grafiğini Göster / Gizle"
          >
            <PieChart className={`w-3.5 h-3.5 shrink-0 ${showChart ? 'text-white' : 'text-blue-500'}`} />
            <span>Ekosistem Grafiği</span>
          </button>
        </div>

        {/* Sağ Grup: Hızlı İpuçları & Görünüm Bilgisi */}
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500 font-mono shrink-0 select-none">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span>Sağ tık: Aksiyon Menüsü</span>
          </span>
          <span>•</span>
          <span>Ctrl+C: Paket Adı</span>
        </div>
      </div>

      {/* CIS 16.4 Ekosistem ve Bağımlılık Dağılım Paneli (Collapsible Accordion) */}
      {showChart && packages.length > 0 && (
        <div className="bg-slate-50 dark:bg-[#0d1527] border border-slate-200 dark:border-white/10 rounded-xl p-4 transition-all duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-3 border-b border-slate-200/80 dark:border-white/10 gap-2">
            <div className="flex items-center gap-2">
              <PieChart className="w-4 h-4 text-blue-500 shrink-0" />
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                CIS 16.4 Ekosistem &amp; Bağımlılık Dağılımı
              </h3>
              {activeEcoFilter && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-300 dark:border-blue-700/50">
                  <Filter className="w-3 h-3" />
                  <span>{activeEcoFilter} Filtreli ({displayedRows.length})</span>
                </span>
              )}
            </div>

            {activeEcoFilter && (
              <button
                type="button"
                onClick={() => setActiveEcoFilter(null)}
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
                    const isSelected = activeEcoFilter === seg.key;
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
                        onClick={() => handleToggleEcoFilter(seg.key)}
                      >
                        <title>{`${seg.label}: ${seg.count} bileşen (Filtrelemek için tıkla)`}</title>
                      </circle>
                    );
                  })}
                </svg>
                {/* Merkez Sayacı */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-base font-bold text-slate-900 dark:text-white font-mono leading-none">
                    {activeEcoFilter ? displayedRows.length : ecoStats.total}
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                    {activeEcoFilter ? activeEcoFilter : 'Bileşen'}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                <p className="font-semibold text-slate-700 dark:text-slate-300">Ekosistemler</p>
                <p className="text-[10px]">Dilime veya karta tıklayarak filtreleyin.</p>
              </div>
            </div>

            {/* 2. Orta: Ekosistem Kartları (Interactive Legend) */}
            <div className="md:col-span-5 grid grid-cols-2 gap-2">
              {ecoStats.ecosystemsList.map((eco) => {
                const isSelected = activeEcoFilter === eco.key;
                return (
                  <button
                    key={eco.key}
                    type="button"
                    onClick={() => handleToggleEcoFilter(eco.key)}
                    className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-purple-500/20 border-purple-500 ring-2 ring-purple-500/30'
                        : 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-white/10 hover:border-purple-400/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: eco.color }} />
                        {eco.label}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">%{eco.percentage}</span>
                    </div>
                    <div className="text-base font-bold text-slate-900 dark:text-white font-mono mt-0.5">
                      {eco.count}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 3. Sağ: İlişki Türü (Doğrudan vs Geçişli) Özeti */}
            <div className="md:col-span-3 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Bağımlılık Türü
              </div>
              <div className="space-y-1.5 text-xs font-medium">
                <div className="flex items-center justify-between">
                  <span className="text-emerald-700 dark:text-emerald-400 flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Doğrudan (Direct)
                  </span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    {ecoStats.direct} (%{ecoStats.directPct})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400 flex items-center gap-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                    Geçişli (Transitive)
                  </span>
                  <span className="font-mono font-bold text-slate-600 dark:text-slate-400">
                    {ecoStats.transitive} (%{ecoStats.transitivePct})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dex-Grid Tablosu */}
      {packages.length === 0 ? (
        <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-xs border border-dashed border-slate-200 dark:border-white/10 rounded-xl">
          <div className="flex flex-col items-center justify-center space-y-2">
            <Boxes className="w-8 h-8 text-slate-400" />
            <span className="text-slate-700 dark:text-slate-300 font-medium text-sm">
              Henüz bir SBOM bileşeni tespit edilmedi.
            </span>
            <span className="text-slate-500 text-xs">Yeni bir tarama başlatarak bağımlılık envanterini çıkartın.</span>
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
