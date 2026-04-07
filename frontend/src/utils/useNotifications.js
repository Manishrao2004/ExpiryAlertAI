import { useState, useEffect, useCallback, useRef } from 'react';
import { getVapidKey, subscribe, unsubscribe, sendTestNotification, urlBase64ToUint8Array } from '../utils/api';

export function useNotifications() {
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const subRef = useRef(null);

  const checkSubscription = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      // Re-sync basic state
      setPermission(Notification.permission);
      
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        setSubscription(existing);
        subRef.current = existing;
      } else {
        setSubscription(null);
        subRef.current = null;
      }
    } catch (e) {
      console.warn('Subscription check failed:', e);
    }
  }, []);

  // Check on mount
  useEffect(() => { checkSubscription(); }, [checkSubscription]);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    await checkSubscription();
    setLoading(false);
    return Notification.permission;
  }, [checkSubscription]);

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      setError('Notifications not supported in this browser');
      return false;
    }
    
    // Always re-sync local state first
    setPermission(Notification.permission);
    
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
      setError('Permission denied in browser. Please click the lock icon in the URL bar to reset.');
      return false;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, []);

  const enablePush = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const granted = await requestPermission();
      if (!granted) return false;

      // Ensure SW is ready
      const reg = await navigator.serviceWorker.ready;
      if (!reg) throw new Error('Service Worker not ready. Try reloading the page.');

      // Get VAPID key from server
      const { publicKey } = await getVapidKey();
      if (!publicKey) throw new Error('Could not fetch server public key');
      
      const applicationServerKey = urlBase64ToUint8Array(publicKey);

      // Subscribe to push
      const pushSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey
      });

      const subJSON = pushSub.toJSON();

      // Register on backend
      await subscribe({
        endpoint: subJSON.endpoint,
        keys: subJSON.keys
      });

      setSubscription(pushSub);
      subRef.current = pushSub;
      return true;
    } catch (err) {
      console.error('Push error:', err);
      // Helpful error mapping
      let msg = err.message || 'Failed to enable notifications';
      if (msg.includes('registration')) msg = 'Service Worker registration issue. Please reload.';
      
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  }, [requestPermission]);

  const disablePush = useCallback(async () => {
    setLoading(true);
    try {
      if (subRef.current) {
        await unsubscribe(subRef.current.endpoint);
        await subRef.current.unsubscribe();
      }
      setSubscription(null);
      subRef.current = null;
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const sendTest = useCallback(async () => {
    if (!subRef.current) return;
    setLoading(true);
    try {
      await sendTestNotification(subRef.current.endpoint);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  // Also show in-browser notification (fallback when app is open)
  const showLocalNotification = useCallback((title, body, options = {}) => {
    if (Notification.permission === 'granted') {
      const n = new Notification(title, {
        body,
        icon: '/icon-192.png',
        badge: '/badge-96.png',
        ...options
      });
      n.onclick = () => { window.focus(); n.close(); };
    }
  }, []);

  const isSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const isEnabled = !!subscription && permission === 'granted';

  return {
    permission,
    subscription,
    isEnabled,
    isSupported,
    loading,
    error,
    enablePush,
    disablePush,
    refreshStatus,
    sendTest,
    showLocalNotification,
    setError
  };
}
