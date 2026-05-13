import React, { useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider, useDispatch, useSelector } from 'react-redux';
import store from './redux/store';
import { fetchCurrentUser } from './redux/slices/authSlice';
import Login from './pages/Login';
import StudentSignup from './pages/StudentSignup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import ForceResetPassword from './pages/ForceResetPassword';
import Dashboard from './pages/Dashboard';
import { ThemeProvider } from './theme/ThemeContext';

const AuthBootstrap = ({ children }) => {
  const dispatch = useDispatch();
  const { token, user, bootstrapped } = useSelector((state) => state.auth);

  useEffect(() => {
    if (token && !user) {
      dispatch(fetchCurrentUser());
    }
  }, [dispatch, token, user]);
  if (token && !user && !bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/5 px-8 py-6 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-blue-300/40 border-t-blue-300" />
          <p className="text-sm text-slate-200">Restoring your session...</p>
        </div>
      </div>
    );
  }

  return children;
};

const PrivateRoute = ({ children }) => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  if (isAuthenticated && user?.mustResetPassword) {
    return <Navigate to="/force-reset" replace />;
  }
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
};

const AppRoutes = () => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  const { user } = useSelector((state) => state.auth);
  const needsReset = isAuthenticated && user?.mustResetPassword;

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/signup" element={<PublicRoute><StudentSignup /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
      <Route path="/force-reset" element={<PrivateRoute><ForceResetPassword /></PrivateRoute>} />
      <Route path="/dashboard" element={needsReset ? <Navigate to="/force-reset" replace /> : <PrivateRoute><Dashboard /></PrivateRoute>} />
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
