import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, GraduationCap, Moon, Sun } from 'lucide-react';
import { login } from '../redux/slices/authSlice';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') !== 'light');
  const dispatch = useDispatch();
  const { loading, error } = useSelector((state) => state.auth);

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const handleSubmit = (e) => {
    e.preventDefault();
    dispatch(login({ email, password }));
  };

  return (
    <div
      className={`min-h-screen flex items-center justify-center relative overflow-hidden ${
        isDark
          ? 'bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-950'
          : 'bg-gradient-to-br from-slate-100 via-blue-100 to-cyan-100'
      }`}
    >
      <button
        type="button"
        onClick={() => setIsDark((current) => !current)}
        className={`absolute right-6 top-6 z-20 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition ${
          isDark
            ? 'border-white/30 bg-white/10 text-white hover:bg-white/20'
            : 'border-blue-200 bg-white/90 text-blue-700 hover:bg-blue-50'
        }`}
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        {isDark ? 'Light mode' : 'Dark mode'}
      </button>

      {/* Animated Background Shapes */}
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
        className={`absolute top-20 left-20 w-72 h-72 rounded-full blur-3xl ${isDark ? 'bg-indigo-400/10' : 'bg-white/10'}`}
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
        className={`absolute bottom-20 right-20 w-96 h-96 rounded-full blur-3xl ${isDark ? 'bg-cyan-300/10' : 'bg-blue-300/20'}`}
      />

      {/* Floating Particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className={`absolute w-2 h-2 rounded-full ${isDark ? 'bg-cyan-200/20' : 'bg-blue-500/25'}`}
          animate={{
            y: [0, -100, 0],
            x: [0, Math.random() * 50 - 25, 0],
            opacity: [0.2, 1, 0.2],
          }}
          transition={{
            duration: 3 + Math.random() * 2,
            repeat: Infinity,
            delay: i * 0.5,
          }}
          style={{
            left: `${10 + i * 15}%`,
            top: `${20 + (i % 3) * 25}%`,
          }}
        />
      ))}

      {/* Main Card */}
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div
          className={`backdrop-blur-xl border rounded-3xl shadow-2xl p-8 ${
            isDark ? 'bg-white/5 border-white/15' : 'bg-white/85 border-blue-200'
          }`}
        >
          {/* Logo Section */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="flex justify-center mb-6"
          >
            <div className="w-20 h-20 bg-gradient-to-tr from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
              <GraduationCap className="w-10 h-10 text-white" />
            </div>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className={`text-3xl font-bold text-center mb-2 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}
          >
            Attendance System
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className={`text-center mb-8 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
          >
            Smart attendance tracking for modern education
          </motion.p>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="mb-6 p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-200 text-sm text-center"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="relative"
            >
              <Mail className={`absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 ${isDark ? 'text-slate-400' : 'text-blue-500/70'}`} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className={`w-full pl-12 pr-4 py-4 rounded-xl transition-all focus:outline-none ${
                  isDark
                    ? 'bg-slate-900/40 border border-slate-600/40 text-slate-100 placeholder-slate-400 focus:border-cyan-300/40 focus:bg-slate-900/60'
                    : 'bg-white border border-blue-100 text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:bg-white'
                }`}
                required
              />
            </motion.div>

            {/* Password Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
              className="relative"
            >
              <Lock className={`absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 ${isDark ? 'text-slate-400' : 'text-blue-500/70'}`} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className={`w-full pl-12 pr-12 py-4 rounded-xl transition-all focus:outline-none ${
                  isDark
                    ? 'bg-slate-900/40 border border-slate-600/40 text-slate-100 placeholder-slate-400 focus:border-cyan-300/40 focus:bg-slate-900/60'
                    : 'bg-white border border-blue-100 text-slate-900 placeholder-slate-400 focus:border-blue-400 focus:bg-white'
                }`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-4 top-1/2 transform -translate-y-1/2 transition-colors ${
                  isDark ? 'text-slate-400 hover:text-slate-100' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </motion.div>

            {/* Sign In Button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className={`w-full py-4 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                isDark ? 'bg-gradient-to-r from-cyan-500 to-blue-600' : 'bg-gradient-to-r from-blue-600 to-cyan-500'
              }`}
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full mx-auto"
                />
              ) : (
                'Sign In'
              )}
            </motion.button>
          </form>

          {/* Footer */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-8 text-center"
          >
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              Don't have an account?{' '}
              <button className={`font-medium transition-colors ${isDark ? 'text-cyan-300 hover:text-cyan-200' : 'text-blue-700 hover:text-blue-800'}`}>
                Contact Admin
              </button>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
