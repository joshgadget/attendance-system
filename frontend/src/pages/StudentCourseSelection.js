import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BadgeCheck, BookOpen, CalendarDays, GraduationCap, Layers3, LoaderCircle, Save, Sparkles } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import api from '../services/api';
import { useTheme } from '../theme/ThemeContext';

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

const getCourseDepartmentLabel = (course) => {
  const primaryAudience = course?.audiences?.find((entry) => entry?.isActive !== false) || null;
  return String(course?.department || primaryAudience?.department || 'Shared courses').trim() || 'Shared courses';
};

const getCourseLevelLabel = (course) => {
  const rawLevel = String(course?.level || course?.audiences?.find((entry) => entry?.isActive !== false)?.level || '').trim();
  if (!rawLevel) {
    return 'Unspecified level';
  }

  const digits = rawLevel.match(/\d+/)?.[0];
  return digits ? `${digits} Level` : rawLevel;
};

const formatTime = (value) => (value ? String(value).slice(0, 5) : 'Not set');
const fullName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'Student';

const StudentCourseSelection = () => {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const { user } = useSelector((state) => state.auth);
  const [semester, setSemester] = useState('rain');
  const [academicYear, setAcademicYear] = useState(`${String(new Date().getFullYear()).slice(-2)}/${String(new Date().getFullYear() + 1).slice(-2)}`);
  const [profile, setProfile] = useState(null);
  const [registryRecord, setRegistryRecord] = useState(null);
  const [courses, setCourses] = useState([]);
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (user?.role && user.role !== 'student') {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    if (user?.role && user.role !== 'student') {
      return;
    }

    const loadOptions = async () => {
      try {
        setLoading(true);
        setError('');
        const normalizedYear = normalizeAcademicYear(academicYear);
        const response = await api.get('/users/me/course-options', {
          params: { semester, academicYear: normalizedYear },
        });

        const payload = response.data.data || {};
        setProfile(payload.student || null);
        setRegistryRecord(payload.registryRecord || null);
        setCourses(payload.courses || []);
        setSelectedCourseIds(payload.selectedCourseIds || []);
      } catch (loadError) {
        setCourses([]);
        setSelectedCourseIds([]);
        setError(loadError.response?.data?.message || 'Course options could not be loaded right now.');
      } finally {
        setLoading(false);
      }
    };

    loadOptions();
  }, [academicYear, semester, user]);

  const groupedCourses = useMemo(() => {
    const departmentMap = new Map();

    courses.forEach((course) => {
      const department = getCourseDepartmentLabel(course);
      const level = getCourseLevelLabel(course);

      if (!departmentMap.has(department)) {
        departmentMap.set(department, new Map());
      }

      const levelMap = departmentMap.get(department);
      if (!levelMap.has(level)) {
        levelMap.set(level, []);
      }

      levelMap.get(level).push(course);
    });

    return [...departmentMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([department, levels]) => ({
        department,
        levels: [...levels.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([level, items]) => ({
            level,
            items: items.sort((left, right) => String(left.courseCode || '').localeCompare(String(right.courseCode || ''))),
          })),
      }));
  }, [courses]);

  const toggleCourse = (courseId) => {
    setSelectedCourseIds((current) => (
      current.includes(courseId)
        ? current.filter((id) => id !== courseId)
        : [...current, courseId]
    ));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const normalizedYear = normalizeAcademicYear(academicYear);
      await api.put('/users/me/enrollments', {
        semester,
        academicYear: normalizedYear,
        courseIds: selectedCourseIds,
      });
      setSuccess('Your course selections were saved successfully.');
    } catch (saveError) {
      setError(saveError.response?.data?.message || 'Course selections could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`min-h-screen px-4 py-10 ${isDark ? 'bg-[radial-gradient(circle_at_top,_#1e293b,_#111827_35%,_#020617_82%)] text-slate-100' : 'bg-[radial-gradient(circle_at_top,_#eff6ff,_#dbeafe_34%,_#bfdbfe_70%,_#e0f2fe_100%)] text-slate-900'}`}>
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <div className={`rounded-[2rem] border p-6 backdrop-blur-xl ${isDark ? 'border-slate-700/80 bg-slate-900/80 shadow-[0_30px_80px_rgba(2,6,23,0.7)]' : 'border-white/70 bg-white/85 shadow-[0_30px_80px_rgba(30,64,175,0.14)]'}`}>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <Link to="/dashboard" className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${isDark ? 'border-slate-700 text-blue-300 hover:border-slate-600 hover:bg-slate-800' : 'border-blue-100 text-blue-700 hover:border-blue-200 hover:bg-blue-50'}`}>
                <ArrowLeft className="h-4 w-4" />
                Back to dashboard
              </Link>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-700 via-blue-600 to-sky-400 shadow-[0_18px_45px_rgba(37,99,235,0.35)]">
                  <GraduationCap className="h-8 w-8 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-500">Student course center</p>
                  <h1 className={`mt-2 text-3xl font-black tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>Choose the courses that define your semester</h1>
                </div>
              </div>
              <p className={`max-w-3xl text-sm leading-7 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                This page only shows courses that match your registered department, program, level, semester, and academic year. That keeps your timetable and attendance notifications clean and accurate.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <InfoBadge icon={Layers3} label="Student level" value={registryRecord?.level || 'Not set'} isDark={isDark} />
              <InfoBadge icon={BadgeCheck} label="Selected courses" value={String(selectedCourseIds.length)} isDark={isDark} />
              <InfoBadge icon={BookOpen} label="Semester" value={semester} isDark={isDark} />
              <InfoBadge icon={CalendarDays} label="Academic year" value={normalizeAcademicYear(academicYear) || academicYear || 'Not set'} isDark={isDark} />
            </div>
          </div>
        </div>

        <div className="grid gap-8 xl:grid-cols-[0.78fr_1.22fr]">
          <aside className="space-y-6">
            <section className={`rounded-[2rem] border p-6 ${isDark ? 'border-slate-700 bg-slate-900/80' : 'border-slate-200 bg-white/88'}`}>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-500">Student identity</p>
              <div className="mt-4 space-y-4">
                <ProfileRow label="Name" value={fullName(profile || user)} isDark={isDark} />
                <ProfileRow label="Matric number" value={registryRecord?.matricNumber || profile?.matricNumber || 'Not set'} isDark={isDark} />
                <ProfileRow label="Department" value={registryRecord?.department || profile?.department || 'Not set'} isDark={isDark} />
                <ProfileRow label="Program" value={registryRecord?.program || profile?.program || 'Not set'} isDark={isDark} />
                <ProfileRow label="Faculty" value={registryRecord?.faculty || profile?.faculty || 'Not set'} isDark={isDark} />
              </div>
            </section>

            <section className={`rounded-[2rem] border p-6 ${isDark ? 'border-slate-700 bg-slate-900/80' : 'border-slate-200 bg-white/88'}`}>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-500">Selection filters</p>
              <div className="mt-4 grid gap-4">
                <select
                  value={semester}
                  onChange={(event) => setSemester(event.target.value)}
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'}`}
                >
                  <option value="rain">Rain semester</option>
                  <option value="harmattan">Harmattan semester</option>
                </select>
                <input
                  value={academicYear}
                  onChange={(event) => setAcademicYear(normalizeAcademicYear(event.target.value))}
                  placeholder="Academic year"
                  className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-900'}`}
                />
              </div>
              <div className={`mt-4 rounded-[1.5rem] border px-4 py-4 text-sm leading-7 ${isDark ? 'border-blue-900/40 bg-blue-950/20 text-slate-300' : 'border-blue-100 bg-blue-50/80 text-slate-700'}`}>
                The timetable and notification engine use your selected courses here. If the wrong level appears, update the student registry level first so the timetable can match you correctly.
              </div>
            </section>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-sky-500 px-6 py-4 font-semibold text-white shadow-[0_18px_40px_rgba(37,99,235,0.32)] transition hover:shadow-[0_22px_50px_rgba(37,99,235,0.42)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
              Save course selections
            </button>
          </aside>

          <section className={`rounded-[2rem] border p-6 ${isDark ? 'border-slate-700 bg-slate-900/80' : 'border-slate-200 bg-white/88'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-blue-500">Recommended courses</p>
                <h2 className={`mt-2 text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>Built from your registry level and semester timetable</h2>
              </div>
              <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                <Sparkles className="h-4 w-4 text-blue-500" />
                {courses.length} matched courses
              </div>
            </div>

            {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
            {success && <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

            {loading ? (
              <div className="mt-10 flex min-h-[18rem] items-center justify-center">
                <LoaderCircle className={`h-10 w-10 animate-spin ${isDark ? 'text-blue-300' : 'text-blue-600'}`} />
              </div>
            ) : groupedCourses.length > 0 ? (
              <div className="mt-8 space-y-6">
                {groupedCourses.map((departmentGroup) => (
                  <div key={departmentGroup.department} className={`rounded-[1.5rem] border p-5 ${isDark ? 'border-slate-700 bg-slate-950/40' : 'border-slate-200 bg-slate-50/70'}`}>
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{departmentGroup.department}</p>
                        <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Grouped by level so your selections stay aligned with the timetable.</p>
                      </div>
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-white text-slate-600'}`}>
                        {departmentGroup.levels.reduce((sum, levelGroup) => sum + levelGroup.items.length, 0)} courses
                      </span>
                    </div>

                    <div className="space-y-5">
                      {departmentGroup.levels.map((levelGroup) => (
                        <div key={`${departmentGroup.department}-${levelGroup.level}`}>
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-blue-500">{levelGroup.level}</p>
                          <div className="grid gap-4 xl:grid-cols-2">
                            {levelGroup.items.map((course) => {
                              const selected = selectedCourseIds.includes(course.id);
                              return (
                                <button
                                  key={course.id}
                                  type="button"
                                  onClick={() => toggleCourse(course.id)}
                                  className={`rounded-[1.5rem] border p-5 text-left transition ${selected ? (isDark ? 'border-blue-500 bg-blue-950/20 shadow-[0_18px_40px_rgba(37,99,235,0.16)]' : 'border-blue-500 bg-blue-50 shadow-[0_18px_40px_rgba(37,99,235,0.12)]') : (isDark ? 'border-slate-700 bg-slate-900/80 hover:border-slate-500' : 'border-slate-200 bg-white/90 hover:border-blue-300')}`}
                                >
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{course.courseCode}</p>
                                      <h3 className={`mt-2 text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>{course.courseName}</h3>
                                      <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Lecturer: {fullName(course.lecturer)}</p>
                                      <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{course.semester} semester | {course.academicYear}</p>
                                    </div>
                                    <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${selected ? 'border-blue-500 bg-blue-600 text-white' : isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                      {selected ? 'selected' : 'available'}
                                    </span>
                                  </div>

                                  {course.schedules?.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                      {course.schedules.map((schedule) => (
                                        <span key={`${course.id}-${schedule.id}`} className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                                          {schedule.dayOfWeek} {formatTime(schedule.startTime)}-{formatTime(schedule.endTime)}{schedule.venue ? ` | ${schedule.venue}` : ''}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={`mt-8 rounded-[1.5rem] border border-dashed p-6 text-sm ${isDark ? 'border-slate-600 bg-slate-900/70 text-slate-300' : 'border-blue-200 bg-slate-50/80 text-slate-600'}`}>
                No timetable-matched courses were found for your department, program, level, semester, and academic year yet.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

const InfoBadge = ({ icon: Icon, label, value, isDark }) => (
  <div className={`rounded-[1.4rem] border px-4 py-3 ${isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-white/80'}`}>
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
        <p className={`mt-1 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</p>
      </div>
    </div>
  </div>
);

const ProfileRow = ({ label, value, isDark }) => (
  <div>
    <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
    <p className={`mt-2 text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{value}</p>
  </div>
);

export default StudentCourseSelection;
