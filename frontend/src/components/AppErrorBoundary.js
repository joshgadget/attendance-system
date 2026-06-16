import React from 'react';
import { reportClientError } from '../services/clientTelemetry';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportClientError(error, {
      source: 'react.error-boundary',
      componentStack: info?.componentStack || '',
    });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetSession = () => {
    try {
      window.localStorage.removeItem('token');
      window.localStorage.removeItem('refreshToken');
      window.localStorage.removeItem('user');
    } catch (error) {
      // Storage cleanup is best-effort only.
    }
    window.location.assign('/login');
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
        <section className="w-full max-w-md rounded-[1.5rem] border border-white/10 bg-white/10 p-6 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-200">Attendance System</p>
          <h1 className="mt-3 text-2xl font-bold">Workspace needs a quick reload</h1>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            The app caught a browser-side crash and reported it automatically.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={this.handleReload} className="rounded-2xl bg-blue-500 px-5 py-3 text-sm font-semibold text-white">
              Reload
            </button>
            <button type="button" onClick={this.handleResetSession} className="rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white">
              Reset session
            </button>
          </div>
        </section>
      </main>
    );
  }
}

export default AppErrorBoundary;
