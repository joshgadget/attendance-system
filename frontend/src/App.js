import React, { useCallback, useEffect, useRef, useState } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Provider, useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Clock3, Lock, ShieldAlert } from 'lucide-react';
import { io } from 'socket.io-client';
import store from './redux/store';
import api from './services/api';
import { fetchCurrentUser } from './redux/slices/authSlice';
import Login from './pages/Login';
import StudentSignup from './pages/StudentSignup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ForceResetPassword from './pages/ForceResetPassword';
import Dashboard from './pages/Dashboard';
import StudentCourseSelection from './pages/StudentCourseSelection';
import { ThemeProvider } from './theme/ThemeContext';

const PENDING_ATTENDANCE_STORAGE_KEY = 'attendance-system-pending-entry';
const SITE_MAINTENANCE_DEFAULTS = {
  badge: 'Temporary maintenance',
  title: 'Site temporarily unavailable',
  body: "We're applying a few updates right now. Please check back soon. All access is currently paused while maintenance is active.",
  footer: 'Everything is locked during maintenance',
};

const normalizeSiteMaintenance = (value = {}) => ({
  isMaintenanceEnabled: Boolean(value.isMaintenanceEnabled ?? value.enabled),
  badge: String(value.badge || '').trim() || SITE_MAINTENANCE_DEFAULTS.badge,
  title: String(value.title || '').trim() || SITE_MAINTENANCE_DEFAULTS.title,
  body: String(value.body || '').trim() || SITE_MAINTENANCE_DEFAULTS.body,
  footer: String(value.footer || '').trim() || SITE_MAINTENANCE_DEFAULTS.footer,
  updatedAt: value.updatedAt || null,
});

const getSocketBaseUrl = () => {
  const raw = String(process.env.REACT_APP_API_URL || 'http://localhost:5000/api').trim();
  return raw.replace(/\/api\/?$/, '') || 'http://localhost:5000';
};

const storePendingAttendanceEntry = (location) => {
  const params = new URLSearchParams(location.search);
  const sessionCode = (params.get('sessionCode') || params.get('s') || '').trim().toUpperCase();
  const attendancePass = (params.get('attendanceKey') || params.get('k') || params.get('attendancePass') || params.get('p') || '').trim().toUpperCase();

  if (!sessionCode) {
    return false;
  }

  window.localStorage.setItem(PENDING_ATTENDANCE_STORAGE_KEY, JSON.stringify({
    sessionCode,
    attendancePass,
    sourcePath: `${location.pathname}${location.search}`,
    savedAt: new Date().toISOString(),
  }));
  return true;
};

const MaintenanceScreen = ({ content }) => (
  <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_#1f2937,_#0f172a_38%,_#020617_100%)] px-4 py-10 text-white">
    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(148,163,184,0.12),transparent_30%,rgba(14,165,233,0.16)_70%,rgba(15,23,42,0.3))]" />
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 28, repeat: Infinity, ease: 'linear' }}
      className="absolute left-[-6rem] top-16 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl"
    />
    <motion.div
      animate={{ rotate: -360 }}
      transition={{ duration: 34, repeat: Infinity, ease: 'linear' }}
      className="absolute bottom-[-5rem] right-[-3rem] h-96 w-96 rounded-full bg-sky-500/10 blur-3xl"
    />

    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="relative z-10 w-full max-w-xl"
    >
      <div className="rounded-[2rem] border border-white/10 bg-white/10 p-8 text-center shadow-[0_30px_90px_rgba(2,6,23,0.65)] backdrop-blur-2xl sm:p-10">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-400 via-cyan-400 to-blue-500 shadow-[0_22px_50px_rgba(14,165,233,0.35)]">
          <ShieldAlert className="h-10 w-10 text-white" />
        </div>

        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-sky-100/90">
          <Clock3 className="h-4 w-4" />
          {content.badge}
        </p>

        <h1 className="mb-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {content.title}
        </h1>

        <p className="mx-auto max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
          {content.body}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <div className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-5 py-3 text-sm font-medium text-slate-200">
            <Lock className="h-4 w-4 text-sky-300" />
            {content.footer}
          </div>
        </div>
      </div>
    </motion.div>
  </div>
);

const AuthBootstrap = ({ children }) => {
  const dispatch = useDispatch();
  const { token, bootstrapped } = useSelector((state) => state.auth);
  const restoreRequestedRef = useRef(false);

  useEffect(() => {
    if (token && !bootstrapped && !restoreRequestedRef.current) {
      restoreRequestedRef.current = true;
      dispatch(fetchCurrentUser());
    }
  }, [bootstrapped, dispatch, token]);

  return children;
};

const PrivateRoute = ({ children }) => {
  const { isAuthenticated, bootstrapped } = useSelector((state) => state.auth);
  if (!bootstrapped && isAuthenticated) {
    return children;
  }
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, user, bootstrapped } = useSelector((state) => state.auth);
  if (isAuthenticated && user?.mustResetPassword) {
    return <Navigate to="/force-reset" replace />;
  }
  if (!bootstrapped && isAuthenticated && !user) {
    return children;
  }
  return isAuthenticated && user ? <Navigate to="/dashboard" replace /> : children;
};

const AttendanceEntryRoute = () => {
  const location = useLocation();
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const needsReset = isAuthenticated && user?.mustResetPassword;
  const hasPendingEntry = storePendingAttendanceEntry(location);

  if (!hasPendingEntry) {
    return <Navigate to={needsReset ? '/force-reset' : (isAuthenticated ? '/dashboard' : '/login')} replace />;
  }

  if (needsReset) {
    return <Navigate to="/force-reset" replace />;
  }

  return <Navigate to={isAuthenticated ? '/dashboard?tab=attendance' : '/login?next=attendance'} replace />;
};

const AppRoutes = () => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const { user } = useSelector((state) => state.auth);
  const needsReset = isAuthenticated && user?.mustResetPassword;

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/attendance-entry" element={<AttendanceEntryRoute />} />
      <Route path="/signup" element={<PublicRoute><StudentSignup /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
      <Route path="/force-reset" element={<PrivateRoute><ForceResetPassword /></PrivateRoute>} />
      <Route path="/dashboard" element={needsReset ? <Navigate to="/force-reset" replace /> : <PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/course-selection" element={needsReset ? <Navigate to="/force-reset" replace /> : <PrivateRoute><StudentCourseSelection /></PrivateRoute>} />
      <Route path="/" element={<Navigate to={needsReset ? '/force-reset' : (isAuthenticated ? '/dashboard' : '/login')} replace />} />
      <Route path="*" element={<Navigate to={needsReset ? '/force-reset' : (isAuthenticated ? '/dashboard' : '/login')} replace />} />
    </Routes>
  );
};

const AppShell = () => {
  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const [siteMaintenance, setSiteMaintenance] = useState({ ...SITE_MAINTENANCE_DEFAULTS, isMaintenanceEnabled: false, loading: true });

  const loadSiteMaintenance = useCallback(async () => {
    try {
      const response = await api.get('/site/maintenance');
      setSiteMaintenance({
        ...SITE_MAINTENANCE_DEFAULTS,
        ...normalizeSiteMaintenance(response.data.data || {}),
        loading: false,
      });
    } catch (error) {
      setSiteMaintenance((current) => ({
        ...current,
        loading: false,
      }));
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    let socket = null;

    loadSiteMaintenance();

    const refreshTimer = window.setInterval(() => {
      if (isMounted) {
        loadSiteMaintenance();
      }
    }, 45000);

    try {
      socket = io(getSocketBaseUrl(), {
        transports: ['websocket'],
        withCredentials: false,
      });

      socket.on('site_maintenance_updated', (payload) => {
        if (!isMounted) {
          return;
        }

        setSiteMaintenance({
          ...SITE_MAINTENANCE_DEFAULTS,
          ...normalizeSiteMaintenance(payload || {}),
          loading: false,
        });
      });
    } catch (error) {
      socket = null;
    }

    return () => {
      isMounted = false;
      window.clearInterval(refreshTimer);
      if (socket) {
        socket.disconnect();
      }
    };
  }, [loadSiteMaintenance]);

  const isAdmin = Boolean(isAuthenticated && user?.role === 'admin');
  const showMaintenance = Boolean(siteMaintenance.isMaintenanceEnabled && !isAdmin);
  const showingLoadingState = siteMaintenance.loading;

  return (
    <AuthBootstrap>
      {showingLoadingState ? (
        <MaintenanceScreen
          content={{
            ...SITE_MAINTENANCE_DEFAULTS,
            badge: 'Loading site status',
            title: 'Preparing the workspace',
            body: 'Checking whether the site is open or in maintenance mode.',
            footer: 'Please wait a moment',
          }}
        />
      ) : showMaintenance ? (
        <MaintenanceScreen content={siteMaintenance} />
      ) : (
        <AppRoutes />
      )}
    </AuthBootstrap>
  );
};

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <Router>
          <AppShell />
        </Router>
      </ThemeProvider>
    </Provider>
  );
}

export default App;
