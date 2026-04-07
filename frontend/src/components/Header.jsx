import React from 'react';

export default function Header({ activeTab, onTabChange }) {
  const title = activeTab === 'add' ? 'Add Product' : activeTab === 'alerts' ? 'Alerts' : 'ExpiryAlert AI';

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800/60">
      <div className="flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          {/* Logo */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <path d="M12 3V1M12 23v-2M3 12H1M23 12h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-white leading-none">{title}</h1>
            {activeTab === 'home' && (
              <p className="text-[10px] text-emerald-400 font-medium tracking-wide">AI-Powered Tracker</p>
            )}
          </div>
        </div>

        {/* Right action */}
        {activeTab === 'home' ? (
          <button
            onClick={() => onTabChange('add')}
            className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white text-sm font-semibold px-3.5 py-2 rounded-xl transition-all shadow-lg shadow-emerald-500/25"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Add
          </button>
        ) : activeTab === 'add' ? (
          <button
            onClick={() => onTabChange('home')}
            className="text-slate-400 hover:text-white p-2 rounded-lg transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        ) : null}
      </div>
    </header>
  );
}
