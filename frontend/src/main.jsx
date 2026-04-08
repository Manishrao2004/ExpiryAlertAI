import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const isProd = import.meta.env.PROD;
const enableServiceWorker = isProd || import.meta.env.VITE_ENABLE_SW === 'true';

// Unregister any stale service workers during development unless explicitly enabled.
if (!enableServiceWorker && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
  });
}

// Register Service Worker in production, or in dev when explicitly enabled.
if (enableServiceWorker && 'serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      console.log('[App] Service Worker registered:', reg.scope);

      // Register periodic sync if supported
      if ('periodicSync' in reg) {
        try {
          await reg.periodicSync.register('expiry-check', { minInterval: 24 * 60 * 60 * 1000 });
          console.log('[App] Periodic sync registered');
        } catch (_) {}
      }

      // Listen for messages from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'NOTIFICATION_CLICK') {
          window.location.href = event.data.url || '/';
        }
      });
    } catch (err) {
      console.error('[App] SW registration failed:', err);
    }
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
