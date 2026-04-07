import React, { useState } from 'react';

export default function NotificationBanner({ onEnable, onRefresh, loading, permission }) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const isDenied = permission === 'denied';

  return (
    <div className={`mx-4 mt-3 bg-gradient-to-r ${isDenied ? 'from-amber-900/60 to-slate-800/60 border-amber-500/30' : 'from-emerald-900/60 to-slate-800/60 border-emerald-500/30'} border rounded-2xl p-4 flex items-start gap-3 animate-slide-up`}>
      <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${isDenied ? 'bg-amber-500/20 border-amber-500/30' : 'bg-emerald-500/20 border-emerald-500/30'} border flex items-center justify-center text-xl`}>
        {isDenied ? '🔒' : '🔔'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-semibold leading-none mb-1">
          {isDenied ? 'Notifications Blocked' : 'Enable Alerts'}
        </p>
        <p className="text-slate-400 text-xs leading-relaxed">
          {isDenied 
            ? 'Click the lock icon in the URL bar, allow Notifications, then click Sync.' 
            : 'Get notified 2 days before items expire.'}
        </p>
      </div>
      <div className="flex flex-col gap-2 items-end flex-shrink-0">
        <div className="flex gap-2">
          {isDenied ? (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all disabled:opacity-60"
            >
              {loading ? '...' : 'Sync'}
            </button>
          ) : (
            <button
              onClick={onEnable}
              disabled={loading}
              className="bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-all disabled:opacity-60"
            >
              {loading ? '...' : 'Enable'}
            </button>
          )}
          <button
            onClick={() => setDismissed(true)}
            className="text-slate-500 hover:text-slate-300 p-2 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
