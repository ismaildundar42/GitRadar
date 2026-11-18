import React from 'react';
import {
  GitBranch,
  Boxes,
  AlertOctagon,
  AlertTriangle,
} from 'lucide-react';

export default function StatsOverview({ stats, onSelectFilter }) {
  const cards = [
    {
      title: 'Kayıtlı Depolar',
      value: stats?.repositoriesCount ?? 0,
      subtext: 'Aktif izlenen kurumsal depolar',
      icon: GitBranch,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-100 dark:border-blue-900/40',
      badge: 'CIS 16.4',
      badgeColor: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
      filter: 'repositories',
    },
    {
      title: 'Bileşen Envanteri (SBOM)',
      value: stats?.packagesCount ?? 0,
      subtext: 'Doğrudan ve geçişli kütüphaneler',
      icon: Boxes,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-100 dark:border-emerald-900/40',
      badge: 'Envanter',
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40',
      filter: 'inventory',
    },
    {
      title: 'Kritik Risk Zafiyetler',
      value: stats?.criticalCount ?? 0,
      subtext: 'CIS 16.6 SLA: 7 gün içinde çözüm',
      icon: AlertOctagon,
      iconColor: stats?.criticalCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400 dark:text-slate-500',
      iconBg: stats?.criticalCount > 0 ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/40' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700',
      badge: 'SLA: 7 Gün',
      badgeColor: stats?.criticalCount > 0
        ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50'
        : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      filter: 'critical',
    },
    {
      title: 'Yüksek Risk Zafiyetler',
      value: stats?.highCount ?? 0,
      subtext: 'CIS 16.6 SLA: 14 gün içinde çözüm',
      icon: AlertTriangle,
      iconColor: stats?.highCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500',
      iconBg: stats?.highCount > 0 ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-100 dark:border-amber-900/40' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700',
      badge: 'SLA: 14 Gün',
      badgeColor: stats?.highCount > 0
        ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50'
        : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      filter: 'high',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            onClick={() => onSelectFilter && onSelectFilter(card.filter)}
            className="p-4 rounded-xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-white/10 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {card.title}
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded-md border ${card.badgeColor}`}
              >
                {card.badge}
              </span>
            </div>

            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white tracking-tight">
                  {card.value}
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {card.subtext}
                </p>
              </div>
              <div className={`p-2 rounded-lg border ${card.iconBg} ${card.iconColor} transition-transform group-hover:scale-105`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
