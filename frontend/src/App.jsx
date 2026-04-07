import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import AddItemPanel from './components/AddItemPanel';
import ItemList from './components/ItemList';
import NotificationBanner from './components/NotificationBanner';
import InstallBanner from './components/InstallBanner';
import BottomNav from './components/BottomNav';
import StatsBar from './components/StatsBar';
import { getItems, deleteItem, updateItem, getStats } from './utils/api';
import { useNotifications } from './utils/useNotifications';
import { sortItems } from './utils/dateUtils';

export default function App() {
  const [items, setItems]         = useState([]);
  const [stats, setStats]         = useState({ total: 0, safe: 0, expiringSoon: 0, expired: 0 });
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('home'); // 'home' | 'add' | 'alerts'
  const [filter, setFilter]       = useState('all');  // 'all' | 'Safe' | 'Expiring Soon' | 'Expired'
  const [search, setSearch]       = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const notif = useNotifications();
  const refreshRef = useRef(null);

  // ─── PWA install prompt ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // ─── Load items ─────────────────────────────────────────────────────────────
  const fetchItems = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [itemRes, statRes] = await Promise.all([getItems(), getStats()]);
      setItems(sortItems(itemRes.items || []));
      setStats(statRes.stats || {});
    } catch {
      if (!silent) toast.error('Failed to load items');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Auto-refresh every 60s
  useEffect(() => {
    refreshRef.current = setInterval(() => fetchItems(true), 60000);
    return () => clearInterval(refreshRef.current);
  }, [fetchItems]);

  // ─── Check items on open and show local alerts ────────────────────────────
  useEffect(() => {
    if (!items.length) return;
    const now = new Date(); now.setHours(0,0,0,0);
    const alertsKey = `alerts_${now.toISOString().slice(0,10)}`;
    if (localStorage.getItem(alertsKey)) return;

    const urgentItems = items.filter(i => {
      const exp = new Date(i.expiryDate); exp.setHours(0,0,0,0);
      const diff = Math.floor((exp - now) / 86400000);
      return diff <= 2;
    });

    if (urgentItems.length > 0) {
      localStorage.setItem(alertsKey, '1');
      setTimeout(() => {
        urgentItems.slice(0, 3).forEach(item => {
          const exp = new Date(item.expiryDate); exp.setHours(0,0,0,0);
          const diff = Math.floor((exp - now) / 86400000);
          const msg = diff < 0
            ? `🚨 ${item.name} has EXPIRED!`
            : diff === 0
              ? `⚠️ ${item.name} expires TODAY!`
              : diff === 1
                ? `⏰ ${item.name} expires TOMORROW`
                : `📅 ${item.name} expires in 2 days`;
          toast(msg, {
            duration: 5000,
            style: {
              background: diff < 0 ? '#450a0a' : diff <= 1 ? '#451a03' : '#1c1917',
              color: diff < 0 ? '#fca5a5' : diff <= 1 ? '#fcd34d' : '#d4d4d4',
              border: `1px solid ${diff < 0 ? '#ef444466' : diff <= 1 ? '#f59e0b66' : '#52525266'}`
            }
          });
        });
      }, 1000);
    }
  }, [items]);

  // ─── Item actions ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (id) => {
    const toastId = toast.loading('Deleting...');
    try {
      await deleteItem(id);
      setItems(prev => prev.filter(i => i._id !== id));
      toast.success('Item deleted', { id: toastId });
      fetchItems(true);
    } catch {
      toast.error('Delete failed', { id: toastId });
    }
  }, [fetchItems]);

  const handleUpdate = useCallback(async (id, data) => {
    const toastId = toast.loading('Updating...');
    try {
      await updateItem(id, data);
      toast.success('Item updated', { id: toastId });
      fetchItems(true);
    } catch {
      toast.error('Update failed', { id: toastId });
    }
  }, [fetchItems]);

  const handleItemAdded = useCallback(() => {
    fetchItems(true);
    setActiveTab('home');
    toast.success('🎉 Item saved!');
  }, [fetchItems]);

  // ─── Filtered items ─────────────────────────────────────────────────────────
  const filteredItems = items.filter(item => {
    const matchFilter = filter === 'all' || item.status === filter;
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  // ─── PWA Install ────────────────────────────────────────────────────────────
  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      toast.success('App installed! 🎉');
      setShowInstall(false);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen min-h-dvh bg-[#0f172a] flex flex-col max-w-md mx-auto relative">
      <Toaster
        position="top-center"
        toastOptions={{
          style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155', borderRadius: '12px' },
          success: { iconTheme: { primary: '#10b981', secondary: '#f1f5f9' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#f1f5f9' } }
        }}
      />

      <Header onTabChange={setActiveTab} activeTab={activeTab} />

      {/* Banners */}
      {showInstall && (
        <InstallBanner onInstall={handleInstall} onDismiss={() => setShowInstall(false)} />
      )}
      {!notif.isEnabled && notif.isSupported && (
        <NotificationBanner
          onEnable={notif.enablePush}
          onRefresh={notif.refreshStatus}
          loading={notif.loading}
          permission={notif.permission}
        />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-24">
        {activeTab === 'home' && (
          <>
            <StatsBar stats={stats} filter={filter} onFilter={setFilter} />
            <Dashboard
              items={items}
              stats={stats}
              filter={filter}
              search={search}
              onSearch={setSearch}
              onFilter={setFilter}
            />
            <ItemList
              items={filteredItems}
              loading={loading}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
              filter={filter}
              search={search}
            />
          </>
        )}

        {activeTab === 'add' && (
          <AddItemPanel onSuccess={handleItemAdded} onCancel={() => setActiveTab('home')} />
        )}

        {activeTab === 'alerts' && (
          <AlertsTab
            notif={notif}
            items={items}
            stats={stats}
          />
        )}
      </main>

      <BottomNav active={activeTab} onChange={setActiveTab} stats={stats} />
    </div>
  );
}

// ─── Alerts Tab ───────────────────────────────────────────────────────────────
function AlertsTab({ notif, items, stats }) {
  const [testing, setTesting] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    const ok = await notif.sendTest();
    if (ok) toast.success('Test notification sent! Check your notifications.');
    else toast.error(notif.error || 'Failed to send test notification');
    setTesting(false);
  };

  const urgentItems = items.filter(i => {
    const now = new Date(); now.setHours(0,0,0,0);
    const exp = new Date(i.expiryDate); exp.setHours(0,0,0,0);
    return Math.floor((exp - now) / 86400000) <= 2;
  });

  return (
    <div className="p-4 space-y-4 animate-fade-in">
      <div className="card p-4">
        <h2 className="text-lg font-bold text-white mb-1">🔔 Notification Settings</h2>
        <p className="text-slate-400 text-sm mb-4">
          Get push alerts before your products expire — even when the app is closed.
        </p>

        {!notif.isSupported && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm">
            ⚠️ Push notifications aren't supported in this browser.
            Try Chrome or Firefox on Android/Desktop.
          </div>
        )}

        {notif.isSupported && (
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-slate-900/60 rounded-xl">
              <div>
                <p className="text-white font-medium text-sm">Push Notifications</p>
                <p className="text-slate-400 text-xs">
                  {notif.isEnabled ? '✅ Active – you will receive expiry alerts' : 'Enable to get expiry alerts'}
                </p>
              </div>
              <button
                onClick={notif.isEnabled ? notif.disablePush : notif.enablePush}
                disabled={notif.loading}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  notif.isEnabled ? 'bg-emerald-500' : 'bg-slate-600'
                } disabled:opacity-50`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                  notif.isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {notif.permission === 'denied' && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 space-y-2">
                <p className="text-amber-400 text-xs flex items-center gap-2">
                  <span>⚠️</span> Notifications are blocked in your browser.
                </p>
                <button 
                  onClick={notif.refreshStatus}
                  className="w-full py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-semibold rounded-lg border border-amber-500/30 transition-all"
                >
                  {notif.loading ? 'Syncing...' : 'Sync Permission Status'}
                </button>
                <p className="text-slate-500 text-[10px] italic">
                  To fix: Click the lock icon in the URL bar → Site Settings → Reset or Allow Notifications.
                </p>
              </div>
            )}

            {notif.isEnabled && (
              <button
                onClick={handleTest}
                disabled={testing}
                className="btn-secondary w-full text-sm py-2.5 flex items-center justify-center gap-2"
              >
                {testing ? (
                  <span className="animate-spin">⟳</span>
                ) : '🧪'}
                {testing ? 'Sending...' : 'Send Test Notification'}
              </button>
            )}

            {notif.error && (
              <p className="text-red-400 text-xs bg-red-500/10 p-3 rounded-xl">{notif.error}</p>
            )}
          </div>
        )}
      </div>

      {/* Alert schedule info */}
      <div className="card p-4">
        <h3 className="text-white font-semibold mb-3">📅 Alert Schedule</h3>
        <div className="space-y-2">
          {[
            { emoji: '📅', label: '2 days before', desc: 'First early warning', color: 'text-emerald-400' },
            { emoji: '⏰', label: '1 day before', desc: 'Tomorrow reminder', color: 'text-amber-400' },
            { emoji: '⚠️', label: 'On the day', desc: 'Expiry day alert', color: 'text-orange-400' },
            { emoji: '🚨', label: 'After expiry', desc: 'Expired alert', color: 'text-red-400' },
          ].map(row => (
            <div key={row.label} className="flex items-center gap-3 py-2 border-b border-slate-700/50 last:border-0">
              <span className="text-xl">{row.emoji}</span>
              <div className="flex-1">
                <p className={`font-medium text-sm ${row.color}`}>{row.label}</p>
                <p className="text-slate-500 text-xs">{row.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Urgent items */}
      {urgentItems.length > 0 && (
        <div className="card p-4">
          <h3 className="text-white font-semibold mb-3">⚡ Needs Attention ({urgentItems.length})</h3>
          <div className="space-y-2">
            {urgentItems.map(item => {
              const now = new Date(); now.setHours(0,0,0,0);
              const exp = new Date(item.expiryDate); exp.setHours(0,0,0,0);
              const diff = Math.floor((exp - now) / 86400000);
              return (
                <div key={item._id}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    diff < 0
                      ? 'bg-red-500/10 border-red-500/30'
                      : diff === 0
                        ? 'bg-orange-500/10 border-orange-500/30'
                        : 'bg-amber-500/10 border-amber-500/30'
                  }`}
                >
                  <span className="text-lg">{diff < 0 ? '🚨' : diff === 0 ? '⚠️' : '⏰'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{item.name}</p>
                    <p className={`text-xs ${diff < 0 ? 'text-red-400' : diff <= 1 ? 'text-orange-400' : 'text-amber-400'}`}>
                      {diff < 0 ? `Expired ${Math.abs(diff)}d ago` : diff === 0 ? 'Expires TODAY' : `${diff}d left`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
