import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import api from '../services/api';

const ResetPassword = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get('token') || '', [params]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!token) {
      setError('Reset token is missing. Request a new reset link.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await api.post('/auth/reset-password', { token, password });
      setMessage('Password reset successful. Redirecting to login...');
      setTimeout(() => navigate('/login'), 1200);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Password reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_#dbeafe,_#93c5fd_35%,_#2563eb_75%,_#1e3a8a_100%)] px-4 py-10">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_30px_80px_rgba(30,64,175,0.28)] backdrop-blur-xl">
        <Link to="/login" className="inline-flex items-center gap-2 rounded-2xl border border-blue-100 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50">
          <ArrowLeft className="h-4 w-4" />
          Back to login
        </Link>

        <h1 className="mt-7 text-3xl font-bold tracking-tight text-slate-900">Create a new password</h1>
        <p className="mt-3 text-sm text-slate-600">Set a strong password to secure your account access.</p>

        {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
        {message && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New password"
              className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-4 pl-12 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-4 pl-12 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 py-4 font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition hover:shadow-[0_22px_50px_rgba(37,99,235,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Updating password...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ResetPassword;
