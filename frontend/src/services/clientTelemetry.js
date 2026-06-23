import { normalizeApiUrl } from './apiConfig';

const API_URL = normalizeApiUrl(process.env.REACT_APP_API_URL);
const RELEASE = process.env.REACT_APP_RELEASE || process.env.REACT_APP_GIT_SHA || 'web';

const postClientEvent = (path, payload) => {
  const body = JSON.stringify({
    ...payload,
    release: RELEASE,
    url: typeof window !== 'undefined' ? window.location.href : '',
  });

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const sent = navigator.sendBeacon(`${API_URL}${path}`, new Blob([body], { type: 'application/json' }));
    if (sent) {
      return;
    }
  }

  fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => null);
};

export const reportClientError = (error, context = {}) => {
  postClientEvent('/client-events/errors', {
    source: context.source || 'frontend',
    message: error?.message || String(error || 'Unknown client error'),
    stack: error?.stack || '',
    componentStack: context.componentStack || '',
  });
};

export const reportWebVitalMetric = (metric) => {
  postClientEvent('/client-events/metrics', {
    name: metric?.name,
    value: metric?.value,
    rating: metric?.rating,
    delta: metric?.delta,
    id: metric?.id,
    navigationType: metric?.navigationType,
  });
};

export const installGlobalErrorHandlers = () => {
  if (typeof window === 'undefined' || window.__attendanceTelemetryInstalled) {
    return;
  }

  window.__attendanceTelemetryInstalled = true;
  window.addEventListener('error', (event) => {
    reportClientError(event.error || new Error(event.message), { source: 'window.error' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason || new Error('Unhandled promise rejection'), { source: 'unhandledrejection' });
  });
};
