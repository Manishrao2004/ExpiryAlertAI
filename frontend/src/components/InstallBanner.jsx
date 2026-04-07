import React from 'react';

export default function InstallBanner({ onInstall, onDismiss }) {
  return (
    <div className="mx-4 mt-3 bg-gradient-to-r from-slate-800/80 to-slate-900/80 border border-slate-600/40 rounded-2xl p-4 flex items-center gap-3 animate-slide-up">
      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-lg shadow-lg shadow-emerald-500/20">
        📲
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold leading-none mb-0.5">Install App</p>
        <p className="text-slate-400 text-xs">Add to home screen for quick access</p>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={onInstall}
          className="bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all"
        >
          Install
        </button>
        <button onClick={onDismiss} className="text-slate-500 hover:text-slate-300 p-2 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
