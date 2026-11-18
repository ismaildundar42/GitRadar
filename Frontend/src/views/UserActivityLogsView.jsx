import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  History,
  FileSpreadsheet,
  Search,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { getUserActivities } from '../api/gitRadarApi';
import { useAuth } from '../context/AuthContext';
import DexDataGrid from '../components/common/DexDataGrid';

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
    return String(dateStr);
  }
}

export default function UserActivityLogsView({ onNavigateTab }) {
  const { user, isAdmin } = useAuth();
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActionFilter, setSelectedActionFilter] = useState('ALL');
  const gridApiRef = useRef(null);

  const loadActivities = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getUserActivities(150);
      if (Array.isArray(data)) {
        setActivities(data);
      } else {
        setActivities([]);
      }
    } catch {
      setActivities([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
  }, [loadActivities]);

  // Filtrelenmiş Liste
  const filteredActivities = useMemo(() => {
    let result = activities;
    if (selectedActionFilter !== 'ALL') {
      result = result.filter((a) => a.actionType === selectedActionFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (a) =>
          (a.userName && a.userName.toLowerCase().includes(q)) ||
          (a.actionTitle && a.actionTitle.toLowerCase().includes(q)) ||
          (a.description && a.description.toLowerCase().includes(q)) ||
          (a.targetScope && a.targetScope.toLowerCase().includes(q))
      );
    }
    return result;
  }, [activities, selectedActionFilter, searchTerm]);

  // Excel Raporu İndir
  const handleExportExcel = () => {
    if (gridApiRef.current?.exportDataAsCsv) {
      gridApiRef.current.exportDataAsCsv({
        fileName: 'GitRadar_Kullanici_Hareketleri_Audit.csv',
      });
    }
  };

  // Kolon Tanımları (DexDataGrid)
  const columnDefs = useMemo(() => {
    return [
      {
        headerName: '# Kayıt ID',
        field: 'id',
        width: 100,
        sortable: true,
        filter: true,
        cellRenderer: (p) => `<span class="font-mono text-xs text-slate-500 font-bold">#${p.value}</span>`,
      },
      {
        headerName: 'Yetkili / Kullanıcı',
        field: 'userName',
        width: 200,
        sortable: true,
        filter: true,
        cellRenderer: (p) => {
          const val = p.value || 'Admin';
          return `
            <div class="flex items-center gap-1.5 font-mono text-xs">
              <svg class="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
              <span class="font-semibold text-slate-900 dark:text-white truncate" title="${val}">
                ${val.startsWith('@') ? val : `@${val}`}
              </span>
            </div>
          `;
        },
      },
      {
        headerName: 'Yapılan Hareket',
        field: 'actionTitle',
        width: 230,
        sortable: true,
        filter: true,
        cellRenderer: (p) => {
          const type = (p.data?.actionType || '').toUpperCase();
          const title = p.value || type;

          if (type === 'BATCH_SCAN') {
            return `
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/40 font-sans">
                <span>🚀</span>
                <span>${title}</span>
              </span>
            `;
          }
          if (type === 'SINGLE_SCAN') {
            return `
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/40 font-sans">
                <span>🎯</span>
                <span>${title}</span>
              </span>
            `;
          }
          if (type === 'TOKEN_UPDATE') {
            return `
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40 font-sans">
                <span>🔑</span>
                <span>${title}</span>
              </span>
            `;
          }
          if (type === 'SYNC_REPOS') {
            return `
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40 font-sans">
                <span>🔄</span>
                <span>${title}</span>
              </span>
            `;
          }

          return `
            <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-sans">
              <span>📋</span>
              <span>${title}</span>
            </span>
          `;
        },
      },
      {
        headerName: 'Hedef Kapsam',
        field: 'targetScope',
        width: 220,
        sortable: true,
        filter: true,
        cellRenderer: (p) => {
          const val = p.value || '-';
          const isAll = val.startsWith('Tüm Depolar');
          if (isAll) {
            return `
              <div class="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                <svg class="w-3.5 h-3.5 text-indigo-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                <span class="truncate">${val}</span>
              </div>
            `;
          }
          return `
            <div class="flex items-center gap-1.5 font-mono text-xs text-slate-700 dark:text-slate-300">
              <svg class="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"/></svg>
              <span class="font-semibold text-slate-900 dark:text-white truncate" title="${val}">${val}</span>
            </div>
          `;
        },
      },
      {
        headerName: 'İşlem Detayı / Açıklama',
        field: 'description',
        flex: 1,
        minWidth: 260,
        sortable: true,
        filter: true,
        cellRenderer: (p) => `
          <span class="text-xs text-slate-600 dark:text-slate-300" title="${p.value || ''}">
            ${p.value || '-'}
          </span>
        `,
      },
      {
        headerName: 'Tarih & Saat',
        field: 'timestamp',
        width: 170,
        sortable: true,
        filter: true,
        cellRenderer: (p) => `
          <span class="font-mono text-xs text-slate-700 dark:text-slate-300 font-medium">
            ${formatDateTime(p.value)}
          </span>
        `,
      },
      {
        headerName: 'Durum',
        field: 'status',
        width: 120,
        sortable: true,
        filter: true,
        cellRenderer: (p) => {
          const isSuccess = (p.value || '').toUpperCase() === 'SUCCESS';
          return isSuccess
            ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>BAŞARILI</span>'
            : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/40"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span>HATA</span>';
        },
      },
    ];
  }, []);

  // 403 Güvenlik Bariyeri
  if (!isAdmin && user?.role !== 'Admin') {
    return (
      <div className="min-h-[500px] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-[#111C2E] border border-rose-200 dark:border-rose-900/40 rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/40 flex items-center justify-center text-[#C8102E]">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              HTTP 403 Forbidden
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
              Yetkisiz Erişim / İzin Verilmedi
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Kullanıcı hareketleri ve denetim izi sayfası yalnızca <strong>Admin</strong> yetkisine sahip güvenlik yöneticilerine açıktır.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => onNavigateTab && onNavigateTab('dashboard')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <span>Genel Bakışa Dön</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fadeIn">
      {/* Tablo Paneli */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-5 shadow-xs space-y-4">
        {/* Araç Çubuğu: Filtreler & Arama & Excel */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/10">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Hızlı Filtre Butonları */}
            {[
              { id: 'ALL', label: 'Tüm Hareketler' },
              { id: 'BATCH_SCAN', label: '🚀 Toplu Tarama' },
              { id: 'SINGLE_SCAN', label: '🎯 Tekil Tarama' },
              { id: 'TOKEN_UPDATE', label: '🔑 Token Güncelleme' },
              { id: 'SYNC_REPOS', label: '🔄 Repo Senkron' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedActionFilter(f.id)}
                className={`px-2.5 py-1 text-xs rounded-lg font-medium transition-colors cursor-pointer border ${
                  selectedActionFilter === f.id
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Arama Kutusu */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Yetkili, eylem veya repo ara..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-52"
              />
            </div>

            {/* Excel İndir */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel Raporu İndir</span>
            </button>
          </div>
        </div>

        {/* İçerik: Boş Durum (Empty State) veya DexDataGrid Tablosu */}
        {activities.length === 0 && !isLoading ? (
          <div className="min-h-[360px] flex flex-col items-center justify-center p-8 text-center space-y-3 bg-slate-50/50 dark:bg-slate-900/30 rounded-lg border border-dashed border-slate-200 dark:border-white/10">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 shadow-xs">
              <History className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Henüz bir kullanıcı hareketi kaydedilmedi.
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Sistemde gerçekleştirilen taramalar, token güncellemeleri ve depo eşitlemeleri anlık olarak burada listelenecektir.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full">
            <DexDataGrid
              rowData={filteredActivities}
              columnDefs={columnDefs}
              height="600px"
              pagination={true}
              paginationPageSize={15}
              onGridReady={(params) => {
                gridApiRef.current = params.api;
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
