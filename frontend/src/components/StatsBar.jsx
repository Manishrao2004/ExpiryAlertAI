import React from 'react';

export default function StatsBar({ stats, filter, onFilter }) {
  const tabs = [
    { key: 'all', label: 'All', count: stats.total, color: 'text-slate-300', activeBg: 'bg-slate-700', activeBorder: 'border-slate-500' },
    { key: 'Safe', label: 'Safe', count: stats.safe, color: 'text-emerald-400', activeBg: 'bg-emerald-500/20', activeBorder: 'border-emerald-500/50' },
    { key: 'Expiring Soon', label: 'Soon', count: stats.expiringSoon, color: 'text-amber-400', activeBg: 'bg-amber-500/20', activeBorder: 'border-amber-500/50' },
    { key: 'Expired', label: 'Expired', count: stats.expired, color: 'text-red-400', activeBg: 'bg-red-500/20', activeBorder: 'border-red-500/50' },
  ];

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="grid grid-cols-4 gap-2">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onFilter(tab.key)}
            className={`relative flex flex-col items-center justify-center py-3 rounded-xl border transition-all duration-200 ${
              filter === tab.key
                ? `${tab.activeBg} ${tab.activeBorder} shadow-sm`
                : 'bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/60'
            }`}
          >
            <span className={`text-xl font-bold leading-none ${tab.color}`}>
              {tab.count ?? 0}
            </span>
            <span className={`text-[10px] mt-1 font-medium ${filter === tab.key ? tab.color : 'text-slate-500'}`}>
              {tab.label}
            </span>
            {/* Urgent indicator */}
            {tab.key === 'Expiring Soon' && tab.count > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-slate-900 animate-pulse" />
            )}
            {tab.key === 'Expired' && tab.count > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-slate-900 animate-pulse" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
