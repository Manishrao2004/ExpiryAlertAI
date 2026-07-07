import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { removeToken, getUser } from '../utils/auth';

export default function Header({ activeTab, onTabChange }) {
  const title = activeTab === 'add' ? 'Add Product' : activeTab === 'alerts' ? 'Alerts' : 'ExpiryAlert AI';
  const [showMenu, setShowMenu] = useState(false);
  const navigate = useNavigate();
  const user = getUser();

  const handleLogout = () => {
    removeToken();
    navigate('/login', { replace: true });
  };

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

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {activeTab === 'home' && (
            <button
              id="header-add-btn"
              onClick={() => onTabChange('add')}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-white text-sm font-semibold px-3.5 py-2 rounded-xl transition-all shadow-lg shadow-emerald-500/25"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Add
            </button>
          )}

          {activeTab === 'add' && (
            <button
              onClick={() => onTabChange('home')}
              className="text-slate-400 hover:text-white p-2 rounded-lg transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          )}

          {/* User avatar / logout menu */}
          <div className="relative">
            <button
              id="header-user-btn"
              onClick={() => setShowMenu((v) => !v)}
              className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-600 flex items-center justify-center text-emerald-400 font-bold text-sm transition-colors"
              title={user?.name || 'Account'}
            >
              {user?.name ? user.name[0].toUpperCase() : '?'}
            </button>

            {showMenu && (
              <>
                {/* Backdrop */}
                <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
                {/* Dropdown */}
                <div className="absolute right-0 top-10 z-50 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700">
                    <p className="text-white text-sm font-semibold truncate">{user?.name || 'User'}</p>
                    <p className="text-slate-400 text-xs truncate">{user?.email || ''}</p>
                  </div>
                  <button
                    id="header-logout-btn"
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-3 text-red-400 hover:bg-red-500/10 transition-colors text-sm"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
                    </svg>
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
