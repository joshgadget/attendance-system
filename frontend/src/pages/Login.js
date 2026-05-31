import React, { useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, GraduationCap, ArrowRight } from 'lucide-react';
import { login } from '../redux/slices/authSlice';
import { useTheme } from '../theme/ThemeContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const dispatch = useDispatch();
  const location = useLocation();
  const { loading, error } = useSelector((state) => state.auth);
  const { isDark } = useTheme();
  const isAttendanceEntry = useMemo(() => new URLSearchParams(location.search).get('next') === 'attendance', [location.search]);

  const handleSubmit = (event) => {
    event.preventDefault();
    dispatch(login({ email, password }));
  };

  return (
    <div
      className={`relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 ${
        isDark
          ? 'bg-[radial-gradient(circle_at_top,_#1e293b,_#111827_35%,_#020617_80%)]'
          : 'bg-[radial-gradient(circle_at_top,_#dbeafe,_#93c5fd_35%,_#2563eb_75%,_#1e3a8a_100%)]'
      }`}
    >
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }} className={`absolute left-[-4rem] top-12 h-72 w-72 rounded-full blur-3xl ${isDark ? 'bg-slate-500/20' : 'bg-white/35'}`} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 25, repeat: Infinity, ease: 'linear' }} className={`absolute bottom-[-5rem] right-[-2rem] h-96 w-96 rounded-full blur-3xl ${isDark ? 'bg-blue-900/20' : 'bg-sky-200/30'}`} />
      <div className={`absolute inset-0 ${isDark ? 'bg-[linear-gradient(135deg,rgba(15,23,42,0.5),transparent_45%,rgba(15,23,42,0.4))]' : 'bg-[linear-gradient(135deg,rgba(255,255,255,0.32),transparent_45%,rgba(30,64,175,0.18))]'}`} />

      {[...Array(6)].map((_, index) => (
        <motion.div
          key={index}
          className={`absolute h-2 w-2 rounded-full ${isDark ? 'bg-slate-200/40' : 'bg-white/70'}`}
          animate={{ y: [0, -100, 0], x: [0, Math.random() * 50 - 25, 0], opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: index * 0.5 }}
          style={{ left: `${10 + index * 15}%`, top: `${20 + (index % 3) * 25}%` }}
        />
      ))}

      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative z-10 w-full max-w-md">
        <div className={`rounded-[2rem] border p-8 backdrop-blur-xl ${isDark ? 'border-slate-700/80 bg-slate-900/75 shadow-[0_30px_80px_rgba(2,6,23,0.7)]' : 'border-white/70 bg-white/85 shadow-[0_30px_80px_rgba(30,64,175,0.28)]'}`}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }} className="mb-6 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-300 shadow-[0_20px_45px_rgba(37,99,235,0.35)]">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className={`mb-2 text-center text-3xl font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
            Attendance System
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className={`mb-8 text-center ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Sign in to continue
          </motion.p>

          {isAttendanceEntry && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className={`mb-6 rounded-2xl border px-4 py-4 text-center text-sm ${isDark ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              Continue to attendance. Your session details will be ready after sign in.
            </motion.div>
          )}

          {error && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="relative">
              <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className={`w-full rounded-2xl border px-4 py-4 pl-12 shadow-[0_10px_30px_rgba(148,163,184,0.12)] transition-all focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400' : 'border-blue-100 bg-white text-slate-900 placeholder:text-slate-400'}`} required />
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }} className="relative">
              <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className={`w-full rounded-2xl border px-4 py-4 pl-12 pr-12 shadow-[0_10px_30px_rgba(148,163,184,0.12)] transition-all focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400' : 'border-blue-100 bg-white text-slate-900 placeholder:text-slate-400'}`} required />
              <button type="button" onClick={() => setShowPassword((current) => !current)} className={`absolute right-4 top-1/2 -translate-y-1/2 transition-colors hover:text-blue-600 ${isDark ? 'text-slate-300' : 'text-slate-400'}`}>
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </motion.div>

            <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading} className="w-full rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 py-4 font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition-all hover:shadow-[0_22px_50px_rgba(37,99,235,0.45)] disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="mx-auto h-6 w-6 rounded-full border-2 border-white/30 border-t-white" /> : 'Sign In'}
            </motion.button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/forgot-password" className={`text-sm font-medium transition ${isDark ? 'text-blue-300 hover:text-blue-200' : 'text-blue-700 hover:text-blue-800'}`}>
              Forgot password?
            </Link>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className={`mt-8 rounded-[1.5rem] border p-5 text-center ${isDark ? 'border-slate-700 bg-slate-800/70' : 'border-blue-100 bg-blue-50/80'}`}>
            <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Need an account? Register with your matric number.</p>
            <Link to="/signup" className={`mt-4 inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition ${isDark ? 'border-slate-600 bg-slate-900 text-blue-300 hover:border-slate-500 hover:bg-slate-800' : 'border-blue-200 bg-white text-blue-700 hover:border-blue-300 hover:bg-blue-100'}`}>
              Open student signup
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
