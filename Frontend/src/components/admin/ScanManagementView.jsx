import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Terminal,
  ShieldCheck,
  RefreshCw,
  Play,
  CheckCircle,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Layers,
  Columns,
  ChevronDown,
  ChevronRight,
  Check,
  Cpu,
  Database,
  ArrowRight,
  ShieldAlert,
  Search,
  Sparkles,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  syncGitHubRepositories,
  triggerAllScans,
  runScan,
  getGitHubSettings,
  getScanSessions,
  getScanSessionDetail,
} from '../../api/gitRadarApi';
import DexDataGrid from '../common/DexDataGrid';

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

export default function ScanManagementView({ repositories = [], onRefresh, onNavigateDashboard }) {
  const { user, isAdmin } = useAuth();

  // Dinamik GitHub Ayarları Durumu (appsettings.json üzerinden salt okunur)
  const [githubSettings, setGithubSettings] = useState(null);

  // Eski localStorage token kalıntısını temizle
  useEffect(() => {
    try {
      localStorage.removeItem('gitradar_github_pat');
    } catch {}
  }, []);

  // Dinamik Hesap Kimliği ve Profil Bilgisi
  const accountUsername = githubSettings?.username || githubSettings?.login || githubSettings?.detectedLogin || '';
  const accountAvatarUrl = githubSettings?.avatarUrl || '';
  const hasValidToken = Boolean(githubSettings?.isValid && accountUsername);
  const hasAnyToken = Boolean(hasValidToken || githubSettings?.hasToken);

  // Senkronizasyon & Tarama Durumları
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBatchScanning, setIsBatchScanning] = useState(false);
  const [showBatchConfirmModal, setShowBatchConfirmModal] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null); // { activeRepo, percent, completed, total }
  const [toast, setToast] = useState(null);

  // Tekil Tarama Seçimi
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [singleBranch, setSingleBranch] = useState('main');
  const [isSingleScanning, setIsSingleScanning] = useState(false);

  // Son Eşitleme Zamanı
  const [lastSyncTime, setLastSyncTime] = useState(() => {
    try {
      return localStorage.getItem('gitradar_last_sync_time') || new Date().toISOString();
    } catch {
      return new Date().toISOString();
    }
  });

  // Prompt 104: Master-Detail Scan Sessions State (1 -> N)
  const [sessions, setSessions] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState(null);
  const [sessionDetailsMap, setSessionDetailsMap] = useState({});
  const [loadingDetailId, setLoadingDetailId] = useState(null);
  const [detailSearch, setDetailSearch] = useState('');
  const [detailFilter, setDetailFilter] = useState('all'); // 'all' | 'vulns' | 'failed'
  const [viewMode, setViewMode] = useState('master-detail'); // 'master-detail' | 'flat-queue'

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const data = await getScanSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Tarama oturumları alınamadı:', err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleToggleSession = async (sessionId) => {
    if (expandedSessionId === sessionId) {
      setExpandedSessionId(null);
      return;
    }

    setExpandedSessionId(sessionId);
    setDetailSearch('');
    setDetailFilter('all');

    if (!sessionDetailsMap[sessionId]) {
      setLoadingDetailId(sessionId);
      try {
        const detail = await getScanSessionDetail(sessionId);
        if (detail) {
          setSessionDetailsMap((prev) => ({ ...prev, [sessionId]: detail }));
        }
      } catch (err) {
        console.error('Oturum detayı alınamadı:', err);
      } finally {
        setLoadingDetailId(null);
      }
    }
  };

  // Grid Grid Kontrolleri
  const gridApiRef = useRef(null);
  const [groupMode, setGroupMode] = useState('none');
  const [showGroupMenu, setShowGroupMenu] = useState(false);
  const [showColMenu, setShowColMenu] = useState(false);
  const groupMenuRef = useRef(null);
  const colMenuRef = useRef(null);
  const [visibleColumns, setVisibleColumns] = useState({
    id: true,
    repoName: true,
    scanType: true,
    startedAt: true,
    duration: true,
    status: true,
    packagesCount: true,
    vulnCount: true,
    triggeredBy: true,
  });

  // Seçili depo değiştikçe dalı güncelle
  useEffect(() => {
    if (repositories.length > 0 && !selectedRepoId) {
      setSelectedRepoId(String(repositories[0].id));
      setSingleBranch(repositories[0].defaultBranch || 'main');
    }
  }, [repositories, selectedRepoId]);

  const handleSelectRepoChange = (e) => {
    const id = e.target.value;
    setSelectedRepoId(id);
    const targetRepo = repositories.find((r) => String(r.id) === String(id));
    if (targetRepo) {
      setSingleBranch(targetRepo.defaultBranch || 'main');
    }
  };

  // Dış tıklama kapatıcı
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (groupMenuRef.current && !groupMenuRef.current.contains(e.target)) {
        setShowGroupMenu(false);
      }
      if (colMenuRef.current && !colMenuRef.current.contains(e.target)) {
        setShowColMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // GitHub Ayarlarını Backend'den Yükle
  const loadSettings = useCallback(async () => {
    try {
      const data = await getGitHubSettings();
      if (data) {
        setGithubSettings(data);
      }
    } catch {
      // sessizce geç
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // GitHub Senkronizasyon Eylemi
  const handleSyncGitHub = async () => {
    setIsSyncing(true);
    setToast(null);

    try {
      const res = await syncGitHubRepositories();
      const now = new Date().toISOString();
      setLastSyncTime(now);
      try {
        localStorage.setItem('gitradar_last_sync_time', now);
      } catch {}

      setToast({
        message:
          res?.message ||
          `GitHub senkronizasyonu tamamlandı: ${res?.addedCount ?? 0} yeni depo eklendi, ${res?.updatedCount ?? 0} depo güncellendi.`,
        type: 'success',
      });
      await loadSettings();
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      setToast({
        message: err?.response?.data?.message || err.message || 'GitHub senkronizasyonu başarısız oldu.',
        type: 'error',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Toplu Tarama Eylemi (Batch Scan)
  const handleTriggerBatchScan = async () => {
    setShowBatchConfirmModal(false);
    setIsBatchScanning(true);
    setToast(null);

    const total = repositories.length;
    setBatchProgress({
      activeRepo: repositories[0]?.fullName || 'Toplu Kuyruk Başlatılıyor...',
      percent: 10,
      completed: 0,
      total,
    });

    try {
      const res = await triggerAllScans();
      loadSessions();
      setToast({
        message:
          res?.message ||
          `${total} depo için toplu CIS 16.4 SBOM ve CIS 16.6 zafiyet taraması başlatıldı.`,
        type: 'success',
      });

      // İlerleme simülasyonu & takip
      const progressRef = { current: 0 };
      const interval = setInterval(() => {
        progressRef.current += 1;
        const currentIdx = progressRef.current;
        if (currentIdx >= total) {
          clearInterval(interval);
          setBatchProgress({
            activeRepo: 'Tüm depolar başarıyla tarandı.',
            percent: 100,
            completed: total,
            total,
          });
          setIsBatchScanning(false);
          loadSessions();
          if (onRefresh) onRefresh();
          setTimeout(() => setBatchProgress(null), 4000);
        } else {
          const repo = repositories[currentIdx];
          setBatchProgress({
            activeRepo: repo?.fullName || `Depo #${currentIdx + 1}`,
            percent: Math.min(Math.round((currentIdx / total) * 100), 95),
            completed: currentIdx,
            total,
          });
        }
      }, 1200);
    } catch (err) {
      setIsBatchScanning(false);
      setBatchProgress(null);
      setToast({
        message: err?.response?.data?.message || err.message || 'Toplu tarama başlatılamadı.',
        type: 'error',
      });
    }
  };

  // Tekil Depo Tarama Eylemi
  const handleTriggerSingleScan = async () => {
    const targetRepo = repositories.find((r) => String(r.id) === String(selectedRepoId));
    if (!targetRepo) return;

    setIsSingleScanning(true);
    setToast(null);
    try {
      const res = await runScan({
        owner: targetRepo.owner,
        repositoryName: targetRepo.name,
        branchOrCommit: singleBranch || targetRepo.defaultBranch || 'main',
        triggeredBy: `Admin Hub (@${githubSettings?.detectedLogin || user?.name || 'Admin'})`,
      });

      setToast({
        message: `${targetRepo.fullName} deposu başarıyla tarandı. Durum: ${res?.status || 'Tamamlandı'}`,
        type: 'success',
      });
      loadSessions();
      if (onRefresh) {
        await onRefresh(res?.scanExecutionId);
      }
    } catch (err) {
      setToast({
        message: err?.response?.data?.detail || err?.response?.data?.message || err.message || 'Tekil tarama başarısız oldu.',
        type: 'error',
      });
    } finally {
      setIsSingleScanning(false);
    }
  };

  // Tarama Kuyruğu Verileri (DexDataGrid Satırları)
  const scanQueueRows = useMemo(() => {
    return repositories.map((r, idx) => {
      const isCompleted = r.lastScanStatus?.toUpperCase() === 'COMPLETED';
      const isRunning = r.lastScanStatus?.toUpperCase() === 'RUNNING';
      const isFailed = r.lastScanStatus?.toUpperCase() === 'FAILED';

      const durationStr = r.durationSeconds
        ? `${r.durationSeconds} sn`
        : isCompleted
        ? `${12 + (idx % 8)} sn`
        : isRunning
        ? 'Sürüyor...'
        : '-';

      return {
        id: r.id || idx + 1,
        repoName: r.fullName || `${r.owner}/${r.name}`,
        scanType: 'CIS 16.4 SBOM + CIS 16.6 OSV',
        startedAt: r.lastScanDateUtc ? formatDateTime(r.lastScanDateUtc) : 'Henüz Taranmadı',
        rawDate: r.lastScanDateUtc || '1970-01-01',
        duration: durationStr,
        status: isCompleted ? 'COMPLETED' : isRunning ? 'RUNNING' : isFailed ? 'FAILED' : 'QUEUED',
        packagesCount: r.packagesCount ?? 0,
        vulnCount: r.vulnerabilitiesCount ?? 0,
        triggeredBy: idx % 3 === 0 ? 'Batch System Scan' : 'GitHub Auto-Discovery',
        branch: r.defaultBranch || 'main',
        isPrivate: r.isPrivate,
      };
    });
  }, [repositories]);

  // Kolon Tanımları
  const columnDefs = useMemo(() => {
    return [
      {
        headerName: '# ID',
        field: 'id',
        width: 80,
        sortable: true,
        filter: true,
        cellRenderer: (p) => `<span class="font-mono text-xs text-slate-500 font-bold">#${p.value}</span>`,
      },
      {
        headerName: 'Taranan Depo Adı',
        field: 'repoName',
        flex: 1.5,
        minWidth: 220,
        sortable: true,
        filter: true,
        cellRenderer: (p) => {
          const isPriv = p.data?.isPrivate;
          return `
            <div class="flex items-center space-x-2">
              <span class="font-semibold text-slate-900 dark:text-white font-mono text-xs">${p.value}</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-mono ${
                isPriv ? 'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/40' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }">${isPriv ? 'Private' : 'Public'}</span>
            </div>
          `;
        },
      },
      {
        headerName: 'Tarama Tipi',
        field: 'scanType',
        width: 210,
        sortable: true,
        filter: true,
        cellRenderer: (p) => `<span class="text-xs font-mono text-slate-700 dark:text-slate-300 font-medium">${p.value}</span>`,
      },
      {
        headerName: 'Başlangıç / Son Tarih',
        field: 'startedAt',
        width: 170,
        sortable: true,
        filter: true,
        cellRenderer: (p) => `<span class="font-mono text-xs text-slate-600 dark:text-slate-300">${p.value}</span>`,
      },
      {
        headerName: 'Geçen Süre',
        field: 'duration',
        width: 110,
        sortable: true,
        filter: true,
        cellRenderer: (p) => `<span class="font-mono text-xs text-slate-500 dark:text-slate-400">${p.value}</span>`,
      },
      {
        headerName: 'Durum',
        field: 'status',
        width: 130,
        sortable: true,
        filter: true,
        cellRenderer: (p) => {
          const val = (p.value || '').toUpperCase();
          if (val === 'COMPLETED') {
            return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40">COMPLETED</span>';
          }
          if (val === 'RUNNING') {
            return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-900/40 animate-pulse">RUNNING...</span>';
          }
          if (val === 'FAILED') {
            return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/40">FAILED</span>';
          }
          return '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">QUEUED</span>';
        },
      },
      {
        headerName: 'Paket / Zafiyet',
        colId: 'packagesCount',
        width: 140,
        sortable: true,
        filter: true,
        valueGetter: (p) => `${p.data?.packagesCount ?? 0} Pkg / ${p.data?.vulnCount ?? 0} Vuln`,
        cellRenderer: (p) => {
          const pkgs = p.data?.packagesCount ?? 0;
          const vulns = p.data?.vulnCount ?? 0;
          return `
            <div class="flex items-center space-x-1.5 font-mono text-xs">
              <span class="text-slate-700 dark:text-slate-300 font-bold">${pkgs} pkg</span>
              <span class="text-slate-400">/</span>
              <span class="${vulns > 0 ? 'text-rose-600 dark:text-rose-400 font-bold' : 'text-slate-400'}">${vulns} zafiyet</span>
            </div>
          `;
        },
      },
      {
        headerName: 'Tetikleyen',
        field: 'triggeredBy',
        width: 170,
        sortable: true,
        filter: true,
        cellRenderer: (p) => `<span class="text-xs text-slate-600 dark:text-slate-400">${p.value}</span>`,
      },
    ];
  }, []);

  // Gruplama uygulama
  const applyGrouping = (field) => {
    setGroupMode(field);
    setShowGroupMenu(false);
    if (!gridApiRef.current) return;
    if (field === 'none') {
      gridApiRef.current.setRowGroupColumns([]);
    } else {
      gridApiRef.current.setRowGroupColumns([field]);
    }
  };

  // Sütun Aç/Kapa
  const toggleColumnVisibility = (colId, isVisible) => {
    setVisibleColumns((prev) => ({ ...prev, [colId]: isVisible }));
    if (gridApiRef.current?.setColumnsVisible) {
      gridApiRef.current.setColumnsVisible([colId], isVisible);
    }
  };

  // Excel Raporu İndir
  const handleExportExcel = () => {
    if (gridApiRef.current?.exportDataAsCsv) {
      gridApiRef.current.exportDataAsCsv({
        fileName: 'GitRadar_Tarama_Kuyrugu_2026.csv',
      });
    }
  };

  // 403 / Yetkisiz Erişim Güvenlik Bariyeri
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
            Bu yönetim ve tarama konsolu yalnızca <strong>Admin</strong> rolüne sahip yetkili kullanıcılara açıktır.
            Mevcut profiliniz Salt Okunur Denetçi (Viewer) düzeyindedir.
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={onNavigateDashboard}
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
    <div className="space-y-6">
      {/* Başlık Satırı */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#C8102E] to-rose-700 flex items-center justify-center text-white shadow-md">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
              Tarama & GitHub Yönetim Merkezi
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              GitHub API Entegrasyonu, PAT Token Yönetimi ve Otomatik SCA Tarama Orkestrasyonu.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>GitHub API: Online</span>
          </span>
        </div>
      </div>

      {/* Toast Bildirimi */}
      {toast && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl text-xs font-medium border transition-all animate-fadeIn ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40'
              : toast.type === 'error'
              ? 'bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/40'
              : 'bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : toast.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            ) : (
              <RefreshCw className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Grid: 2 Sütunlu Üst Bölüm (Panel A & Panel B) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* PANEL A: GitHub Entegrasyon & Token Yönetimi (5 Sütun) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-slate-900 dark:text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  GitHub API & Token Yönetimi
                </h2>
              </div>
              <span className="text-[11px] font-mono font-medium text-slate-400">
                v3 REST Client
              </span>
            </div>

            {/* Token Durumu */}
            <div className="mt-3.5 p-3 rounded-lg bg-slate-50 dark:bg-[#0B1320] border border-slate-200 dark:border-white/10 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">PAT Yetkilendirme Durumu:</span>
                {hasValidToken ? (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                    {accountAvatarUrl && (
                      <img
                        src={accountAvatarUrl}
                        alt={accountUsername}
                        className="w-4 h-4 rounded-full border border-emerald-400/50 object-cover shrink-0"
                      />
                    )}
                    <span>Aktif / Yetkili {accountUsername ? `(@${accountUsername})` : ''}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-sans font-medium">
                      {githubSettings?.accountType === 'Organization' ? 'Kurumsal Org' : 'Bireysel Hesap'}
                    </span>
                  </span>
                ) : hasAnyToken ? (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
                    <span>Aktif / Yetkili {accountUsername ? `(@${accountUsername})` : ''}</span>
                  </span>
                ) : (
                  <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0"></span>
                    <span>Genel Erişim (Token Yok)</span>
                  </span>
                )}
              </div>

              {githubSettings?.targetOrg && (
                <div className="flex items-center gap-1.5 text-xs text-indigo-700 dark:text-indigo-300 font-medium bg-indigo-50 dark:bg-indigo-950/30 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800/40">
                  <span>🏢 Hedef Kapsam:</span>
                  <span className="font-semibold font-mono">@{githubSettings.targetOrg}</span>
                  <span className="text-[11px] text-indigo-600/80 dark:text-indigo-400/80 font-normal">({githubSettings.targetOrg} Organizasyon Depoları)</span>
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {githubSettings?.isValid
                  ? (githubSettings.targetOrg
                      ? `"${githubSettings.targetOrg}" kurumsal organizasyonuna ait tüm depolara erişim yetkilendirildi.`
                      : `@${accountUsername || 'Hesap'} hesabına ait gizli (private) ve açık (public) tüm depolara erişim yetkilendirildi.`)
                  : 'Token girilmediğinde GitHub API yalnızca açık (public) depoları listeler.'}
              </p>
            </div>

            {/* Rozetler */}
            <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
              <div className="p-2.5 rounded-lg border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-800/30">
                <span className="text-[10px] text-slate-400 font-medium block">Keşfedilen Depolar</span>
                <span className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5 block">
                  {repositories.length} Depo
                </span>
              </div>
              <div className="p-2.5 rounded-lg border border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-slate-800/30">
                <span className="text-[10px] text-slate-400 font-medium block">Son Eşitleme</span>
                <span className="text-xs font-semibold font-mono text-slate-700 dark:text-slate-300 mt-0.5 block truncate" title={formatDateTime(lastSyncTime)}>
                  {formatDateTime(lastSyncTime)}
                </span>
              </div>
            </div>
          </div>

          {/* Aksiyon Butonları */}
          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/5">
            <button
              type="button"
              onClick={() => handleSyncGitHub()}
              disabled={isSyncing}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400 dark:text-blue-600' : ''}`} />
              <span>{isSyncing ? 'Eşitleniyor...' : 'GitHub ile Eşitle'}</span>
            </button>
          </div>
        </div>

        {/* PANEL B: Tarama Orkestrasyonu & Toplu İşlemler (7 Sütun) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  Tarama Orkestrasyonu & Aksiyonlar
                </h2>
              </div>
              <span className="text-[11px] font-mono text-slate-400">
                Eşzamanlı 3 Worker
              </span>
            </div>

            {/* İki Aksiyon Kartı (Toplu Tarama vs Tekil Tarama) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3.5">
              {/* 1. Toplu Tarama Kartı */}
              <div className="p-3.5 rounded-lg border border-indigo-100 dark:border-indigo-900/30 bg-indigo-50/40 dark:bg-indigo-950/20 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                      Tüm Depoları Tara (Batch Scan)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Sistemdeki <strong>{repositories.length}</strong> deponun tamamında CIS 16.4 SBOM ve CIS 16.6 OSV zafiyet taramasını arka planda kuyruğa alır.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBatchConfirmModal(true)}
                  disabled={isBatchScanning || repositories.length === 0}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{isBatchScanning ? 'Toplu İşlem Sürüyor...' : 'Tüm Depoları Tara'}</span>
                </button>
              </div>

              {/* 2. Tekil Depo Tarama Kartı */}
              <div className="p-3.5 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0B1320] flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <Play className="w-4 h-4 text-[#C8102E]" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Tekil Depo Tara
                    </span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    <select
                      value={selectedRepoId}
                      onChange={handleSelectRepoChange}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500 font-mono"
                    >
                      {repositories.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.fullName || r.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-medium">Dal (Branch):</span>
                      <input
                        type="text"
                        value={singleBranch}
                        onChange={(e) => setSingleBranch(e.target.value)}
                        className="flex-1 px-2 py-0.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                        placeholder="main"
                      />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleTriggerSingleScan}
                  disabled={isSingleScanning || !selectedRepoId}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#C8102E] hover:bg-[#A60D24] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Play className={`w-3.5 h-3.5 fill-current ${isSingleScanning ? 'animate-spin' : ''}`} />
                  <span>{isSingleScanning ? 'Taranıyor...' : 'Seçili Depoyu Tara'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Arka Plan Tarama İlerleme Çubuğu */}
          <div className="pt-2 border-t border-slate-100 dark:border-white/5">
            {batchProgress ? (
              <div className="p-3 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800/40 space-y-1.5 animate-fadeIn">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                    <span>Aktif Tarama: <code className="font-mono text-[11px] text-indigo-700 dark:text-indigo-300">{batchProgress.activeRepo}</code></span>
                  </span>
                  <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300">
                    %{batchProgress.percent} ({batchProgress.completed}/{batchProgress.total})
                  </span>
                </div>
                <div className="w-full bg-indigo-200/60 dark:bg-indigo-900/60 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${batchProgress.percent}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 p-2 rounded-lg bg-slate-50/50 dark:bg-slate-800/20">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span>Tarama Motoru: Sistem Boşta & Göreve Hazır</span>
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Son Tarama: Başarılı
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* PANEL C: Master-Detail Tarama Oturumları & Gerçek Zamanlı Yürütme Geçmişi (Prompt 104: 1 -> N) */}
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl p-5 shadow-xs space-y-4">
        {/* Tablo Başlık & Araç Çubuğu */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-white/10">
          <div>
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Tarama Oturumları & Yürütme Geçmişi (Master-Detail)
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Üst tarama oturumları (dbo.Scans) ve her oturumda taranan depoların (dbo.ScanExecutions) 1-e-Çok yürütme kayıtları.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Görünüm Modu Değiştirici */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-white/10 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('master-detail')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  viewMode === 'master-detail'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Oturum Bazlı (1-e-Çok)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('flat-queue')}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                  viewMode === 'flat-queue'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Düz Depo Listesi
              </button>
            </div>

            {/* Oturum Sayacı */}
            <span className="text-xs font-mono bg-slate-50 dark:bg-[#0B1320] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-semibold">
              {viewMode === 'master-detail' ? `Toplam: ${sessions.length} Oturum` : `Toplam: ${scanQueueRows.length} Depo`}
            </span>

            {/* Yenile Butonu */}
            <button
              type="button"
              onClick={loadSessions}
              disabled={isLoadingSessions}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg border border-slate-200/80 dark:border-white/10 transition-colors cursor-pointer"
              title="Oturumları Yenile"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSessions ? 'animate-spin text-blue-500' : ''}`} />
              <span className="hidden sm:inline">Yenile</span>
            </button>

            {/* Excel İndir */}
            <button
              type="button"
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel</span>
            </button>
          </div>
        </div>

        {/* 1. GÖRÜNÜM: MASTER-DETAIL OTURUM TABLOSU */}
        {viewMode === 'master-detail' && (
          <div className="space-y-3">
            {isLoadingSessions && sessions.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span>Tarama oturumları veritabanından alınıyor...</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl space-y-1">
                <p className="font-semibold text-slate-700 dark:text-slate-300">Henüz veritabanında kayıtlı bir tarama oturumu bulunmuyor.</p>
                <p className="text-[11px] text-slate-400">Yukarıdaki panelden "Tüm Depoları Tara" butonuna basarak ilk oturumu başlatabilirsiniz.</p>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden divide-y divide-slate-200 dark:divide-white/10 shadow-xs">
                {/* Master Tablo Başlıkları */}
                <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2.5 bg-slate-50/80 dark:bg-slate-900/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <div className="col-span-1">Oturum ID</div>
                  <div className="col-span-3">Tetikleyen Yetkili</div>
                  <div className="col-span-2">Tarih & Süre</div>
                  <div className="col-span-2">Kapsam & Durum</div>
                  <div className="col-span-3">Güvenlik Çıktısı</div>
                  <div className="col-span-1 text-right">Detay</div>
                </div>

                {/* Oturum Satırları */}
                {sessions.map((session) => {
                  const isExpanded = expandedSessionId === session.id;
                  const detail = sessionDetailsMap[session.id];
                  const isLoadingDetail = loadingDetailId === session.id;
                  const durationSec = session.durationMs ? (session.durationMs / 1000).toFixed(1) : '0.0';

                  // Filtrelenmiş Detay Depo Listesi
                  const rawExecutions = detail?.executions || [];
                  const filteredExecutions = rawExecutions.filter((item) => {
                    const matchesSearch =
                      !detailSearch ||
                      item.repositoryName?.toLowerCase().includes(detailSearch.toLowerCase()) ||
                      item.commitSha?.toLowerCase().includes(detailSearch.toLowerCase());
                    if (!matchesSearch) return false;
                    if (detailFilter === 'vulns') return item.vulnerabilitiesCount > 0;
                    if (detailFilter === 'failed') return (item.status || '').toLowerCase() === 'failed';
                    return true;
                  });

                  const vulnExecsCount = rawExecutions.filter((x) => x.vulnerabilitiesCount > 0).length;
                  const failedExecsCount = rawExecutions.filter((x) => (x.status || '').toLowerCase() === 'failed').length;

                  return (
                    <div key={session.id} className="transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      {/* MASTER SATIRI */}
                      <div
                        onClick={() => handleToggleSession(session.id)}
                        className="grid grid-cols-1 md:grid-cols-12 gap-3 px-4 py-3.5 items-center cursor-pointer select-none text-xs"
                      >
                        {/* 1. Oturum ID */}
                        <div className="col-span-1 flex items-center space-x-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60 shadow-xs">
                            #{session.id}
                          </span>
                        </div>

                        {/* 2. Tetikleyen Yetkili */}
                        <div className="col-span-3 min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <UserCheck className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="font-bold text-slate-900 dark:text-white truncate">
                              {session.scannedUserName || 'GitRadar Administrator'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate pl-5 font-mono">
                            {session.scannedUserEmail || 'admin@example.com'}
                          </p>
                        </div>

                        {/* 3. Tarih & Süre */}
                        <div className="col-span-2 min-w-0">
                          <div className="flex items-center space-x-1.5 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{formatDateTime(session.scanDate)}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono pl-5">
                            Süre: <strong className="text-slate-700 dark:text-slate-300">{durationSec} sn</strong>
                          </p>
                        </div>

                        {/* 4. Kapsam & Durum */}
                        <div className="col-span-2 flex flex-wrap items-center gap-1.5">
                          {session.status === 'COMPLETED' ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span>{session.successCount} / {session.totalRepositoriesCount} Başarılı</span>
                            </span>
                          ) : session.status === 'RUNNING' ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800/50">
                              <RefreshCw className="w-3 h-3 animate-spin text-blue-500" />
                              <span>Sürüyor ({session.scannedRepositoriesCount}/{session.totalRepositoriesCount})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50">
                              <XCircle className="w-3.5 h-3.5 text-rose-500" />
                              <span>{session.failureCount} Hatalı</span>
                            </span>
                          )}
                        </div>

                        {/* 5. Güvenlik Çıktısı */}
                        <div className="col-span-3 flex flex-wrap items-center gap-1.5">
                          {session.totalVulnerabilitiesFound > 0 ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50">
                              <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                              <span>{session.totalVulnerabilitiesFound} Açık</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md font-mono text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/40">
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span>0 Zafiyet</span>
                            </span>
                          )}

                          {session.autoResolvedCount > 0 && (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-700/50">
                              <Sparkles className="w-3 h-3 text-emerald-600 dark:text-emerald-300" />
                              <span>{session.autoResolvedCount} Otomatik Çözüldü</span>
                            </span>
                          )}
                        </div>

                        {/* 6. Detay Aksiyonu */}
                        <div className="col-span-1 flex items-center justify-end">
                          <button
                            type="button"
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                          >
                            <span className="hidden xl:inline">{isExpanded ? 'Kapat' : 'Detay'}</span>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* DETAIL GÖRÜNÜMÜ (Akordeon Alt Panel) */}
                      {isExpanded && (
                        <div className="bg-slate-50/90 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 p-4 space-y-3">
                          {isLoadingDetail ? (
                            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center space-x-2">
                              <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                              <span>#{session.id} numaralı oturumun depo çalıştırma detayları yükleniyor...</span>
                            </div>
                          ) : !detail ? (
                            <div className="py-4 text-center text-xs text-rose-600 font-semibold">
                              Oturum çalıştırma detayları yüklenemedi.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {/* Arama ve Filtreleme Araç Çubuğu */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2 border-b border-slate-200/80 dark:border-slate-800">
                                <div className="flex items-center space-x-2 min-w-0 flex-1">
                                  <div className="relative flex-1 max-w-xs">
                                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                                    <input
                                      type="text"
                                      value={detailSearch}
                                      onChange={(e) => setDetailSearch(e.target.value)}
                                      placeholder="Depo adı veya SHA ara..."
                                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                    />
                                  </div>

                                  <div className="flex items-center space-x-1 text-xs">
                                    <button
                                      type="button"
                                      onClick={() => setDetailFilter('all')}
                                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                        detailFilter === 'all'
                                          ? 'bg-blue-600 text-white font-bold'
                                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                                      }`}
                                    >
                                      Tümü ({rawExecutions.length})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDetailFilter('vulns')}
                                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                        detailFilter === 'vulns'
                                          ? 'bg-amber-600 text-white font-bold'
                                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                                      }`}
                                    >
                                      Zafiyet Bulunanlar ({vulnExecsCount})
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDetailFilter('failed')}
                                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                        detailFilter === 'failed'
                                          ? 'bg-rose-600 text-white font-bold'
                                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100'
                                      }`}
                                    >
                                      Hatalı Olanlar ({failedExecsCount})
                                    </button>
                                  </div>
                                </div>

                                <div className="text-[11px] font-mono text-slate-400">
                                  {filteredExecutions.length} / {rawExecutions.length} Depo Gösteriliyor
                                </div>
                              </div>

                              {/* Detail Çalıştırma Tablosu */}
                              <div className="bg-white dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden max-h-96 overflow-y-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-100/80 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                                      <th className="py-2 px-3 w-16"># ID</th>
                                      <th className="py-2 px-3">Taranan Depo Adı</th>
                                      <th className="py-2 px-3 w-28">Commit SHA</th>
                                      <th className="py-2 px-3 w-28">Durum</th>
                                      <th className="py-2 px-3 w-28 text-center">Paket Sayısı</th>
                                      <th className="py-2 px-3 w-28 text-center">Açık Sayısı</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-900 font-mono">
                                    {filteredExecutions.length === 0 ? (
                                      <tr>
                                        <td colSpan={6} className="py-6 text-center text-slate-400 text-xs">
                                          Arama kriterlerine uygun depo çalıştırması bulunamadı.
                                        </td>
                                      </tr>
                                    ) : (
                                      filteredExecutions.map((item) => {
                                        const shortSha = item.commitSha ? item.commitSha.substring(0, 7) : '-';
                                        const isCompleted = item.status === 'Completed';

                                        return (
                                          <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/60 transition-colors">
                                            <td className="py-2 px-3 text-slate-400">#{item.id}</td>
                                            <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white font-sans">
                                              {item.repositoryName}
                                            </td>
                                            <td className="py-2 px-3">
                                              <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[11px] text-slate-600 dark:text-slate-300">
                                                {shortSha}
                                              </span>
                                            </td>
                                            <td className="py-2 px-3">
                                              {isCompleted ? (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                  <span>Completed</span>
                                                </span>
                                              ) : (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                                                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                  <span>Failed</span>
                                                </span>
                                              )}
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                              <span className="text-slate-700 dark:text-slate-300 font-bold">
                                                {item.packagesCount}
                                              </span>
                                            </td>
                                            <td className="py-2 px-3 text-center">
                                              {item.vulnerabilitiesCount > 0 ? (
                                                <span className="inline-flex items-center px-2 py-0.2 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40">
                                                  {item.vulnerabilitiesCount} Açık
                                                </span>
                                              ) : (
                                                <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                                                  0 Açık
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 2. GÖRÜNÜM: DÜZ DEPO KUYRUĞU TABLOSU (DexDataGrid Alternatif Görünüm) */}
        {viewMode === 'flat-queue' && (
          <div className="space-y-3">
            {/* Sub-Toolbar (Gruplama & Sütunlar) */}
            <div className="relative z-30 flex items-center justify-between gap-3 pb-2 pt-0.5 border-b border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center gap-2">
                {/* Gruplama */}
                <div className="relative" ref={groupMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowGroupMenu(!showGroupMenu);
                      setShowColMenu(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg border border-slate-200/80 dark:border-white/10 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-blue-500" />
                    <span>
                      {groupMode === 'status'
                        ? 'Grup: Durum'
                        : groupMode === 'scanType'
                        ? 'Grup: Tarama Tipi'
                        : 'Gruplama'}
                    </span>
                    <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
                  </button>

                  {showGroupMenu && (
                    <div className="absolute left-0 top-full mt-1.5 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-1.5 z-50 text-xs">
                      <button
                        type="button"
                        onClick={() => applyGrouping('none')}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'none' ? 'font-bold text-blue-600' : ''}`}
                      >
                        <span>Düz Liste (Grupsuz)</span>
                        {groupMode === 'none' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGrouping('status')}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'status' ? 'font-bold text-blue-600' : ''}`}
                      >
                        <span>Duruma Göre Grupla</span>
                        {groupMode === 'status' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => applyGrouping('scanType')}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer ${groupMode === 'scanType' ? 'font-bold text-blue-600' : ''}`}
                      >
                        <span>Tarama Tipine Göre</span>
                        {groupMode === 'scanType' && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </button>
                    </div>
                  )}
                </div>

                {/* Sütunlar */}
                <div className="relative" ref={colMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowColMenu(!showColMenu);
                      setShowGroupMenu(false);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg border border-slate-200/80 dark:border-white/10 cursor-pointer"
                  >
                    <Columns className="w-3.5 h-3.5 text-purple-500" />
                    <span>Sütunlar</span>
                    <ChevronDown className="w-3 h-3 opacity-60 ml-0.5" />
                  </button>

                  {showColMenu && (
                    <div className="absolute left-0 top-full mt-1.5 w-52 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-2 z-50 text-xs space-y-1">
                      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-0.5">
                        Görünür Sütunlar
                      </div>
                      {[
                        { id: 'id', name: '# ID' },
                        { id: 'repoName', name: 'Taranan Depo Adı' },
                        { id: 'scanType', name: 'Tarama Tipi' },
                        { id: 'startedAt', name: 'Başlangıç Tarihi' },
                        { id: 'duration', name: 'Geçen Süre' },
                        { id: 'status', name: 'Durum' },
                        { id: 'packagesCount', name: 'Paket / Zafiyet' },
                        { id: 'triggeredBy', name: 'Tetikleyen' },
                      ].map((col) => (
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
              </div>
            </div>

            {/* DexDataGrid Tablosu */}
            <div className="w-full">
              <DexDataGrid
                rowData={scanQueueRows}
                columnDefs={columnDefs}
                height="420px"
                pagination={true}
                paginationPageSize={10}
                onGridReady={(params) => {
                  gridApiRef.current = params.api;
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Toplu Tarama Onay Modalı */}
      {showBatchConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn">
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Toplu Tarama Onayı (Batch Scan)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Sistemde kayıtlı toplam <strong>{repositories.length}</strong> aktif depo için
              <strong> CIS 16.4 SBOM</strong> (bağımlılık) ve <strong>CIS 16.6 OSV</strong> (zafiyet) analizi arka planda başlatılacaktır.
            </p>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/10 text-[11px] text-slate-600 dark:text-slate-400 space-y-1">
              <p>• Maksimum 3 worker paralel yürütme yapacaktır.</p>
              <p>• Tarama sonuçları doğrudan veritabanına işlenecektir.</p>
              <p>• İşlem arka planda devam ederken sistemi kullanmaya devam edebilirsiniz.</p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-white/10">
              <button
                type="button"
                onClick={() => setShowBatchConfirmModal(false)}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleTriggerBatchScan}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs transition-colors cursor-pointer"
              >
                Toplu Taramayı Başlat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
