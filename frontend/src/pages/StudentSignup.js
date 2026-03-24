import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, BookOpen, GraduationCap, IdCard, LoaderCircle, Lock, Mail, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import api from '../services/api';
import { hydrateSession } from '../redux/slices/authSlice';

const initialSignupForm = {
  matricNumber: '',
  email: '',
  password: '',
  confirmPassword: '',
  semester: 'rain',
  academicYear: new Date().getFullYear() + '/' + String(new Date().getFullYear() + 1).slice(-2),
  courseIds: [],
};

const StudentSignup = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialSignupForm);
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
    if (registry?.level) params.level = registry.level;

    const response = await api.get('/auth/public-courses', { params });
    setCourses(response.data.data || []);
  };

  useEffect(() => {
    loadCourses(form.semester, form.academicYear, registryRecord).catch(() => {
      setCourses([]);
    });
  }, [form.semester, form.academicYear, registryRecord]);

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
    } catch (lookupError) {
      setRegistryRecord(null);
      setError(lookupError.response?.data?.message || 'Student record could not be found.');
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
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#dbeafe,_#93c5fd_35%,_#2563eb_72%,_#172554_100%)] px-4 py-10 text-slate-900">
      <div className="absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.32),transparent_45%,rgba(15,23,42,0.18))]" />
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 32, repeat: Infinity, ease: 'linear' }} className="absolute left-[-4rem] top-8 h-80 w-80 rounded-full bg-white/30 blur-3xl" />
      <motion.div animate={{ rotate: -360 }} transition={{ duration: 36, repeat: Infinity, ease: 'linear' }} className="absolute bottom-[-6rem] right-[-4rem] h-[26rem] w-[26rem] rounded-full bg-sky-200/25 blur-3xl" />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 lg:flex-row">
        <div className="lg:w-[28rem]">
          <div className="rounded-[2rem] border border-white/60 bg-white/85 p-8 shadow-[0_30px_80px_rgba(30,64,175,0.24)] backdrop-blur-xl">
            <Link to="/login" className="inline-flex items-center gap-2 rounded-2xl border border-blue-100 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-200 hover:bg-blue-50">
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>

            <div className="mt-8 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-400 shadow-[0_18px_45px_rgba(37,99,235,0.35)]">
              <GraduationCap className="h-10 w-10 text-white" />
            </div>

            <h1 className="mt-8 text-4xl font-black tracking-tight text-slate-950">Join Attendance System</h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Students sign up with a school-issued matric number. Once we verify your record, your profile details appear automatically and you can choose the courses you are offering this semester.
            </p>

            <div className="mt-8 space-y-4 rounded-[1.75rem] border border-blue-100 bg-blue-50/80 p-5">
              <div className="flex items-start gap-3">
                <BadgeCheck className="mt-0.5 h-5 w-5 text-blue-600" />
                <p className="text-sm text-slate-700">School-provided student details stay controlled by the admin registry.</p>
              </div>
              <div className="flex items-start gap-3">
                <BookOpen className="mt-0.5 h-5 w-5 text-blue-600" />
                <p className="text-sm text-slate-700">You can choose the semester courses you are offering during signup.</p>
              </div>
              <div className="flex items-start gap-3">
                <IdCard className="mt-0.5 h-5 w-5 text-blue-600" />
                <p className="text-sm text-slate-700">If your matric number is missing, the school admin needs to add it to the registry first.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1">
          <form onSubmit={handleSubmit} className="rounded-[2rem] border border-white/60 bg-white/88 p-8 shadow-[0_30px_80px_rgba(30,64,175,0.24)] backdrop-blur-xl">
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
              <div className="space-y-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Step 1</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-950">Verify matric number</h2>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    value={form.matricNumber}
                    onChange={(event) => setForm((current) => ({ ...current, matricNumber: event.target.value.toUpperCase() }))}
                    placeholder="Matric number"
                    className="flex-1 rounded-2xl border border-blue-100 bg-white px-4 py-4 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
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

                {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
                {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

                <div className="rounded-[1.75rem] border border-slate-200 bg-slate-50 p-5">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Verified student record</p>
                  {registryRecord ? (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <InfoTile label="Matric Number" value={registryRecord.matricNumber} />
                      <InfoTile label="Name" value={[registryRecord.firstName, registryRecord.otherName, registryRecord.lastName].filter(Boolean).join(' ')} />
                      <InfoTile label="Program" value={registryRecord.program} />
                      <InfoTile label="Faculty" value={registryRecord.faculty} />
                      <InfoTile label="Department" value={registryRecord.department} />
                      <InfoTile label="Level" value={registryRecord.level || 'Not set'} />
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">No student record loaded yet.</p>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Step 2</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-950">Create your account</h2>
                </div>

                <LabelledInput icon={Mail} placeholder="Email address" type="email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} required />
                <LabelledInput icon={Lock} placeholder="Password" type="password" value={form.password} onChange={(value) => setForm((current) => ({ ...current, password: value }))} required />
                <LabelledInput icon={Lock} placeholder="Confirm password" type="password" value={form.confirmPassword} onChange={(value) => setForm((current) => ({ ...current, confirmPassword: value }))} required />

                <div className="grid gap-4 sm:grid-cols-2">
                  <select value={form.semester} onChange={(event) => setForm((current) => ({ ...current, semester: event.target.value }))} className="rounded-2xl border border-blue-100 bg-white px-4 py-4 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100">
                    <option value="rain">Rain semester</option>
                    <option value="harmattan">Harmattan semester</option>
                  </select>
                  <input value={form.academicYear} onChange={(event) => setForm((current) => ({ ...current, academicYear: event.target.value }))} placeholder="Academic year" className="rounded-2xl border border-blue-100 bg-white px-4 py-4 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" required />
                </div>
              </div>
            </div>

            <div className="mt-10 rounded-[1.75rem] border border-blue-100 bg-blue-50/70 p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-600">Step 3</p>
                  <h2 className="mt-2 text-2xl font-bold text-slate-950">Choose semester courses</h2>
                </div>
                <p className="text-sm text-slate-600">Showing active courses for {form.semester} semester, {form.academicYear}.</p>
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
                        className={`rounded-[1.5rem] border p-5 text-left transition ${selected ? 'border-blue-600 bg-white shadow-[0_18px_45px_rgba(37,99,235,0.18)]' : 'border-blue-100 bg-white/90 hover:border-blue-300'}`}
                      >
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{course.courseCode}</p>
                        <h3 className="mt-2 text-lg font-bold text-slate-950">{course.courseName}</h3>
                        <p className="mt-3 text-sm text-slate-500">{course.semester} semester</p>
                        <p className="mt-1 text-sm text-slate-500">{course.academicYear}</p>
                      </button>
                    );
                  })
                ) : (
                  <div className="rounded-[1.5rem] border border-dashed border-blue-200 bg-white/80 p-5 text-sm text-slate-500 md:col-span-2 xl:col-span-3">
                    No active courses are available for this semester yet. An admin can add them from the dashboard.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">Selected courses: <span className="font-semibold text-slate-700">{form.courseIds.length}</span></p>
              <button type="submit" disabled={submitting} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-6 py-4 font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.32)] transition hover:shadow-[0_22px_50px_rgba(37,99,235,0.42)] disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <BadgeCheck className="h-5 w-5" />}
                Create student account
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const LabelledInput = ({ icon: Icon, value, onChange, ...props }) => (
  <div className="relative">
    <Icon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-500" />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-2xl border border-blue-100 bg-white px-4 py-4 pl-12 text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.12)] outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
      {...props}
    />
  </div>
);

const InfoTile = ({ label, value }) => (
  <div className="rounded-2xl border border-white bg-white px-4 py-4 shadow-sm">
    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
    <p className="mt-2 text-sm font-semibold text-slate-800">{value}</p>
  </div>
);

export default StudentSignup;
