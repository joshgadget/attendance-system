const LOCAL_API_ORIGIN = 'http://localhost:5000';
const PRODUCTION_API_ORIGIN = 'https://attendance-backend-xjiw.onrender.com';

const isLocalBrowserHost = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
};

const getDefaultApiOrigin = () => (isLocalBrowserHost() ? LOCAL_API_ORIGIN : PRODUCTION_API_ORIGIN);

export const normalizeApiUrl = (value) => {
  const fallback = `${getDefaultApiOrigin()}/api`;
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

export const getSocketBaseUrl = (value) => {
  const apiUrl = normalizeApiUrl(value);

  try {
    const parsed = new URL(apiUrl);
    parsed.pathname = parsed.pathname.replace(/\/api\/?$/, '').replace(/\/+$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch (error) {
    return apiUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '') || getDefaultApiOrigin();
  }
};
