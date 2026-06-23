import axios from 'axios';
import { normalizeApiUrl } from './apiConfig';

const API_URL = normalizeApiUrl(process.env.REACT_APP_API_URL);
const NETWORK_RETRY_DELAYS_MS = [750, 1800];
const RETRYABLE_METHODS = new Set(['get', 'head', 'options']);

const wait = (delayMs) => new Promise((resolve) => {
  setTimeout(resolve, delayMs);
});

const isRetryableNetworkError = (error) => {
  if (!error?.config || error.response) {
    return false;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  const method = String(error.config.method || 'get').toLowerCase();
  if (!RETRYABLE_METHODS.has(method)) {
    return false;
  }

  if (error.code === 'ECONNABORTED') {
    return false;
  }

  const detail = `${error.code || ''} ${error.message || ''}`;
  return /ERR_NETWORK|ERR_NETWORK_CHANGED|Network Error|Failed to fetch|Load failed/i.test(detail);
};

const api = axios.create({
  baseURL: API_URL,
  timeout: 45000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
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
  async (error) => {
    if (isRetryableNetworkError(error)) {
      const retryCount = error.config.__networkRetryCount || 0;
      const nextDelay = NETWORK_RETRY_DELAYS_MS[retryCount];

      if (nextDelay) {
        error.config.__networkRetryCount = retryCount + 1;
        await wait(nextDelay);
        return api(error.config);
      }
    }

    if (error.code === 'ECONNABORTED') {
      error.userMessage = 'The request took too long. Please try again.';
      return Promise.reject(error);
    }

    if (!error.response) {
      error.userMessage = 'The attendance server could not be reached. Please refresh in a moment.';
      return Promise.reject(error);
    }

    error.userMessage = error.response?.data?.message || 'Something went wrong. Please try again.';
    return Promise.reject(error);
  }
);

export default api;
