import React from 'react';

export default function BottomNav({ active, onChange, stats }) {
  const urgentCount = (stats.expiringSoon || 0) + (stats.expired || 0);

  const tabs = [
    {
      key: 'home',
      label: 'Items',
      icon: (a) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5"/>
          <rect x="14" y="3" width="7" height="7" rx="1.5"/>
          <rect x="3" y="14" width="7" height="7" rx="1.5"/>
          <rect x="14" y="14" width="7" height="7" rx="1.5"/>
        </svg>
      )
    },
    {
      key: 'add',
      label: 'Add',
      icon: (a) => (
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
          a
            ? 'bg-emerald-400 shadow-emerald-400/40 scale-105'
            : 'bg-emerald-500 shadow-emerald-500/30'
        }`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </div>
      ),
      special: true
    },
    {
      key: 'alerts',
      label: 'Alerts',
      icon: (a) => (
        <div className="relative">
          <svg width="22" height="22" viewBox="0 0 24 24" fill={a ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 01-3.46 0"/>
          </svg>
          {urgentCount > 0 && (
            <span className={`absolute -top-1.5 -right-1.5 text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center border-2 border-slate-900 ${
              stats.expired > 0 ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
            }`}>
              {urgentCount > 9 ? '9+' : urgentCount}
            </span>
          )}
        </div>
      )
    }
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 bg-slate-900/95 backdrop-blur-xl border-t border-slate-800/60">
      {/* Safe area padding for iPhone */}
      <div className="flex items-center justify-around px-4 pt-3 pb-safe-4" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {tabs.map(tab => {
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`flex flex-col items-center gap-1 transition-all duration-200 ${
                tab.special ? '-mt-6' : ''
              } ${isActive && !tab.special ? 'text-emerald-400' : tab.special ? '' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {tab.icon(isActive)}
              {!tab.special && (
                <span className={`text-[10px] font-semibold ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {tab.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
