import axios from 'axios';

const normalizeApiUrl = (value) => {
  const fallback = 'http://localhost:5000/api';
  const raw = String(value || '').trim();
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.pathname = pathname.endsWith('/api') ? pathname : `${pathname || ''}/api`;
    return parsed.toString().replace(/\/+$/, '');
  } catch (error) {
    const trimmed = raw.replace(/\/+$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
};

const API_URL = normalizeApiUrl(process.env.REACT_APP_API_URL);

const api = axios.create({
  baseURL: API_URL,
  withCredentials: false,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
