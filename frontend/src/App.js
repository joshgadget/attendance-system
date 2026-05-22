import React, { useEffect, useRef } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Provider, useDispatch, useSelector } from 'react-redux';
import store from './redux/store';
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

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider>
        <Router>
          <AuthBootstrap>
            <AppRoutes />
          </AuthBootstrap>
        </Router>
      </ThemeProvider>
    </Provider>
  );
}

export default App;
