import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, GraduationCap, ArrowRight } from 'lucide-react';
import { login } from '../redux/slices/authSlice';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const dispatch = useDispatch();
  const { loading, error } = useSelector((state) => state.auth);

  const handleSubmit = (event) => {
    event.preventDefault();
    dispatch(login({ email, password }));
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_#dbeafe,_#93c5fd_35%,_#2563eb_75%,_#1e3a8a_100%)] px-4 py-10">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: 'linear' }} className="absolute left-[-4rem] top-12 h-72 w-72 rounded-full bg-white/35 blur-3xl" />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 25, repeat: Infinity, ease: 'linear' }} className="absolute bottom-[-5rem] right-[-2rem] h-96 w-96 rounded-full bg-sky-200/30 blur-3xl" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.32),transparent_45%,rgba(30,64,175,0.18))]" />

      {[...Array(6)].map((_, index) => (
        <motion.div
          key={index}
          className="absolute h-2 w-2 rounded-full bg-white/70"
          animate={{ y: [0, -100, 0], x: [0, Math.random() * 50 - 25, 0], opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, delay: index * 0.5 }}
          style={{ left: `${10 + index * 15}%`, top: `${20 + (index % 3) * 25}%` }}
        />
      ))}

      <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }} className="relative z-10 w-full max-w-md">
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-8 shadow-[0_30px_80px_rgba(30,64,175,0.28)] backdrop-blur-xl">
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }} className="mb-6 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-600 via-sky-500 to-cyan-300 shadow-[0_20px_45px_rgba(37,99,235,0.35)]">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>
          </motion.div>

          <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mb-2 text-center text-3xl font-bold tracking-tight text-slate-900">
            Attendance System
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="mb-8 text-center text-slate-600">
            Smart attendance tracking for modern education
          </motion.p>

          {error && (
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="relative">
              <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-4 pl-12 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] placeholder:text-slate-400 transition-all focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100" required />
            </motion.div>

            <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6 }} className="relative">
              <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
              <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-4 pl-12 pr-12 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] placeholder:text-slate-400 transition-all focus:border-blue-400 focus:outline-none focus:ring-4 focus:ring-blue-100" required />
              <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-blue-600">
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </motion.div>

            <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={loading} className="w-full rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 py-4 font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition-all hover:shadow-[0_22px_50px_rgba(37,99,235,0.45)] disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="mx-auto h-6 w-6 rounded-full border-2 border-white/30 border-t-white" /> : 'Sign In'}
            </motion.button>
          </form>

          <div className="mt-4 text-center">
            <Link to="/forgot-password" className="text-sm font-medium text-blue-700 transition hover:text-blue-800">
              Forgot password?
            </Link>
          </div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="mt-8 rounded-[1.5rem] border border-blue-100 bg-blue-50/80 p-5 text-center">
            <p className="text-sm text-slate-600">Students can create their own account using a verified matric number.</p>
            <Link to="/signup" className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100">
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
