import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, BookOpen, GraduationCap, IdCard, LoaderCircle, Lock, Mail, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import api from '../services/api';
import { hydrateSession } from '../redux/slices/authSlice';
import { useTheme } from '../theme/ThemeContext';

const initialSignupForm = {
  matricNumber: '',
  email: '',
  password: '',
  confirmPassword: '',
  semester: 'rain',
  academicYear: `${String(new Date().getFullYear()).slice(-2)}/${String(new Date().getFullYear() + 1).slice(-2)}`,
  courseIds: [],
};

const normalizeAcademicYear = (value = '') => {
  const raw = String(value || '').trim();
  const fourDigitYears = raw.match(/\d{4}/g);

  if (fourDigitYears && fourDigitYears.length >= 2) {
    return `${fourDigitYears[0].slice(-2)}/${fourDigitYears[1].slice(-2)}`;
  }

  const twoDigitYears = raw.match(/\d{2}/g);
  if (twoDigitYears && twoDigitYears.length >= 2) {
    return `${twoDigitYears[0]}/${twoDigitYears[1]}`;
  }

  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}`;
};

const StudentSignup = () => {
  const { isDark } = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialSignupForm);
  const [currentStep, setCurrentStep] = useState(1);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [registryRecord, setRegistryRecord] = useState(null);
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const canLookup = useMemo(() => form.matricNumber.trim().length >= 3, [form.matricNumber]);

  const loadCourses = async (semester, academicYear, registry) => {
    const params = {
      semester,
      academicYear,
    };

    if (registry?.faculty) params.faculty = registry.faculty;
    if (registry?.department) params.department = registry.department;
    if (registry?.program) params.program = registry.program;
    if (registry?.campus) params.campus = registry.campus;
    if (registry?.level) params.level = registry.level;

    const response = await api.get('/auth/public-courses', { params });
    setCourses(response.data.data || []);
  };

  useEffect(() => {
    loadCourses(form.semester, form.academicYear, registryRecord).catch(() => {
      setCourses([]);
    });
  }, [form.semester, form.academicYear, registryRecord]);

  useEffect(() => {
    if (!registryRecord) {
      return;
    }

    setForm((current) => ({
      ...current,
      courseIds: courses.map((course) => course.id),
    }));
  }, [courses, registryRecord]);

  const handleLookup = async () => {
    if (!canLookup) {
      setError('Enter a valid matric number first.');
      return;
    }

    try {
      setLookupLoading(true);
      setError('');
      setSuccess('');
      const response = await api.get(`/auth/student-lookup/${encodeURIComponent(form.matricNumber.trim())}`);
      const record = response.data.data;
      setRegistryRecord(record);
      await loadCourses(form.semester, form.academicYear, record);
      setSuccess('Student record found. Complete your account setup below.');
      setCurrentStep(2);
    } catch (lookupError) {
      setRegistryRecord(null);
      setError(lookupError.response?.data?.message || 'Student record could not be found.');
      setCurrentStep(1);
    } finally {
      setLookupLoading(false);
    }
  };

  const toggleCourse = (courseId) => {
    setForm((current) => ({
      ...current,
      courseIds: current.courseIds.includes(courseId)
        ? current.courseIds.filter((id) => id !== courseId)
        : [...current.courseIds, courseId],
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!registryRecord) {
      setError('Look up your matric number before signing up.');
      return;
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      const response = await api.post('/auth/student-signup', {
        matricNumber: form.matricNumber.trim(),
        email: form.email.trim(),
        password: form.password,
        semester: form.semester,
        academicYear: form.academicYear.trim(),
        courseIds: form.courseIds,
      });

      dispatch(hydrateSession(response.data.data));
      setSuccess('Signup completed successfully. Redirecting to your dashboard...');
      navigate('/dashboard');
    } catch (signupError) {
      setError(signupError.response?.data?.message || 'Signup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`relative min-h-screen overflow-hidden px-4 py-10 ${isDark ? 'bg-[radial-gradient(circle_at_top,_#1e293b,_#111827_35%,_#020617_80%)] text-slate-100' : 'bg-[radial-gradient(circle_at_top,_#dbeafe,_#93c5fd_35%,_#2563eb_72%,_#172554_100%)] text-slate-900'}`}>
      <div className={`absolute inset-0 ${isDark ? 'bg-[linear-gradient(140deg,rgba(15,23,42,0.5),transparent_45%,rgba(15,23,42,0.45))]' : 'bg-[linear-gradient(140deg,rgba(255,255,255,0.32),transparent_45%,rgba(15,23,42,0.18))]'}`} />
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 32, repeat: Infinity, ease: 'linear' }} className={`absolute left-[-4rem] top-8 h-80 w-80 rounded-full blur-3xl ${isDark ? 'bg-slate-500/20' : 'bg-white/30'}`} />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 36, repeat: Infinity, ease: 'linear' }} className={`absolute bottom-[-6rem] right-[-4rem] h-[26rem] w-[26rem] rounded-full blur-3xl ${isDark ? 'bg-blue-900/20' : 'bg-sky-200/25'}`} />

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.92fr_1.08fr]">
        <aside className={`rounded-[2rem] border p-8 backdrop-blur-xl ${isDark ? 'border-slate-700/80 bg-slate-900/75 shadow-[0_30px_80px_rgba(2,6,23,0.7)]' : 'border-white/60 bg-white/85 shadow-[0_30px_80px_rgba(30,64,175,0.24)]'}`}>
          <Link to="/login" className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${isDark ? 'border-slate-700 text-blue-300 hover:border-slate-600 hover:bg-slate-800' : 'border-blue-100 text-blue-700 hover:border-blue-200 hover:bg-blue-50'}`}>
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>

          <div className="mt-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-400 shadow-[0_18px_45px_rgba(37,99,235,0.35)]">
            <GraduationCap className="h-10 w-10 text-white" />
          </div>

          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.28em] text-blue-500">ATS</p>
          <h1 className={`mt-4 text-4xl font-black tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>Student signup</h1>
          <p className={`mt-4 text-base leading-7 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            Register with your matric number. We load your verified details and courses automatically.
          </p>

          <div className={`mt-8 space-y-4 rounded-[1.75rem] border p-5 ${isDark ? 'border-slate-700 bg-slate-800/70' : 'border-blue-100 bg-blue-50/80'}`}>
            <div className="flex items-start gap-3">
              <BadgeCheck className="mt-0.5 h-5 w-5 text-blue-600" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Student details come from the admin registry.</p>
            </div>
            <div className="flex items-start gap-3">
              <BookOpen className="mt-0.5 h-5 w-5 text-blue-600" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Courses load from the timetable.</p>
            </div>
            <div className="flex items-start gap-3">
              <IdCard className="mt-0.5 h-5 w-5 text-blue-600" />
              <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Missing record? Ask the admin to add it first.</p>
            </div>
          </div>

          <div className={`mt-8 rounded-[1.75rem] border p-5 ${isDark ? 'border-slate-700 bg-slate-900/70' : 'border-white/70 bg-white/80'}`}>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-500">Steps</p>
            <div className="mt-4 space-y-3">
              {[
                { id: 1, label: 'Verify matric number', ready: Boolean(registryRecord) },
                { id: 2, label: 'Create your account', ready: registryRecord && currentStep >= 2 },
                { id: 3, label: 'Review semester courses', ready: registryRecord && currentStep >= 3 },
              ].map((step) => (
                <div key={step.id} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 ${currentStep === step.id ? (isDark ? 'border-blue-500 bg-slate-950/60' : 'border-blue-200 bg-blue-50') : (isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white/80')}`}>
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${step.ready ? 'bg-blue-600 text-white' : isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-200 text-slate-600'}`}>{step.id}</span>
                  <div>
                    <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{step.label}</p>
                    <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{step.ready ? 'Ready' : 'Pending'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className={`rounded-[2rem] border p-8 backdrop-blur-xl ${isDark ? 'border-slate-700/80 bg-slate-900/80 shadow-[0_30px_80px_rgba(2,6,23,0.7)]' : 'border-white/60 bg-white/88 shadow-[0_30px_80px_rgba(30,64,175,0.24)]'}`}>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Step {currentStep}</p>
              <h2 className={`mt-2 text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>
                {currentStep === 1 && 'Verify matric number'}
                {currentStep === 2 && 'Create your account'}
                {currentStep === 3 && 'Review semester courses'}
              </h2>
            </div>
            <p className={`max-w-md text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {currentStep === 1 && 'Start with your matric number.'}
              {currentStep === 2 && 'Enter your login details.'}
              {currentStep === 3 && 'Confirm your courses.'}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
            {success && <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

            {currentStep === 1 && (
              <section className="space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={form.matricNumber}
                    onChange={(event) => setForm((current) => ({ ...current, matricNumber: event.target.value.toUpperCase() }))}
                    placeholder="Matric number"
                    className={`flex-1 rounded-2xl border px-4 py-4 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400' : 'border-blue-100 bg-white text-slate-900'}`}
                    required
                  />
                  <button
                    type="button"
                    onClick={handleLookup}
                    disabled={lookupLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 py-4 font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.28)] transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {lookupLoading ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                    Lookup
                  </button>
                </div>

                <div className={`rounded-[1.75rem] border p-5 ${isDark ? 'border-slate-700 bg-slate-800/70' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`text-sm font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>Verified student record</p>
                  {registryRecord ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <InfoTile label="Matric Number" value={registryRecord.matricNumber} />
                      <InfoTile label="Name" value={[registryRecord.firstName, registryRecord.otherName, registryRecord.lastName].filter(Boolean).join(' ')} />
                      <InfoTile label="Program" value={registryRecord.program} />
                      <InfoTile label="Campus" value={registryRecord.campus || 'Not set'} />
                      <InfoTile label="Faculty" value={registryRecord.faculty} />
                      <InfoTile label="Department" value={registryRecord.department} />
                      <InfoTile label="Level" value={registryRecord.level || 'Not set'} />
                    </div>
                  ) : (
                    <p className={`mt-4 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No student record loaded yet.</p>
                  )}
                </div>
              </section>
            )}

            {currentStep === 2 && (
              <section className="space-y-6">
                <LabelledInput isDark={isDark} icon={Mail} placeholder="Email address" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} required />
                <LabelledInput isDark={isDark} icon={Lock} placeholder="Password" type="password" value={form.password} onChange={(value) => setForm((current) => ({ ...current, password: value }))} required />
                <LabelledInput isDark={isDark} icon={Lock} placeholder="Confirm password" type="password" value={form.confirmPassword} onChange={(value) => setForm((current) => ({ ...current, confirmPassword: value }))} required />

                <div className="grid gap-4 sm:grid-cols-2">
                  <select value={form.semester} onChange={(event) => setForm((current) => ({ ...current, semester: event.target.value }))} className={`rounded-2xl border px-4 py-4 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-blue-100 bg-white text-slate-900'}`}>
                    <option value="rain">Rain semester</option>
                    <option value="harmattan">Harmattan semester</option>
                  </select>
                  <input value={form.academicYear} onChange={(event) => setForm((current) => ({ ...current, academicYear: normalizeAcademicYear(event.target.value) }))} placeholder="Academic year" className={`rounded-2xl border px-4 py-4 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400' : 'border-blue-100 bg-white text-slate-900'}`} required />
                </div>
              </section>
            )}

            {currentStep === 3 && (
              <section className={`rounded-[1.75rem] border p-6 ${isDark ? 'border-slate-700 bg-slate-800/65' : 'border-blue-100 bg-blue-50/70'}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Course review</p>
                    <h3 className={`mt-2 text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>Choose your semester courses</h3>
                  </div>
                  <p className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Showing active courses for {form.semester} semester, {form.academicYear}.</p>
                </div>
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Courses are preselected from the school timetable for your department and level. You can still adjust them before creating your account.
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {courses.length > 0 ? (
                    courses.map((course) => {
                      const selected = form.courseIds.includes(course.id);
                      return (
                        <button
                          type="button"
                          key={course.id}
                          onClick={() => toggleCourse(course.id)}
                          className={`rounded-[1.5rem] border p-5 text-left transition ${selected ? (isDark ? 'border-blue-500 bg-slate-900 shadow-[0_18px_45px_rgba(15,23,42,0.5)]' : 'border-blue-600 bg-white shadow-[0_18px_45px_rgba(37,99,235,0.18)]') : (isDark ? 'border-slate-700 bg-slate-900/80 hover:border-slate-500' : 'border-blue-100 bg-white/90 hover:border-blue-300')}`}
                        >
                          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{course.courseCode}</p>
                          <h4 className={`mt-2 text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>{course.courseName}</h4>
                          <p className={`mt-3 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{course.semester} semester</p>
                          <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{course.academicYear}</p>
                        </button>
                      );
                    })
                  ) : (
                    <div className={`rounded-[1.5rem] border border-dashed p-5 text-sm md:col-span-2 xl:col-span-3 ${isDark ? 'border-slate-600 bg-slate-900/70 text-slate-300' : 'border-blue-200 bg-white/80 text-slate-500'}`}>
                      No active courses are available for this semester yet. An admin can add them from the dashboard.
                    </div>
                  )}
                </div>
              </section>
            )}

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className={`text-sm ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>
                Selected courses: <span className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-700'}`}>{form.courseIds.length}</span>
              </div>

              <div className="flex flex-wrap gap-3">
                {currentStep > 1 && (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((current) => Math.max(1, current - 1))}
                    className={`rounded-2xl border px-5 py-4 font-semibold transition ${isDark ? 'border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800' : 'border-blue-100 bg-white text-slate-700 hover:bg-blue-50'}`}
                  >
                    Back
                  </button>
                )}

                {currentStep < 3 ? (
                  <button
                    type="button"
                    onClick={() => setCurrentStep((current) => Math.min(3, current + 1))}
                    disabled={currentStep === 1 && !registryRecord}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-6 py-4 font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.32)] transition hover:shadow-[0_22px_50px_rgba(37,99,235,0.42)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Continue
                  </button>
                ) : (
                  <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-6 py-4 font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.32)] transition hover:shadow-[0_22px_50px_rgba(37,99,235,0.42)] disabled:cursor-not-allowed disabled:opacity-60">
                    {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <BadgeCheck className="h-5 w-5" />}
                    Create student account
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const LabelledInput = ({ icon: Icon, value, onChange, isDark, ...props }) => (
  <div className="relative">
    <Icon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={`w-full rounded-2xl border px-4 py-4 pl-12 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400' : 'border-blue-100 bg-white text-slate-900'}`}
      {...props}
    />
  </div>
);

const InfoTile = ({ label, value }) => {
  const { isDark } = useTheme();

  return (
    <div className={`rounded-2xl border px-4 py-4 shadow-sm ${isDark ? 'border-slate-700 bg-slate-900' : 'border-white bg-white'}`}>
      <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{label}</p>
      <p className={`mt-2 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
};

export default StudentSignup;
