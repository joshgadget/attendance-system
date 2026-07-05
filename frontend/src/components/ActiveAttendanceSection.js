import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import api from '../services/api';
import QRCode from 'qrcode';
import { useTheme } from '../theme/ThemeContext';

const formatTime = (t) => {
  if (!t) return '--';
  try {
    const d = new Date(`2000-01-01T${t}`);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  } catch { return t; }
};

const formatDate = (d) => {
  if (!d) return '--';
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; }
};

const formatDateTime = (d) => {
  if (!d) return '--';
  try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; }
};

const distanceLabel = (meters) => {
  if (meters == null) return '--';
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)}km`;
};

const resultBadge = (attempt) => {
  if (attempt.accepted) {
    if (attempt.attemptNumber >= 2) return { label: 'Late', tone: 'amber-500 bg-amber-50 text-amber-700' };
    return { label: 'Present', tone: 'emerald-500 bg-emerald-50 text-emerald-700' };
  }
  const reason = (attempt.rejectionReason || '').toLowerCase();
  if (reason.includes('outside') || reason.includes('radius')) return { label: 'Outside Radius', tone: 'rose-500 bg-rose-50 text-rose-700' };
  if (reason.includes('permission') || reason.includes('gps') || reason.includes('location')) return { label: 'Location Denied', tone: 'orange-500 bg-orange-50 text-orange-700' };
  if (reason.includes('expired') || reason.includes('ended')) return { label: 'Expired Session', tone: 'slate-500 bg-slate-50 text-slate-700' };
  if (reason.includes('invalid') || reason.includes('not found')) return { label: 'Invalid Session', tone: 'slate-500 bg-slate-50 text-slate-700' };
  return { label: 'Rejected', tone: 'rose-500 bg-rose-50 text-rose-700' };
};

export default function ActiveAttendanceSection({ sessions, onRefresh, onCloseSession }) {
  const { isDark } = useTheme();
  const activeSessions = useMemo(() => (
    Array.isArray(sessions) ? sessions.filter((s) => s.status === 'active') : []
  ), [sessions]);

  const [sessionDetails, setSessionDetails] = useState({});
  const [attemptLogs, setAttemptLogs] = useState({});
  const [qrUrls, setQrUrls] = useState({});
  const [expandedId, setExpandedId] = useState(null);
  const [confirmCloseId, setConfirmCloseId] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const [now, setNow] = useState(Date.now());
  const activeRef = useRef(activeSessions);
  const attemptLogsRef = useRef(attemptLogs);

  useEffect(() => { activeRef.current = activeSessions; }, [activeSessions]);
  useEffect(() => { attemptLogsRef.current = attemptLogs; }, [attemptLogs]);

  const loadAttemptLogs = useCallback(async (sessionId) => {
    try {
      const res = await api.get(`/attendance/attempts?sessionId=${sessionId}&limit=500`);
      setAttemptLogs((prev) => ({ ...prev, [sessionId]: res.data.data || [] }));
    } catch { /* ignore */ }
  }, []);

  const loadSessionDetail = useCallback(async (session) => {
    try {
      const res = await api.get(`/attendance/sessions/${session.id}`);
      const detail = res.data.data;
      setSessionDetails((prev) => ({ ...prev, [session.id]: detail }));
      const qrContent = session.sessionKey;
      QRCode.toDataURL(qrContent, { width: 280, margin: 2, errorCorrectionLevel: 'H', color: { dark: '#000000', light: '#ffffff' } })
        .then((url) => setQrUrls((prev) => ({ ...prev, [session.id]: url })))
        .catch(() => {});
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    activeSessions.forEach((s) => {
      if (!sessionDetails[s.id]) loadSessionDetail(s);
      if (!attemptLogs[s.id]) loadAttemptLogs(s.id);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessions.length, loadSessionDetail, loadAttemptLogs]);

  const refreshAll = useCallback(() => {
    activeRef.current.forEach((s) => {
      loadAttemptLogs(s.id);
      loadSessionDetail(s);
    });
  }, [loadAttemptLogs, loadSessionDetail]);

  useEffect(() => {
    if (activeSessions.length === 0) return;
    const interval = window.setInterval(refreshAll, 20000);
    return () => window.clearInterval(interval);
  }, [activeSessions.length, refreshAll]);

  useEffect(() => {
    if (activeSessions.length === 0) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [activeSessions.length]);

  const handleStop = useCallback(async (sessionId) => {
    setBusyAction(`stop-${sessionId}`);
    try {
      await onCloseSession(sessionId);
      setConfirmCloseId(null);
    } finally {
      setBusyAction('');
    }
  }, [onCloseSession]);

  const statsForSession = useCallback((sessionId) => {
    const detail = sessionDetails[sessionId];
    const logs = attemptLogs[sessionId] || [];
    return {
      totalMarked: detail?.attendanceStats?.markedCount || detail?.attendances?.length || 0,
      expected: detail?.attendanceStats?.expectedCount || 0,
      present: detail?.attendances?.filter((a) => a.status === 'present').length || 0,
      late: detail?.attendances?.filter((a) => a.status === 'late').length || 0,
      rejected: logs.filter((a) => !a.accepted).length,
    };
  }, [sessionDetails, attemptLogs]);

  const cardBorder = isDark ? 'border-slate-700 bg-slate-900/80' : 'border-white/70 bg-white/90';
  const textPrimary = isDark ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-500';
  const labelClass = 'text-xs font-semibold uppercase tracking-[0.18em]';

  return (
    <section className="mb-10 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
        </div>
        <div>
          <h2 className={`text-xl font-bold ${textPrimary}`}>Active Attendance</h2>
          <p className={`text-sm ${textSecondary}`}>{activeSessions.length > 0 ? `${activeSessions.length} session${activeSessions.length > 1 ? 's' : ''} running` : 'Monitor live sessions here'}</p>
        </div>
      </div>

      {activeSessions.length === 0 && (
        <div className={`rounded-[2rem] border p-8 text-center backdrop-blur-xl ${cardBorder}`}>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
            <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>
          </div>
          <h3 className={`mt-4 text-lg font-bold ${textPrimary}`}>No active attendance session</h3>
          <p className={`mt-2 max-w-md mx-auto text-sm leading-6 ${textSecondary}`}>Create a session from one of your courses to begin taking attendance.</p>
        </div>
      )}

      {activeSessions.map((session) => {
        const stats = statsForSession(session.id);
        const expiresAt = session.expiresAt ? new Date(session.expiresAt) : null;
        const msLeft = expiresAt ? Math.max(0, expiresAt.getTime() - now) : 0;
        const minLeft = Math.floor(msLeft / 60000);
        const secLeft = Math.floor((msLeft % 60000) / 1000);
        const detail = sessionDetails[session.id];
        const geofenceLat = detail?.lecturerLatitude ?? session.lecturerLatitude;
        const geofenceLng = detail?.lecturerLongitude ?? session.lecturerLongitude;
        const geofence = geofenceLat != null
          ? `${Number(geofenceLat).toFixed(5)}, ${Number(geofenceLng).toFixed(5)}`
          : null;
        const logs = attemptLogs[session.id] || [];
        const isExpanded = expandedId === session.id;

        return (
          <div key={session.id} className={`rounded-[2rem] border p-6 shadow-sm backdrop-blur-xl ${cardBorder}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`truncate text-lg font-bold ${textPrimary}`}>
                    {session.course?.courseName || 'Course'}
                  </h3>
                  <span className="rounded-xl bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                    {session.course?.courseCode || '--'}
                  </span>
                  <span className="rounded-xl bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                    ACTIVE
                  </span>
                </div>
                <p className={`mt-1 text-sm ${textSecondary}`}>
                  Session key: <span className="font-mono font-bold tracking-wider text-blue-600">{session.sessionKey}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                {expiresAt && msLeft > 0 && (
                  <span className={`rounded-2xl border px-3 py-1 text-sm font-semibold tabular-nums ${msLeft < 120000 ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                    {minLeft}m {secLeft}s
                  </span>
                )}
                {expiresAt && msLeft <= 0 && (
                  <span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-600">
                    Expired
                  </span>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className={labelClass}>Start time</p>
                <p className={`mt-1 font-semibold ${textPrimary}`}>{formatTime(session.startTime)}</p>
                <p className={`mt-0.5 text-xs ${textSecondary}`}>{formatDate(session.date)}</p>
              </div>
              <div>
                <p className={labelClass}>End time</p>
                <p className={`mt-1 font-semibold ${textPrimary}`}>{formatTime(session.endTime)}</p>
              </div>
              <div>
                <p className={labelClass}>Location</p>
                <p className={`mt-1 font-mono text-sm font-semibold ${textPrimary}`}>{geofence || 'Not set'}</p>
              </div>
              <div>
                <p className={labelClass}>Radius</p>
                <p className={`mt-1 font-semibold ${textPrimary}`}>{session.attendanceRadiusMeters || 35}m</p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className={labelClass}>Marked</p>
                <p className={`mt-1 text-2xl font-bold ${textPrimary}`}>{stats.totalMarked}</p>
                <p className={`mt-0.5 text-xs ${textSecondary}`}>of {stats.expected} expected</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <p className={labelClass}>Present</p>
                <p className={`mt-1 text-2xl font-bold text-emerald-700`}>{stats.present}</p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <p className={labelClass}>Late</p>
                <p className={`mt-1 text-2xl font-bold text-amber-700`}>{stats.late}</p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                <p className={labelClass}>Rejected</p>
                <p className={`mt-1 text-2xl font-bold text-rose-700`}>{stats.rejected}</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                {qrUrls[session.id] ? (
                  <img src={qrUrls[session.id]} alt="QR" className="h-28 w-28 rounded-xl border border-slate-200" />
                ) : (
                  <div className="flex h-28 w-28 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                    <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625v3.75m0-3.75h3.75m-3.75 0h-3.75" /></svg>
                  </div>
                )}
              </div>

              <div className="flex flex-1 flex-wrap items-center gap-3">
                {confirmCloseId === session.id ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-3">
                    <p className="text-sm font-medium text-rose-800">Stop attendance? Students will no longer be able to mark attendance.</p>
                    <button
                      onClick={() => handleStop(session.id)}
                      disabled={busyAction === `stop-${session.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                    >
                      {busyAction === `stop-${session.id}` ? (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      )}
                      Stop
                    </button>
                    <button
                      onClick={() => setConfirmCloseId(null)}
                      className="rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200/50"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setConfirmCloseId(session.id)}
                      disabled={busyAction === `stop-${session.id}`}
                      className="inline-flex items-center gap-1.5 rounded-2xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      Stop Attendance
                    </button>
                    <button
                      onClick={() => onRefresh()}
                      className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
                      Refresh
                    </button>
                  </>
                )}
              </div>

              {logs.length > 0 && (
                <button
                  onClick={() => setExpandedId(isExpanded ? null : session.id)}
                  className={`inline-flex items-center gap-1.5 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${isExpanded ? 'bg-blue-100 text-blue-700 border-blue-200' : 'text-slate-600 border-slate-300 hover:bg-slate-100'}`}
                >
                  <svg className={`h-4 w-4 transition ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>
                  Attempt Logs ({logs.length})
                </button>
              )}
            </div>

            {isExpanded && logs.length > 0 && (
              <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className={`border-b text-xs font-semibold uppercase tracking-wider ${isDark ? 'border-slate-700 bg-slate-800 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                      <th className="px-4 py-3">Student</th>
                      <th className="px-4 py-3">Matric</th>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Distance</th>
                      <th className="px-4 py-3">Accuracy</th>
                      <th className="px-4 py-3">Method</th>
                      <th className="px-4 py-3">Result</th>
                      <th className="px-4 py-3">Attempt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {logs.map((attempt) => {
                      const badge = resultBadge(attempt);
                      return (
                        <tr key={attempt.id} className={`${isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-3 font-medium">{attempt.student?.firstName} {attempt.student?.lastName}</td>
                          <td className={`px-4 py-3 font-mono text-xs ${textSecondary}`}>{attempt.student?.matricNumber || '--'}</td>
                          <td className={`px-4 py-3 text-xs ${textSecondary}`}>{formatDateTime(attempt.createdAt)}</td>
                          <td className={`px-4 py-3 font-mono text-xs ${textSecondary}`}>{distanceLabel(attempt.metadata?.distanceMeters)}</td>
                          <td className={`px-4 py-3 font-mono text-xs ${textSecondary}`}>{attempt.accuracy != null ? `${Math.round(attempt.accuracy)}m` : '--'}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-lg px-2 py-0.5 text-xs font-semibold ${attempt.attendanceMethod === 'qr' ? 'bg-violet-50 text-violet-700' : 'bg-cyan-50 text-cyan-700'}`}>
                              {attempt.attendanceMethod === 'qr' ? 'QR' : 'Key'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded-lg px-2 py-0.5 text-xs font-semibold ${badge.tone}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className={`px-4 py-3 font-mono text-xs ${textSecondary}`}>{attempt.attemptNumber || 1}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
