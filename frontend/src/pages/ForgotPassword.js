import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import api from '../services/api';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      setLoading(true);
      setError('');
      const response = await api.post('/auth/forgot-password', { email: email.trim() });
      setMessage(response.data.message || 'If this email exists, a reset link has been sent');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Password reset request failed');
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

        <h1 className="mt-7 text-3xl font-bold tracking-tight text-slate-900">Reset your password</h1>
        <p className="mt-3 text-sm text-slate-600">Enter your account email and we will send a secure reset link.</p>

        {error && <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
        {message && <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email address"
              className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-4 pl-12 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 py-4 font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.35)] transition hover:shadow-[0_22px_50px_rgba(37,99,235,0.45)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-5 w-5" />
            {loading ? 'Sending reset link...' : 'Send reset link'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForgotPassword;
