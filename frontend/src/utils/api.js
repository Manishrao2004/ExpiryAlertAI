import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: `${BASE}/api`,
  timeout: 30000,
});

// ─── Items ────────────────────────────────────────────────────────────────────
export const getItems = () => api.get('/items').then(r => r.data);
export const createItem = (data) => api.post('/items', data).then(r => r.data);
export const updateItem = (id, data) => api.put(`/items/${id}`, data).then(r => r.data);
export const deleteItem = (id) => api.delete(`/items/${id}`).then(r => r.data);
export const getStats = () => api.get('/items/stats/summary').then(r => r.data);

// ─── Upload / OCR ─────────────────────────────────────────────────────────────
export const uploadImage = (file, onProgress) => {
  const form = new FormData();
  form.append('image', file);
  return api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress && onProgress(Math.round((e.loaded / e.total) * 100))
  }).then(r => r.data);
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const getVapidKey = () => api.get('/notifications/vapid-public-key').then(r => r.data);
export const subscribe = (sub) => api.post('/notifications/subscribe', sub).then(r => r.data);
export const unsubscribe = (endpoint) => api.post('/notifications/unsubscribe', { endpoint }).then(r => r.data);
export const sendTestNotification = (endpoint) => api.post('/notifications/test', { endpoint }).then(r => r.data);
export const triggerCheck = () => api.post('/admin/check-notify').then(r => r.data);

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function imageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${BASE}/${path}`;
}

export default api;
