import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  ShieldAlert,
  GitBranch,
  Terminal,
  History,
  Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({ activeTab, setActiveTab, stats }) {
  const { user, isAdmin } = useAuth();

  // Grup 1: DENETİM & RAPORLAMA (Tüm rollere açık)
  const auditMenuItems = [
    {
      id: 'dashboard',
      label: 'Genel Bakış',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'inventory',
      label: 'CIS 16.4: SBOM Envanteri',
      icon: Boxes,
      badge: stats?.packagesCount ?? null,
      badgeType: 'neutral',
    },
    {
      id: 'vulnerabilities',
      label: 'CIS 16.6: Zafiyet Triyajı',
      icon: ShieldAlert,
      badge: stats?.vulnerabilitiesCount ?? null,
      badgeType: (stats?.criticalCount > 0 || stats?.highCount > 0) ? 'danger' : 'neutral',
    },
    {
      id: 'repositories',
      label: 'İzlenen Depolar',
      icon: GitBranch,
      badge: stats?.repositoriesCount ?? null,
      badgeType: 'neutral',
    },
  ];

  // Grup 2: SİSTEM YÖNETİMİ
  const adminMenuItems = [
    {
      id: 'admin-scanner',
      label: 'Tarama & GitHub Merkezi',
      icon: Terminal,
      badge: null,
    },
    {
      id: 'users',
      label: 'Yönetici Yetkilendirme',
      icon: Users,
      badge: null,
    },
    {
      id: 'activities',
      label: 'Hareketler',
      icon: History,
      badge: null,
    },
  ];

  const isUserAdmin = isAdmin || user?.role === 'Admin';

  const renderNavButton = (item) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    return (
      <button
        key={item.id}
        onClick={() => setActiveTab(item.id)}
        className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-lg transition-colors cursor-pointer ${
          isActive
            ? 'bg-slate-100 dark:bg-[#111C2E] text-slate-900 dark:text-white font-semibold border-l-2 border-[#C8102E]'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#111C2E]/60 hover:text-slate-900 dark:hover:text-slate-200'
        }`}
      >
        <Icon
          className={`w-5 h-5 shrink-0 ${
            isActive
              ? 'text-[#C8102E]'
              : 'text-slate-400 dark:text-slate-500'
          }`}
        />
        <span className="text-sm font-medium whitespace-nowrap text-left flex-1">
          {item.label}
        </span>
        {item.badge !== null && item.badge !== undefined && (
          <span
            className={`ml-auto shrink-0 px-2 py-0.5 text-xs font-semibold font-mono rounded-full ${
              item.badgeType === 'danger'
                ? 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-400 dark:border-rose-900/50'
                : item.badgeType === 'admin'
                ? 'bg-rose-50 text-[#C8102E] border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/40 text-[10px]'
                : 'bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
            }`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside className="w-72 bg-white dark:bg-[#0B1320] border-r border-slate-200 dark:border-white/10 flex flex-col justify-between shrink-0 select-none transition-colors">
      <div className="p-3.5 space-y-5">
        {/* Grup 1: DENETİM & RAPORLAMA */}
        <div className="space-y-1">
          <div className="px-3.5 pt-2 pb-1">
            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Denetim & Raporlama
            </p>
          </div>
          <nav className="space-y-1">
            {auditMenuItems.map(renderNavButton)}
          </nav>
        </div>

        {/* Grup 2: SİSTEM YÖNETİMİ */}
        {isUserAdmin && (
          <div className="space-y-1 pt-2 border-t border-slate-100 dark:border-white/5 animate-fadeIn">
            <div className="px-3.5 pt-2 pb-1 flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Sistem Yönetimi
              </p>
            </div>
            <nav className="space-y-1">
              {adminMenuItems.map(renderNavButton)}
            </nav>
          </div>
        )}
      </div>

      {/* Alt Bilgi: GitRadar Marka & Telif */}
      <div className="pt-4 pb-3 px-4 border-t border-slate-200/80 dark:border-white/5 mt-auto select-none">
        <div className="flex items-center justify-center py-2 space-x-2">
          <ShieldAlert className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 tracking-wide">
            GitRadar Enterprise
          </span>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center font-medium mt-0.5">
          SCA & CIS Controls v8 Compliance © 2026
        </p>
      </div>
    </aside>
  );
}
