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
  timeout: 20000,
  withCredentials: false,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

api.interceptors.request.use((config) => {
  let token = null;
  try {
    token = window.localStorage.getItem('token');
  } catch (error) {
    token = null;
  }
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      error.userMessage = 'The request took too long. Please try again.';
      return Promise.reject(error);
    }

    if (!error.response) {
      error.userMessage = 'Unable to reach the server. Check your connection and try again.';
      return Promise.reject(error);
    }

    error.userMessage = error.response?.data?.message || 'Something went wrong. Please try again.';
    return Promise.reject(error);
  }
);

export default api;
