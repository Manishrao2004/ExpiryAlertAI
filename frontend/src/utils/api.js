import axios from 'axios';
import { getToken, removeToken } from './auth';

const isProd = import.meta.env.PROD;
const BASE = import.meta.env.VITE_API_URL || '';

if (isProd && !BASE) {
  console.warn('[API] Warning: VITE_API_URL is missing in production environment. Axios will fallback to relative paths, which may fail if the backend is on a separate domain (e.g., Render/Vercel split).');
}

const api = axios.create({
  baseURL: BASE ? `${BASE}/api` : '/api',
  timeout: 120000,
  withCredentials: true, // Crucial for secure CORS
});

// 
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

// 
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      removeToken();
      // Redirect to login (avoid full page reload loop)
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login');
      }
    }
    return Promise.reject(error);
  }
);

// 
export const getItems = () => api.get('/items').then(r => r.data);
export const updateItem = (id, data) => api.put(`/items/${id}`, data).then(r => r.data);
export const deleteItem = (id) => api.delete(`/items/${id}`).then(r => r.data);
export const getStats = () => api.get('/items/stats/summary').then(r => r.data);

/**
 * Create item — sends image file + item fields as multipart/form-data.
 * Image is saved to storage (local/Cloudinary) only at this moment.
 * @param {{ name, expiryDate, ocrText, detectedByOCR }} data
 * @param {File|null} imageFile — the original File object from scan (or null for manual entry)
 */
export const createItem = (data, imageFile = null) => {
  const form = new FormData();
  form.append('name',          data.name);
  form.append('expiryDate',    data.expiryDate);
  form.append('ocrText',       data.ocrText || '');
  form.append('detectedByOCR', String(!!data.detectedByOCR));
  if (imageFile) form.append('image', imageFile);
  return api.post('/items', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

// 
export const uploadImage = (file, onProgress) => {
  const form = new FormData();
  form.append('image', file);
  return api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => onProgress && onProgress(Math.round((e.loaded / e.total) * 100))
  }).then(r => r.data);
};

// 
export const getVapidKey = () => api.get('/notifications/vapid-public-key').then(r => r.data);
export const subscribe = (sub) => api.post('/notifications/subscribe', sub).then(r => r.data);
export const unsubscribe = (endpoint) => api.post('/notifications/unsubscribe', { endpoint }).then(r => r.data);
export const sendTestNotification = (endpoint) => api.post('/notifications/test', { endpoint }).then(r => r.data);
export const triggerCheck = () => api.post('/admin/check-notify').then(r => r.data);

// 
export const loginUser = (data) => api.post('/auth/login', data).then(r => r.data);
export const registerUser = (data) => api.post('/auth/register', data).then(r => r.data);
export const getMe = () => api.get('/auth/me').then(r => r.data);

// 
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export function imageUrl(path) {
  if (!path) return null;
  if (path.startsWith('http')) return path; // Cloudinary URL
  return `${BASE}/${path}`;             // Local path
}

export default api;
