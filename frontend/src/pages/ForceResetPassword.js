import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldCheck } from 'lucide-react';
import api from '../services/api';
import { fetchCurrentUser } from '../redux/slices/authSlice';

const ForceResetPassword = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await api.post('/auth/change-password', { newPassword: password });
      await dispatch(fetchCurrentUser());
      setSuccess('Password updated successfully. Redirecting to dashboard...');
      setTimeout(() => navigate('/dashboard'), 900);
    } catch (err) {
      setError(err.response?.data?.message || 'Password update failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#dbeafe,_#93c5fd_35%,_#2563eb_75%,_#1e3a8a_100%)] px-4 py-10">
      <div className="w-full max-w-md rounded-[2rem] border border-white/70 bg-white/90 p-8 shadow-[0_30px_80px_rgba(30,64,175,0.28)] backdrop-blur-xl">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-400 text-white">
          <ShieldCheck className="h-8 w-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Create a new password</h1>
        <p className="mt-2 text-sm text-slate-600">Your account was reactivated. Please set a new password before continuing.</p>

        {error && <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
        {success && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="New password"
              className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-4 pl-12 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              required
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-4 pl-12 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
              required
            />
          </div>
          <button type="submit" disabled={submitting} className="w-full rounded-2xl bg-blue-700 py-4 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">
            {submitting ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForceResetPassword;
