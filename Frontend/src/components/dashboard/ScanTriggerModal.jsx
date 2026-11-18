import React, { useState } from 'react';
import {
  X,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  Boxes,
  GitCommit,
} from 'lucide-react';
import { runScan } from '../../api/gitRadarApi';

export default function ScanTriggerModal({ isOpen, onClose, onScanCompleted }) {
  const [owner, setOwner] = useState('dotnet');
  const [repositoryName, setRepositoryName] = useState('eShop');
  const [branchOrCommit, setBranchOrCommit] = useState('main');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!owner.trim() || !repositoryName.trim() || !branchOrCommit.trim()) {
      setError('Lütfen tüm zorunlu alanları doldurun.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await runScan({
        owner: owner.trim(),
        repositoryName: repositoryName.trim(),
        branchOrCommit: branchOrCommit.trim(),
        triggeredBy: 'WebDashboard',
      });

      setResult(data);
      if (onScanCompleted) {
        onScanCompleted(data);
      }
    } catch (err) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        'Tarama yürütülürken beklenmeyen bir hata oluştu.';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setResult(null);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 dark:bg-black/70 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden transition-all">
        {/* Modal Başlığı */}
        <div className="px-5 py-3.5 bg-slate-50 dark:bg-[#0B1320] border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 rounded-full bg-[#C8102E]" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">
              Yeni SCA Depo Taraması
            </h3>
          </div>
          <button
            onClick={handleReset}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal İçeriği */}
        <div className="p-5 space-y-4">
          {!result ? (
            <form onSubmit={handleSubmit} className="space-y-3.5">
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                GitHub Tree API üzerinden klonsuz (Zero Git Clone) manifestolar taranır, NuGet bağımlılıkları çözülür ve Google OSV ile zenginleştirilir.
              </p>

              {error && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-300 text-xs flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                  <span>{error}</span>
                </div>
              )}

              {/* Repo Sahibi */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  GitHub Depo Sahibi / Organizasyon (Owner) <span className="text-[#C8102E]">*</span>
                </label>
                <input
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  disabled={isLoading}
                  placeholder="örn: dotnet, EnterpriseSecurity"
                  className="w-full bg-slate-50 dark:bg-[#0B1320] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 font-mono disabled:opacity-50"
                  required
                />
              </div>

              {/* Repo Adı */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Depo Adı (Repository Name) <span className="text-[#C8102E]">*</span>
                </label>
                <input
                  type="text"
                  value={repositoryName}
                  onChange={(e) => setRepositoryName(e.target.value)}
                  disabled={isLoading}
                  placeholder="örn: eShop, microservice-payment"
                  className="w-full bg-slate-50 dark:bg-[#0B1320] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 font-mono disabled:opacity-50"
                  required
                />
              </div>

              {/* Dal veya Commit */}
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Dal veya Commit SHA (Branch / Ref) <span className="text-[#C8102E]">*</span>
                </label>
                <input
                  type="text"
                  value={branchOrCommit}
                  onChange={(e) => setBranchOrCommit(e.target.value)}
                  disabled={isLoading}
                  placeholder="örn: main, release/v2.0, 7f8c12a..."
                  className="w-full bg-slate-50 dark:bg-[#0B1320] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-slate-400 dark:focus:border-slate-500 font-mono disabled:opacity-50"
                  required
                />
              </div>

              {/* Butonlar */}
              <div className="pt-3 flex items-center justify-end space-x-2.5 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={isLoading}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="inline-flex items-center space-x-1.5 bg-[#C8102E] hover:bg-[#A60D24] text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors shadow-xs active:scale-95 disabled:opacity-60 cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Taranıyor...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Taramayı Başlat</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Sonuç Özeti */
            <div className="space-y-3.5">
              <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/40 flex items-center space-x-3 text-emerald-800 dark:text-emerald-300">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">Tarama Başarıyla Tamamlandı</h4>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300/80 mt-0.5">
                    Depo bağımlılıkları ve zafiyet eşleştirmesi veritabanına işlendi.
                  </p>
                </div>
              </div>

              {/* Sayaçlar */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1320] border border-slate-200 dark:border-white/10">
                  <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
                    <Boxes className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Keşfedilen Paket</span>
                  </div>
                  <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                    {result.discoveredPackagesCount}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1320] border border-slate-200 dark:border-white/10">
                  <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 mb-1">
                    <ShieldAlert className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                    <span>Toplam Zafiyet</span>
                  </div>
                  <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                    {result.vulnerabilitiesCount}
                  </span>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1320] border border-slate-200 dark:border-white/10">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">Kritik / Yüksek</span>
                  <div className="text-sm font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                    <span className="text-rose-600 dark:text-rose-400">{result.criticalCount}</span> /{' '}
                    <span className="text-amber-600 dark:text-amber-400">{result.highCount}</span>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 dark:bg-[#0B1320] border border-slate-200 dark:border-white/10">
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">Tarama Durumu</span>
                  <div className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {result.status}
                  </div>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-[#0B1320] rounded-lg text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center space-x-2 border border-slate-200 dark:border-white/10">
                <GitCommit className="w-3.5 h-3.5 text-slate-400" />
                <span className="truncate">Commit SHA: {result.commitSha}</span>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleReset}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Kapat ve İncele
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
