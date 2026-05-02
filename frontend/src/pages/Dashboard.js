
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Bell,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  Clock3,
  CircleHelp,
  Download,
  FileText,
  GraduationCap,
  Home,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  UserCog,
  UserPlus,
  Users,
  MapPin,
  XCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { useDispatch, useSelector } from 'react-redux';
import api from '../services/api';
import { logout } from '../redux/slices/authSlice';
import { useTheme } from '../theme/ThemeContext';
import './dashboard-theme.css';

const initialUserForm = { firstName: '', lastName: '', email: '', password: '', role: 'student', department: '', faculty: '', program: '', matricNumber: '' };
const initialCourseForm = { courseCode: '', courseName: '', description: '', semester: 'rain', academicYear: '', lecturerId: '', faculty: '', department: '', program: '', level: '' };
const initialRegistryForm = { matricNumber: '', firstName: '', lastName: '', otherName: '', faculty: '', department: '', program: '', level: '', admissionYear: '' };
const initialSessionForm = { courseId: '', date: '', startTime: '', durationMinutes: '120', venue: '', maxAttendanceTime: '15', buildingId: '' };
const initialBuildingForm = { name: '', tag: '', latitude: '', longitude: '', radiusMeters: '80' };
const initialQueryForm = { studentId: '', sessionId: '', title: '', message: '' };
const initialAttendanceForm = { sessionCode: '', useLocation: true };
const TABS_BY_ROLE = {
  admin: ['overview', 'analytics', 'users', 'registry', 'courses', 'reports', 'notifications', 'help'],
  lecturer: ['overview', 'analytics', 'courses', 'sessions', 'queries', 'reports', 'notifications', 'help'],
  student: ['overview', 'analytics', 'courses', 'attendance', 'queries', 'reports', 'notifications', 'help'],
};

const PRIMARY_TABS_BY_ROLE = {
  admin: ['overview', 'users', 'registry', 'courses', 'reports', 'notifications'],
  lecturer: ['overview', 'courses', 'sessions', 'queries', 'reports', 'notifications'],
  student: ['overview', 'courses', 'attendance', 'queries', 'reports', 'notifications'],
};

const TAB_LABELS = {
  overview: 'Dashboard',
  analytics: 'Analytics',
  users: 'Users',
  registry: 'Registry',
  courses: 'Courses',
  sessions: 'Sessions',
  attendance: 'Attendance',
  queries: 'Queries',
  reports: 'Reports',
  notifications: 'Notifications',
  profile: 'Profile',
  help: 'Help',
};

const TAB_ICONS = {
  overview: Home,
  analytics: LayoutDashboard,
  users: Users,
  registry: ShieldCheck,
  courses: BookOpen,
  sessions: Calendar,
  attendance: CheckCircle2,
  queries: MessageSquare,
  reports: FileText,
  notifications: Bell,
  profile: UserCog,
  help: CircleHelp,
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : 'Not set');
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : 'Not available');
const formatTime = (value) => (value ? String(value).slice(0, 5) : 'Not set');
const fullName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'No name';
const normalizeSearch = (value) => String(value || '').toLowerCase();
const includesSearch = (value, search) => normalizeSearch(value).includes(normalizeSearch(search));
const normalizeAcademicYearValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const compact = raw.replace(/\s+/g, '');
  const match = compact.match(/^(\d{2,4})\/(\d{2,4})$/);
  if (!match) {
    return compact.toLowerCase();
  }

  const [, startRaw, endRaw] = match;
  const startYear = startRaw.length === 2 ? `20${startRaw}` : startRaw;
  const endYear = endRaw.length === 2 ? `20${endRaw}` : endRaw;
  return `${startYear}/${endYear}`;
};

const getCourseDepartmentLabel = (course) => {
  const primaryAudience = course?.audiences?.find((entry) => entry?.isActive !== false) || null;
  const department = String(course?.department || primaryAudience?.department || '').trim();
  if (department) {
    return department;
  }

  const prefix = String(course?.courseCode || '').trim().toUpperCase().match(/^[A-Z]{2,5}/)?.[0];
  if (!prefix || ['GST', 'GTS', 'GET', 'MTH', 'CHM', 'PHY'].includes(prefix)) {
    return 'GENERAL & SHARED COURSES';
  }

  return prefix;
};

const getCourseLevelLabel = (course) => {
  const rawLevel = String(course?.level || course?.audiences?.find((entry) => entry?.isActive !== false)?.level || '').trim();
  if (!rawLevel) {
    return 'UNSPECIFIED LEVEL';
  }

  const digits = rawLevel.match(/\d+/)?.[0];
  return digits ? `${digits} LEVEL` : rawLevel.toUpperCase();
};

const getCurrentLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });

const extractSessionCode = (decodedText) => {
  try {
    const parsedUrl = new URL(decodedText);
    const directCode = parsedUrl.searchParams.get('sessionCode');
    if (directCode) {
      return directCode.trim().toUpperCase();
    }
  } catch (error) {
    // not a full absolute URL, keep trying other formats
  }

  if (decodedText.includes('sessionCode=')) {
    const queryString = decodedText.includes('?') ? decodedText.slice(decodedText.indexOf('?') + 1) : decodedText;
    const params = new URLSearchParams(queryString);
    const queryCode = params.get('sessionCode');
    if (queryCode) {
      return queryCode.trim().toUpperCase();
    }
  }

  try {
    const parsed = JSON.parse(decodedText);
    return (parsed.sessionCode || decodedText).trim().toUpperCase();
  } catch (error) {
    return decodedText.trim().toUpperCase();
  }
};

const Panel = ({ title, eyebrow, action, children }) => {
  const { isDark } = useTheme();

  return (
  <section className={`rounded-[2rem] border p-6 backdrop-blur-xl ${isDark ? 'border-slate-700 bg-slate-900/80 shadow-[0_20px_60px_rgba(2,6,23,0.6)]' : 'border-white/70 bg-white/90 shadow-[0_20px_60px_rgba(148,163,184,0.14)]'}`}>
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        {eyebrow && <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-500">{eyebrow}</p>}
        <h2 className={`mt-2 text-xl font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>{title}</h2>
      </div>
      {action}
    </div>
    {children}
  </section>
  );
};

const EmptyState = ({ title, description }) => {
  const { isDark } = useTheme();

  return (
  <div className={`rounded-[1.5rem] border border-dashed p-6 text-sm ${isDark ? 'border-slate-600 bg-slate-900/70 text-slate-300' : 'border-blue-200 bg-blue-50/60 text-slate-600'}`}>
    <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{title}</p>
    <p className="mt-2 leading-6">{description}</p>
  </div>
  );
};

const Badge = ({ children, tone = 'blue' }) => {
  const { isDark } = useTheme();
  const toneClasses = {
    blue: isDark ? 'border-blue-900/70 bg-blue-950/50 text-blue-300' : 'border-blue-200 bg-blue-50 text-blue-700',
    emerald: isDark ? 'border-emerald-900/70 bg-emerald-950/40 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: isDark ? 'border-amber-900/70 bg-amber-950/40 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700',
    slate: isDark ? 'border-slate-700 bg-slate-900 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600',
    rose: isDark ? 'border-rose-900/70 bg-rose-950/40 text-rose-300' : 'border-rose-200 bg-rose-50 text-rose-700',
  };

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${toneClasses[tone]}`}>{children}</span>;
};

const SummaryTile = ({ label, value, helper }) => {
  const { isDark } = useTheme();

  return (
  <div className={`rounded-[1.5rem] border p-5 ${isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-slate-50/80'}`}>
    <p className={`text-sm font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-slate-300' : 'text-slate-500'}`}>{label}</p>
    <p className={`mt-3 text-2xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>{value}</p>
    <p className={`mt-2 text-sm leading-6 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{helper}</p>
  </div>
  );
};

const ActionTile = ({ title, description }) => {
  const { isDark } = useTheme();

  return (
  <div className={`rounded-[1.5rem] border p-5 ${isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-slate-50/80'}`}>
    <div className="flex items-start gap-3">
      <LayoutDashboard className="mt-1 h-5 w-5 text-blue-600" />
      <div>
        <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{title}</p>
        <p className={`mt-2 text-sm leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{description}</p>
      </div>
    </div>
  </div>
  );
};

const NotificationItem = ({ item }) => {
  const toneMap = {
    blue: 'blue',
    amber: 'amber',
    emerald: 'emerald',
    rose: 'rose',
    slate: 'slate',
  };

  return (
    <div className="rounded-[1.4rem] border border-slate-200/70 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.description}</p>
          <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-400">{formatDateTime(item.createdAt)}</p>
        </div>
        <Badge tone={toneMap[item.tone] || 'slate'}>{item.tone || 'info'}</Badge>
      </div>
    </div>
  );
};

const MetricList = ({ items, emptyMessage }) => {
  if (!items?.length) {
    return <EmptyState title="Nothing here yet" description={emptyMessage} />;
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const values = Object.entries(item).filter(([key]) => !['courseId', 'courseLabel', 'label'].includes(key));
        return (
          <div key={item.courseId || item.label} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/70">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="font-semibold text-slate-900 dark:text-slate-100">{item.courseLabel || item.label}</p>
              </div>
              <div className="grid min-w-[18rem] gap-3 sm:grid-cols-2">
                {values.map(([key, value]) => (
                  <div key={key} className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800/70">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                    <p className="mt-2 font-semibold text-slate-900 dark:text-slate-100">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const HelpArticleList = ({ articles, contact }) => (
  <div className="space-y-4">
    {articles?.map((article) => (
      <div key={article.title} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/70">
        <div className="flex items-start gap-3">
          <CircleHelp className="mt-1 h-5 w-5 text-blue-500" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{article.title}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{article.body}</p>
          </div>
        </div>
      </div>
    ))}
    <div className="rounded-[1.5rem] border border-blue-200 bg-blue-50/70 p-5 dark:border-slate-700 dark:bg-blue-950/30">
      <p className="font-semibold text-slate-900 dark:text-slate-100">Need human support?</p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Email <span className="font-semibold">{contact?.email || 'support@attendance-system.local'}</span> and expect a reply {contact?.responseTime || 'soon'}.</p>
    </div>
  </div>
);

const buildTrendPoints = (values = []) => {
  const fallback = values.length > 0 ? values : [48, 46, 57, 61, 59, 71, 85];
  const max = Math.max(...fallback, 100);
  const width = 660;
  const height = 240;
  return fallback.map((value, index) => {
    const x = (index / Math.max(fallback.length - 1, 1)) * width;
    const y = height - (value / max) * height;
    return { x, y, value };
  });
};

const Input = ({ label, onChange, ...props }) => {
  const { isDark } = useTheme();

  return (
    <div>
      <label className={`mb-2 block text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{label}</label>
      <input onChange={(event) => onChange(event.target.value)} className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-900'}`} {...props} />
    </div>
  );
};

const Select = ({ label, value, onChange, options }) => {
  const { isDark } = useTheme();

  return (
    <div>
      <label className={`mb-2 block text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`w-full rounded-2xl border px-4 py-3 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
};

const QrScannerPanel = ({ isOpen, onClose, onDetected }) => {
  const { isDark } = useTheme();
  const [scannerError, setScannerError] = useState('');
  const scanHandledRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setScannerError('');
      scanHandledRef.current = false;
      return undefined;
    }

    scanHandledRef.current = false;
    let cancelled = false;
    let scannerCleared = false;
    const scanner = new Html5Qrcode('attendance-qr-reader');
    const stopScanner = async () => {
      if (scannerCleared) {
        return;
      }

      scannerCleared = true;
      if (scanner.isScanning) {
        await scanner.stop().catch(() => null);
      }
      await scanner.clear().catch(() => null);
    };

    scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: 220 },
      async (decodedText) => {
        if (cancelled || scanHandledRef.current) {
          return;
        }

        scanHandledRef.current = true;
        const code = extractSessionCode(decodedText);
        if (!code) {
          scanHandledRef.current = false;
          setScannerError('The scanned QR code does not contain a valid attendance session code.');
          return;
        }

        try {
          await stopScanner();
          await onDetected(code);
        } finally {
          cancelled = true;
          await stopScanner();
          onClose();
        }
      },
      () => {}
    ).catch(() => {
      setScannerError('Camera scanner could not start. You can still enter the session code manually.');
    });

    return () => {
      cancelled = true;
      stopScanner().catch(() => null);
    };
  }, [isOpen, onClose, onDetected]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className={`w-full max-w-lg rounded-[2rem] border p-6 shadow-2xl ${isDark ? 'border-slate-700 bg-slate-900' : 'border-white/20 bg-white'}`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-blue-500">QR scanner</p>
            <h3 className={`mt-2 text-xl font-bold ${isDark ? 'text-slate-100' : 'text-slate-950'}`}>Scan attendance code</h3>
          </div>
          <button onClick={onClose} className={`rounded-2xl border px-4 py-2 text-sm font-semibold ${isDark ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-600'}`}>Close</button>
        </div>
        <div id="attendance-qr-reader" className="overflow-hidden rounded-[1.5rem] border border-blue-100" />
        {scannerError && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{scannerError}</p>}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { isDark } = useTheme();
  const dispatch = useDispatch();
  const { user } = useSelector((state) => state.auth);
  const role = user?.role || 'student';
  const tabs = TABS_BY_ROLE[role] || TABS_BY_ROLE.student;
  const primaryTabs = PRIMARY_TABS_BY_ROLE[role] || PRIMARY_TABS_BY_ROLE.student;

  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [loading, setLoading] = useState(true);
  const [, setRefreshing] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');

  const [summary, setSummary] = useState(null);
  const [analytics, setAnalytics] = useState({ highlightCards: [], charts: {}, tables: {} });
  const [notifications, setNotifications] = useState([]);
  const [helpCenter, setHelpCenter] = useState({ articles: [], contact: null });
  const [profile, setProfile] = useState(null);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', department: '', faculty: '', program: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [users, setUsers] = useState([]);
  const [lecturers, setLecturers] = useState([]);
  const [students, setStudents] = useState([]);
  const [registry, setRegistry] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [courses, setCourses] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [queries, setQueries] = useState([]);
  const [history, setHistory] = useState([]);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [bulkRegistry, setBulkRegistry] = useState('');
  const [registryFileName, setRegistryFileName] = useState('');
  const [courseCatalogFileName, setCourseCatalogFileName] = useState('');
  const [timetableFileName, setTimetableFileName] = useState('');
  const [lecturerRosterFileName, setLecturerRosterFileName] = useState('');
  const [lecturerRosterCourseId, setLecturerRosterCourseId] = useState('');
  const [responseDrafts, setResponseDrafts] = useState({});
  const [registryFilters, setRegistryFilters] = useState({ faculty: '', department: '', program: '', level: '', claimed: '' });
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentEditForm, setStudentEditForm] = useState({ firstName: '', lastName: '', matricNumber: '', department: '', faculty: '', program: '' });
  const [enrollmentForm, setEnrollmentForm] = useState({ semester: 'rain', academicYear: new Date().getFullYear() + '/' + String(new Date().getFullYear() + 1).slice(-2), courseIds: [] });
  const [editingCourseId, setEditingCourseId] = useState('');
  const [courseEditForm, setCourseEditForm] = useState(initialCourseForm);
  const [reactivateDrafts, setReactivateDrafts] = useState({});
  const [linkForm, setLinkForm] = useState({ registryId: '', userId: '' });

  const [userForm, setUserForm] = useState(initialUserForm);
  const [courseForm, setCourseForm] = useState(initialCourseForm);
  const [registryForm, setRegistryForm] = useState(initialRegistryForm);
  const [sessionForm, setSessionForm] = useState(initialSessionForm);
  const [buildingForm, setBuildingForm] = useState(initialBuildingForm);
  const [queryForm, setQueryForm] = useState(initialQueryForm);
  const [attendanceForm, setAttendanceForm] = useState(initialAttendanceForm);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const attendanceRequestRef = useRef(false);

  const activeSession = useMemo(() => sessions.find((session) => session.status === 'active') || null, [sessions]);

  useEffect(() => {
    setActiveTab(tabs[0]);
  }, [tabs]);

  useEffect(() => {
    setAccountMenuOpen(false);
    setSidebarOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (role !== 'lecturer') {
      return;
    }

    if (!courses.length) {
      setLecturerRosterCourseId('');
      return;
    }

    if (!courses.some((course) => String(course.id) === String(lecturerRosterCourseId))) {
      setLecturerRosterCourseId(String(courses[0].id));
    }
  }, [courses, lecturerRosterCourseId, role]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return undefined;
    }

    const handleDocumentClick = (event) => {
      if (!event.target.closest('.dashboard-account-menu')) {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => document.removeEventListener('mousedown', handleDocumentClick);
  }, [accountMenuOpen]);

  const setMessage = (nextSuccess = '', nextError = '') => {
    setSuccess(nextSuccess);
    setError(nextError);
  };

  const loadSessionDetail = useCallback(async (sessionId) => {
    if (!sessionId) {
      setSessionDetail(null);
      setQrDataUrl('');
      return;
    }

    const response = await api.get(`/attendance/sessions/${sessionId}`);
    const detail = response.data.data;
    setSessionDetail(detail);

    if (detail?.sessionCode) {
      const dataUrl = await QRCode.toDataURL(detail.sessionCode, {
        width: 320,
        margin: 2,
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
    }
  }, []);

  const loadData = useCallback(async (spin = false) => {
    try {
      setError('');
      if (spin) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [analyticsResponse, notificationsResponse, helpResponse, profileResponse] = await Promise.all([
        api.get('/dashboard/analytics'),
        api.get('/dashboard/notifications'),
        api.get('/dashboard/help'),
        api.get('/users/me/profile'),
      ]);

      setAnalytics(analyticsResponse.data.data || { highlightCards: [], charts: {}, tables: {} });
      setNotifications(notificationsResponse.data.data || []);
      setHelpCenter(helpResponse.data.data || { articles: [], contact: null });
      setProfile(profileResponse.data.data || null);
      setProfileForm({
        firstName: profileResponse.data.data?.firstName || '',
        lastName: profileResponse.data.data?.lastName || '',
        department: profileResponse.data.data?.department || '',
        faculty: profileResponse.data.data?.faculty || '',
        program: profileResponse.data.data?.program || '',
      });

      if (role === 'admin') {
        const [summaryResponse, usersResponse, lecturersResponse, studentsResponse, coursesResponse, registryResponse, buildingsResponse] = await Promise.all([
          api.get('/users/summary'),
          api.get('/users'),
          api.get('/users/lecturers'),
          api.get('/users/students'),
          api.get('/courses'),
          api.get('/registry'),
          api.get('/buildings'),
        ]);

        setSummary(summaryResponse.data.data);
        setUsers(usersResponse.data.data || []);
        setLecturers(lecturersResponse.data.data || []);
        setStudents(studentsResponse.data.data || []);
        setCourses(coursesResponse.data.data || []);
        setRegistry(registryResponse.data.data || []);
        setBuildings(buildingsResponse.data.data || []);
        setSessions([]);
        setQueries([]);
        setHistory([]);
        setSessionDetail(null);
        setQrDataUrl('');
        return;
      }

      if (role === 'lecturer') {
        const [myCoursesResponse, studentsResponse, sessionsResponse, queriesResponse, buildingsResponse] = await Promise.all([
          api.get('/courses/mine'),
          api.get('/users/students'),
          api.get('/attendance/sessions'),
          api.get('/queries'),
          api.get('/buildings?activeOnly=true'),
        ]);

        const lecturerSessions = sessionsResponse.data.data || [];
        setCourses(myCoursesResponse.data.data || []);
        setBuildings(buildingsResponse.data.data || []);
        setStudents(studentsResponse.data.data || []);
        setSessions(lecturerSessions);
        setQueries(queriesResponse.data.data || []);
        setSummary({
          totalCourses: (myCoursesResponse.data.data || []).length,
          activeSessions: lecturerSessions.filter((session) => session.status === 'active').length,
          pendingQueries: (queriesResponse.data.data || []).filter((query) => query.status === 'pending').length,
          totalStudents: studentsResponse.data.data?.length || 0,
        });

        const preferredSessionId = sessionDetail?.id || lecturerSessions[0]?.id;
        if (preferredSessionId) {
          await loadSessionDetail(preferredSessionId);
        } else {
          setSessionDetail(null);
          setQrDataUrl('');
        }
        return;
      }

      if (role === 'student') {
        const [myCoursesResponse, historyResponse, queriesResponse] = await Promise.all([
          api.get('/courses/mine'),
          api.get('/attendance/history'),
          api.get('/queries'),
        ]);

        const myHistory = historyResponse.data.data || [];
        const myQueries = queriesResponse.data.data || [];
        setCourses(myCoursesResponse.data.data || []);
        setHistory(myHistory);
        setQueries(myQueries);
        setSessions([]);
        setBuildings([]);
        setSessionDetail(null);
        setQrDataUrl('');
        setSummary({
          totalCourses: (myCoursesResponse.data.data || []).length,
          totalAttendanceMarks: myHistory.length,
          pendingQueries: myQueries.filter((query) => query.status === 'pending').length,
          lateMarks: myHistory.filter((item) => item.status === 'late').length,
        });
      }
    } catch (loadError) {
      setError(loadError.response?.data?.message || 'Dashboard data could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadSessionDetail, role, sessionDetail?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (role !== 'lecturer' || !queryForm.sessionId) {
      return;
    }

    if (String(sessionDetail?.id) === String(queryForm.sessionId)) {
      return;
    }

    loadSessionDetail(queryForm.sessionId).catch(() => null);
  }, [loadSessionDetail, queryForm.sessionId, role, sessionDetail?.id]);

  const handleCreateUser = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('create-user');
      setMessage();
      await api.post('/auth/register', userForm);
      setUserForm(initialUserForm);
      setMessage('User account created successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'User account could not be created.');
    } finally {
      setBusyAction('');
    }
  };

  const handleCreateCourse = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('create-course');
      setMessage();
      await api.post('/courses', courseForm);
      setCourseForm(initialCourseForm);
      setMessage('Course created successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Course could not be created.');
    } finally {
      setBusyAction('');
    }
  };

  const handleStartCourseEdit = (course) => {
    setEditingCourseId(String(course.id));
    setCourseEditForm({
      courseCode: course.courseCode || '',
      courseName: course.courseName || '',
      description: course.description || '',
      semester: course.semester || 'rain',
      academicYear: course.academicYear || '',
      lecturerId: course.lecturerId ? String(course.lecturerId) : '',
      faculty: course.faculty || '',
      department: course.department || '',
      program: course.program || '',
      level: course.level || '',
    });
  };

  const handleCancelCourseEdit = () => {
    setEditingCourseId('');
    setCourseEditForm(initialCourseForm);
  };

  const handleUpdateCourse = async (event, courseId) => {
    event.preventDefault();

    try {
      setBusyAction(`update-course-${courseId}`);
      setMessage();
      await api.put(`/courses/${courseId}`, courseEditForm);
      setMessage('Course updated successfully.');
      setEditingCourseId('');
      setCourseEditForm(initialCourseForm);
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Course could not be updated.');
    } finally {
      setBusyAction('');
    }
  };

  const handleCreateBuilding = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('create-building');
      setMessage();
      await api.post('/buildings', {
        name: buildingForm.name,
        tag: buildingForm.tag,
        latitude: buildingForm.latitude,
        longitude: buildingForm.longitude,
        radiusMeters: buildingForm.radiusMeters,
      });
      setBuildingForm(initialBuildingForm);
      setMessage('Building geofence created successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Building geofence could not be created.');
    } finally {
      setBusyAction('');
    }
  };

  const handleDeactivateBuilding = async (buildingId) => {
    try {
      setBusyAction(`deactivate-building-${buildingId}`);
      setMessage();
      await api.delete(`/buildings/${buildingId}`);
      setMessage('Building geofence deactivated successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Building geofence could not be deactivated.');
    } finally {
      setBusyAction('');
    }
  };

  const handleArchiveCourse = async (courseId) => {
    try {
      setBusyAction(`archive-course-${courseId}`);
      setMessage();
      await api.delete(`/courses/${courseId}`);
      setMessage('Course archived successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Course could not be archived.');
    } finally {
      setBusyAction('');
    }
  };

  const handleDownloadReport = async (courseId, format) => {
    try {
      setBusyAction(`download-${format}-${courseId}`);
      setMessage();
      const response = await api.get(`/reports/export/${courseId}?format=${format}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], {
        type: format === 'pdf' ? 'application/pdf' : 'text/csv',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance_${courseId}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage('Report downloaded successfully.');
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Report download failed.');
    } finally {
      setBusyAction('');
    }
  };

  const handleDownloadSpecialReport = async (reportType, format) => {
    try {
      setBusyAction(`download-${reportType}-${format}`);
      setMessage();
      const endpoint = reportType === 'system' ? `/reports/system/export?format=${format}` : `/reports/me/export?format=${format}`;
      const response = await api.get(endpoint, { responseType: 'blob' });
      const blob = new Blob([response.data], {
        type: format === 'pdf' ? 'application/pdf' : 'text/csv',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportType}_report.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage('Report downloaded successfully.');
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Report download failed.');
    } finally {
      setBusyAction('');
    }
  };

  const handleCreateRegistryRecord = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('create-registry');
      setMessage();
      await api.post('/registry', registryForm);
      setRegistryForm(initialRegistryForm);
      setMessage('Student registry record saved successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Registry record could not be saved.');
    } finally {
      setBusyAction('');
    }
  };

  const handleBulkRegistryImport = async () => {
    try {
      setBusyAction('bulk-registry');
      setMessage();
      const records = JSON.parse(bulkRegistry);
      await api.post('/registry/bulk', { records });
      setBulkRegistry('');
      setMessage('Registry records imported successfully.');
      await loadData(true);
    } catch (actionError) {
      const message = actionError instanceof SyntaxError ? 'Bulk registry import must be valid JSON.' : actionError.response?.data?.message || 'Bulk registry import failed.';
      setMessage('', message);
    } finally {
      setBusyAction('');
    }
  };

  const normalizeHeader = (value) => String(value || '').trim().toLowerCase().replace(/[\s_-]/g, '');

  const parseCsvRow = (row) => {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < row.length; index += 1) {
      const char = row[index];
      if (char === '"') {
        if (inQuotes && row[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    values.push(current.trim());
    return values.map((value) => value.replace(/^"|"$/g, ''));
  };

  const fileToBase64 = async (file) => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';

    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    }

    return window.btoa(binary);
  };

  const splitName = (name) => {
    const pieces = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (pieces.length === 0) {
      return { firstName: '', lastName: '' };
    }
    if (pieces.length === 1) {
      return { firstName: pieces[0], lastName: pieces[0] };
    }
    return { firstName: pieces[0], lastName: pieces[pieces.length - 1] };
  };

  const handleRegistryCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setBusyAction('bulk-registry-csv');
      setMessage();
      setRegistryFileName(file.name);

      const content = await file.text();
      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (lines.length < 2) {
        throw new Error('CSV file must include a header row and at least one student row');
      }

      const headers = parseCsvRow(lines[0]).map(normalizeHeader);
      const records = lines.slice(1).map((line) => {
        const values = parseCsvRow(line);
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        const fullName = row.fullname || row.studentname || row.name || '';
        const derivedName = splitName(fullName);
        const firstName = row.firstname || derivedName.firstName;
        const lastName = row.lastname || row.surname || derivedName.lastName;

        const matricNumber = row.matricnumber || row.matric || row.regnumber || row.registrationnumber || '';
        if (!matricNumber || !firstName || !lastName) {
          throw new Error('Each row must contain at least matric number and student name');
        }

        return {
          matricNumber: matricNumber.toUpperCase(),
          firstName,
          lastName,
          otherName: row.othername || '',
          faculty: row.faculty || 'Not Assigned',
          department: row.department || 'Not Assigned',
          program: row.program || row.course || 'Not Assigned',
          level: row.level || '',
          admissionYear: row.admissionyear || row.year || '',
        };
      });

      await api.post('/registry/bulk', { records });
      setMessage(`Registry CSV imported successfully from ${file.name}.`);
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || actionError.message || 'CSV import failed.');
    } finally {
      setBusyAction('');
      event.target.value = '';
    }
  };

  const handleCourseCatalogCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setBusyAction('bulk-courses-csv');
      setMessage();
      setCourseCatalogFileName(file.name);

      const content = await file.text();
      const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length < 2) {
        throw new Error('Course CSV must include a header row and at least one course row');
      }

      const headers = parseCsvRow(lines[0]).map(normalizeHeader);
      const coursesPayload = lines.slice(1).map((line) => {
        const values = parseCsvRow(line);
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        const courseCode = (row.coursecode || row.code || '').toUpperCase();
        const courseName = row.coursename || row.title || row.name || '';
        const lecturerEmail = row.lectureremail || row.lecturer || row.email || '';
        const lecturerId = row.lecturerid || '';

        if (!courseCode || !courseName || !(lecturerEmail || lecturerId) || !row.semester || !row.academicyear) {
          throw new Error('Each course row must include courseCode, courseName, semester, academicYear, and lecturerEmail or lecturerId');
        }

        return {
          courseCode,
          courseName,
          semester: row.semester.toLowerCase(),
          academicYear: row.academicyear,
          lecturerEmail,
          lecturerId,
          description: row.description || '',
          faculty: row.faculty || '',
          department: row.department || '',
          program: row.program || '',
          level: row.level || '',
        };
      });

      const response = await api.post('/courses/bulk', { courses: coursesPayload });
      setMessage(`Course catalog imported successfully from ${file.name}. ${response.data.data?.count || coursesPayload.length} course rows processed.`);
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || actionError.message || 'Course catalog import failed.');
    } finally {
      setBusyAction('');
      event.target.value = '';
    }
  };

  const handleTimetableCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setBusyAction('bulk-timetable-csv');
      setMessage();
      setTimetableFileName(file.name);

      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      if (isPdf) {
        const base64Data = await fileToBase64(file);
        const response = await api.post('/courses/timetable/pdf-import', {
          fileName: file.name,
          base64Data,
          autoAssignClaimedStudents: true,
        });
        const importedDepartments = response.data.data?.departments?.length || 0;
        const importedCourses = response.data.data?.courseCount || 0;
        const syncedEnrollments = response.data.data?.syncedEnrollments || 0;
        setMessage(`Timetable PDF imported from ${file.name}. ${importedDepartments} departments matched, ${importedCourses} course records updated, ${syncedEnrollments} student course enrollments synced.`);
        await loadData(true);
        return;
      }

      const content = await file.text();
      const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length < 2) {
        throw new Error('Timetable CSV must include a header row and at least one timetable row');
      }

      const headers = parseCsvRow(lines[0]).map(normalizeHeader);
      const schedules = lines.slice(1).map((line) => {
        const values = parseCsvRow(line);
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        const courseCode = (row.coursecode || row.code || '').toUpperCase();
        const dayOfWeek = row.dayofweek || row.day || '';
        const startTime = row.starttime || row.start || '';
        const endTime = row.endtime || row.end || '';
        if (!courseCode || !dayOfWeek || !startTime || !endTime) {
          throw new Error('Each timetable row must include courseCode, dayOfWeek, startTime, and endTime');
        }

        return {
          courseCode,
          dayOfWeek,
          startTime,
          endTime,
          venue: row.venue || row.location || '',
          notifyMinutesBefore: row.notifyminutesbefore || row.notifybefore || '30',
        };
      });

      const response = await api.post('/courses/schedules/bulk', { schedules });
      setMessage(`Timetable imported successfully from ${file.name}. ${response.data.data?.count || schedules.length} schedule rows processed.`);
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || actionError.message || 'Timetable import failed.');
    } finally {
      setBusyAction('');
      event.target.value = '';
    }
  };

  const handleLecturerRosterCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!lecturerRosterCourseId) {
      setMessage('', 'Choose a course before importing the student roster.');
      event.target.value = '';
      return;
    }

    try {
      setBusyAction('bulk-course-roster-csv');
      setMessage();
      setLecturerRosterFileName(file.name);

      const content = await file.text();
      const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (lines.length < 2) {
        throw new Error('Roster CSV must include a header row and at least one student row');
      }

      const headers = parseCsvRow(lines[0]).map(normalizeHeader);
      const studentsPayload = lines.slice(1).map((line) => {
        const values = parseCsvRow(line);
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });

        const matricNumber = (row.matricnumber || row.matric || row.regnumber || '').toUpperCase();
        const email = row.email || '';
        if (!matricNumber && !email) {
          throw new Error('Each roster row must include matricNumber or email');
        }

        return {
          matricNumber,
          email,
        };
      });

      const response = await api.post(`/courses/${lecturerRosterCourseId}/enrollments/bulk`, { students: studentsPayload });
      const missingCount = response.data.data?.missing?.length || 0;
      setMessage(`Roster import completed from ${file.name}. ${response.data.data?.count || 0} students linked.${missingCount ? ` ${missingCount} rows could not be matched.` : ''}`);
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || actionError.message || 'Student roster import failed.');
    } finally {
      setBusyAction('');
      event.target.value = '';
    }
  };

  const handleCreateSession = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('create-session');
      setMessage();
      const response = await api.post('/attendance/sessions', sessionForm);
      setSessionForm(initialSessionForm);
      setMessage(`Attendance session created. Session code: ${response.data.data.sessionCode}`);
      await loadData(true);
      await loadSessionDetail(response.data.data.session.id);
      setActiveTab('sessions');
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Session could not be created.');
    } finally {
      setBusyAction('');
    }
  };

  const handleCloseSession = async (sessionId) => {
    try {
      setBusyAction(`close-session-${sessionId}`);
      setMessage();
      const response = await api.put(`/attendance/sessions/${sessionId}/close`);
      setMessage(`${response.data.message}. ${response.data.data.absentCount} absent students were identified.`);
      await loadData(true);
      await loadSessionDetail(sessionId);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Session could not be closed.');
    } finally {
      setBusyAction('');
    }
  };

  const handleCreateQuery = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('create-query');
      setMessage();
      await api.post('/queries', queryForm);
      setQueryForm(initialQueryForm);
      setMessage('Absence query sent successfully.');
      await loadData(true);
      if (queryForm.sessionId) {
        await loadSessionDetail(queryForm.sessionId);
      }
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Absence query could not be sent.');
    } finally {
      setBusyAction('');
    }
  };

  const handleRespondToQuery = async (queryId) => {
    try {
      setBusyAction(`respond-query-${queryId}`);
      setMessage();
      await api.patch(`/queries/${queryId}/respond`, { response: responseDrafts[queryId] || '' });
      setResponseDrafts((current) => ({ ...current, [queryId]: '' }));
      setMessage('Response submitted successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Response could not be submitted.');
    } finally {
      setBusyAction('');
    }
  };

  const handleCloseQuery = async (queryId) => {
    try {
      setBusyAction(`close-query-${queryId}`);
      setMessage();
      await api.patch(`/queries/${queryId}/close`);
      setMessage('Query closed successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Query could not be closed.');
    } finally {
      setBusyAction('');
    }
  };

  const handleMarkAttendance = useCallback(async (overrideCode) => {
    if (attendanceRequestRef.current) {
      return false;
    }

    try {
      const sessionCode = String(overrideCode || attendanceForm.sessionCode || '').trim().toUpperCase();
      if (!sessionCode) {
        setMessage('', 'Enter or scan a valid session code before marking attendance.');
        return false;
      }

      attendanceRequestRef.current = true;
      setBusyAction('mark-attendance');
      setMessage();
      const location = attendanceForm.useLocation ? await getCurrentLocation() : null;
      const response = await api.post('/attendance/mark', {
        sessionCode,
        latitude: location?.latitude,
        longitude: location?.longitude,
      });
      setAttendanceForm(initialAttendanceForm);
      setMessage(response.data?.message || 'Attendance marked successfully.');
      await loadData(true);
      return true;
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Attendance could not be marked.');
      return false;
    } finally {
      attendanceRequestRef.current = false;
      setBusyAction('');
    }
  }, [attendanceForm.sessionCode, attendanceForm.useLocation, loadData]);

  const handleDeactivateUser = async (userId) => {
    try {
      setBusyAction(`deactivate-user-${userId}`);
      setMessage();
      await api.delete(`/users/${userId}`);
      setMessage('User deactivated successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'User could not be deactivated.');
    } finally {
      setBusyAction('');
    }
  };

  const handleSelectStudent = async (studentId) => {
    setSelectedStudentId(studentId);
    if (!studentId) {
      setStudentEditForm({ firstName: '', lastName: '', matricNumber: '', department: '', faculty: '', program: '' });
      setEnrollmentForm((current) => ({ ...current, courseIds: [] }));
      return;
    }

    const student = students.find((entry) => String(entry.id) === String(studentId));
    if (student) {
      setStudentEditForm({
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        matricNumber: student.matricNumber || '',
        department: student.department || '',
        faculty: student.faculty || '',
        program: student.program || '',
      });
    }

    try {
      const response = await api.get(`/users/${studentId}/enrollments`);
      const enrollments = response.data.data || [];
      if (enrollments.length > 0) {
        const primary = enrollments[0];
        const semester = primary.semester || enrollmentForm.semester;
        const academicYear = primary.academicYear || enrollmentForm.academicYear;
        const courseIds = enrollments
          .filter((entry) => entry.semester === semester && entry.academicYear === academicYear)
          .map((entry) => entry.courseId);
        setEnrollmentForm({ semester, academicYear, courseIds });
      } else {
        setEnrollmentForm((current) => ({ ...current, courseIds: [] }));
      }
    } catch (loadError) {}
  };

  const toggleEnrollmentCourse = (courseId) => {
    setEnrollmentForm((current) => ({
      ...current,
      courseIds: current.courseIds.includes(courseId)
        ? current.courseIds.filter((id) => id !== courseId)
        : [...current.courseIds, courseId],
    }));
  };

  const handleUpdateStudentProfile = async (event) => {
    event.preventDefault();
    if (!selectedStudentId) {
      setMessage('', 'Select a student first.');
      return;
    }

    try {
      setBusyAction('update-student-profile');
      setMessage();
      await api.put(`/users/${selectedStudentId}`, studentEditForm);
      setMessage('Student profile updated successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Student profile update failed.');
    } finally {
      setBusyAction('');
    }
  };

  const handleUpdateStudentEnrollments = async (event) => {
    event.preventDefault();
    if (!selectedStudentId) {
      setMessage('', 'Select a student first.');
      return;
    }

    try {
      setBusyAction('update-student-enrollments');
      setMessage();
      await api.put(`/users/${selectedStudentId}/enrollments`, enrollmentForm);
      setMessage('Student courses updated successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Student course update failed.');
    } finally {
      setBusyAction('');
    }
  };

  const handleReactivateUser = async (userId) => {
    try {
      const tempPassword = reactivateDrafts[userId] || '';
      if (tempPassword.length < 8) {
        setMessage('', 'Temporary password must be at least 8 characters.');
        return;
      }
      setBusyAction(`reactivate-user-${userId}`);
      setMessage();
      await api.post(`/users/${userId}/reactivate`, { tempPassword });
      setMessage('User reactivated with temporary password.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'User could not be reactivated.');
    } finally {
      setBusyAction('');
    }
  };

  const handleLinkRegistry = async () => {
    try {
      if (!linkForm.registryId || !linkForm.userId) {
        setMessage('', 'Choose both a registry record and a user.');
        return;
      }
      setBusyAction('link-registry');
      setMessage();
      await api.patch(`/registry/${linkForm.registryId}/link`, { userId: linkForm.userId });
      setMessage('Registry record linked to user.');
      setLinkForm({ registryId: '', userId: '' });
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Registry link failed.');
    } finally {
      setBusyAction('');
    }
  };

  const filteredUsers = useMemo(() => (!search ? users : users.filter((entry) => [entry.firstName, entry.lastName, entry.email, entry.role, entry.department, entry.matricNumber].some((value) => includesSearch(value, search)))), [search, users]);
  const filteredCourses = useMemo(() => (!search ? courses : courses.filter((entry) => [entry.courseCode, entry.courseName, entry.academicYear, entry.semester, fullName(entry.lecturer)].some((value) => includesSearch(value, search)))), [courses, search]);
  const filteredBuildings = useMemo(
    () =>
      !search
        ? buildings
        : buildings.filter((entry) => [entry.name, entry.tag].some((value) => includesSearch(value, search))),
    [buildings, search]
  );
  const selectedStudent = useMemo(
    () => students.find((entry) => String(entry.id) === String(selectedStudentId)) || null,
    [selectedStudentId, students]
  );
  const groupedCourses = useMemo(() => {
    const departmentMap = new Map();

    filteredCourses.forEach((course) => {
      const departmentLabel = getCourseDepartmentLabel(course);
      const levelLabel = getCourseLevelLabel(course);

      if (!departmentMap.has(departmentLabel)) {
        departmentMap.set(departmentLabel, new Map());
      }

      const levelMap = departmentMap.get(departmentLabel);
      if (!levelMap.has(levelLabel)) {
        levelMap.set(levelLabel, []);
      }

      levelMap.get(levelLabel).push(course);
    });

    return [...departmentMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([department, levels]) => ({
        department,
        levels: [...levels.entries()]
          .sort(([left], [right]) => {
            const leftNumber = Number.parseInt(String(left).replace(/\D/g, ''), 10);
            const rightNumber = Number.parseInt(String(right).replace(/\D/g, ''), 10);
            if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) {
              return left.localeCompare(right);
            }
            return leftNumber - rightNumber;
          })
          .map(([level, items]) => ({
            level,
            items: items.sort((left, right) => String(left.courseCode || '').localeCompare(String(right.courseCode || ''))),
          })),
      }));
  }, [filteredCourses]);
  const groupedEnrollmentCourses = useMemo(() => {
    const currentYear = normalizeAcademicYearValue(enrollmentForm.academicYear);
    const relevantCourses = courses.filter((course) => {
      if (course.isActive === false) {
        return false;
      }

      if (String(course.semester || '').toLowerCase() !== String(enrollmentForm.semester || '').toLowerCase()) {
        return false;
      }

      return !currentYear || normalizeAcademicYearValue(course.academicYear) === currentYear;
    });

    const departmentMap = new Map();
    relevantCourses.forEach((course) => {
      const departmentLabel = getCourseDepartmentLabel(course);
      const levelLabel = getCourseLevelLabel(course);

      if (!departmentMap.has(departmentLabel)) {
        departmentMap.set(departmentLabel, new Map());
      }

      const levelMap = departmentMap.get(departmentLabel);
      if (!levelMap.has(levelLabel)) {
        levelMap.set(levelLabel, []);
      }

      levelMap.get(levelLabel).push(course);
    });

    return [...departmentMap.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([department, levels]) => ({
        department,
        levels: [...levels.entries()]
          .sort(([left], [right]) => {
            const leftNumber = Number.parseInt(String(left).replace(/\D/g, ''), 10);
            const rightNumber = Number.parseInt(String(right).replace(/\D/g, ''), 10);
            if (Number.isNaN(leftNumber) || Number.isNaN(rightNumber)) {
              return left.localeCompare(right);
            }
            return leftNumber - rightNumber;
          })
          .map(([level, items]) => ({
            level,
            items: items.sort((left, right) => String(left.courseCode || '').localeCompare(String(right.courseCode || ''))),
          })),
      }));
  }, [courses, enrollmentForm.academicYear, enrollmentForm.semester]);
  const recommendedEnrollmentIds = useMemo(() => {
    if (!selectedStudent) {
      return [];
    }

    const targetDepartment = normalizeSearch(selectedStudent.department);
    const targetFaculty = normalizeSearch(selectedStudent.faculty);
    const targetProgram = normalizeSearch(selectedStudent.program);
    const targetLevel = String(selectedStudent.level || selectedStudent.registryRecord?.level || '').trim();
    const targetYear = normalizeAcademicYearValue(enrollmentForm.academicYear);

    return courses
      .filter((course) => {
        if (course.isActive === false) {
          return false;
        }

        if (String(course.semester || '').toLowerCase() !== String(enrollmentForm.semester || '').toLowerCase()) {
          return false;
        }

        if (targetYear && normalizeAcademicYearValue(course.academicYear) !== targetYear) {
          return false;
        }

        const departmentMatches = !targetDepartment || normalizeSearch(course.department).includes(targetDepartment) || targetDepartment.includes(normalizeSearch(course.department));
        const facultyMatches = !targetFaculty || normalizeSearch(course.faculty).includes(targetFaculty) || targetFaculty.includes(normalizeSearch(course.faculty));
        const programMatches = !targetProgram || normalizeSearch(course.program).includes(targetProgram) || targetProgram.includes(normalizeSearch(course.program));
        const levelMatches = !targetLevel || String(course.level || '').trim() === targetLevel;

        return (departmentMatches || facultyMatches || programMatches) && levelMatches;
      })
      .map((course) => course.id);
  }, [courses, enrollmentForm.academicYear, enrollmentForm.semester, selectedStudent]);

  const registryFilterOptions = useMemo(() => {
    const unique = (values) => [...new Set(values.filter(Boolean))].sort();
    return {
      faculty: unique(registry.map((entry) => entry.faculty)),
      department: unique(registry.map((entry) => entry.department)),
      program: unique(registry.map((entry) => entry.program)),
      level: unique(registry.map((entry) => entry.level)),
    };
  }, [registry]);

  const filteredRegistry = useMemo(() => {
    return registry.filter((entry) => {
      if (search && ![entry.matricNumber, entry.firstName, entry.lastName, entry.program, entry.faculty, entry.department].some((value) => includesSearch(value, search))) {
        return false;
      }
      if (registryFilters.faculty && entry.faculty !== registryFilters.faculty) return false;
      if (registryFilters.department && entry.department !== registryFilters.department) return false;
      if (registryFilters.program && entry.program !== registryFilters.program) return false;
      if (registryFilters.level && entry.level !== registryFilters.level) return false;
      if (registryFilters.claimed === 'true' && !entry.claimedByUserId) return false;
      if (registryFilters.claimed === 'false' && entry.claimedByUserId) return false;
      return true;
    });
  }, [registry, registryFilters, search]);
  const filteredSessions = useMemo(() => (!search ? sessions : sessions.filter((entry) => [entry.sessionCode, entry.date, entry.status, entry.course?.courseCode, entry.course?.courseName, entry.venue].some((value) => includesSearch(value, search)))), [search, sessions]);
  const filteredQueries = useMemo(() => (!search ? queries : queries.filter((entry) => [entry.title, entry.message, entry.status, fullName(entry.student), entry.student?.matricNumber, entry.session?.course?.courseCode].some((value) => includesSearch(value, search)))), [queries, search]);
  const selectedQuerySession = useMemo(() => {
    if (!queryForm.sessionId) {
      return null;
    }

    return sessions.find((session) => String(session.id) === String(queryForm.sessionId)) || null;
  }, [queryForm.sessionId, sessions]);
  const queryEligibleStudents = useMemo(() => {
    if (role !== 'lecturer') {
      return students;
    }

    if (sessionDetail && String(sessionDetail.id) === String(queryForm.sessionId)) {
      const absentStudents = sessionDetail.absentStudents || [];
      if (absentStudents.length > 0) {
        return absentStudents;
      }

      const enrolledStudents = sessionDetail.enrolledStudents || [];
      if (enrolledStudents.length > 0) {
        return enrolledStudents;
      }
    }

    return students;
  }, [queryForm.sessionId, role, sessionDetail, students]);

  const stats = useMemo(() => {
    if (role === 'admin') {
      return [
        { label: 'Users', value: summary?.totalUsers || 0, helper: 'All registered roles', icon: Users, tone: 'bg-blue-600' },
        { label: 'Courses', value: summary?.totalCourses || 0, helper: 'Active teaching records', icon: BookOpen, tone: 'bg-slate-900' },
        { label: 'Registry', value: summary?.totalRegistryRecords || 0, helper: `${summary?.claimedRegistryRecords || 0} claimed by students`, icon: ShieldCheck, tone: 'bg-sky-500' },
        { label: 'Queries', value: summary?.pendingQueries || 0, helper: 'Pending absence follow-ups', icon: Bell, tone: 'bg-amber-500' },
      ];
    }

    if (role === 'lecturer') {
      return [
        { label: 'Courses', value: summary?.totalCourses || 0, helper: 'Courses assigned to you', icon: BookOpen, tone: 'bg-blue-600' },
        { label: 'Active Sessions', value: summary?.activeSessions || 0, helper: 'Attendance windows open now', icon: Calendar, tone: 'bg-slate-900' },
        { label: 'Pending Queries', value: summary?.pendingQueries || 0, helper: 'Students awaiting follow-up', icon: Bell, tone: 'bg-amber-500' },
        { label: 'Students', value: summary?.totalStudents || 0, helper: 'Students available in system', icon: Users, tone: 'bg-sky-500' },
      ];
    }

    return [
      { label: 'Courses', value: summary?.totalCourses || 0, helper: 'Courses you are enrolled in', icon: BookOpen, tone: 'bg-blue-600' },
      { label: 'Attendance Marks', value: summary?.totalAttendanceMarks || 0, helper: 'Total sessions marked', icon: CheckCircle2, tone: 'bg-slate-900' },
      { label: 'Pending Queries', value: summary?.pendingQueries || 0, helper: 'Lecturer questions awaiting your reply', icon: Bell, tone: 'bg-amber-500' },
      { label: 'Late Marks', value: summary?.lateMarks || 0, helper: 'Sessions marked after grace period', icon: Clock3, tone: 'bg-sky-500' },
    ];
  }, [role, summary]);

  const analyticsHighlights = useMemo(() => analytics?.highlightCards || [], [analytics]);
  const analyticsBreakdowns = useMemo(() => {
    const charts = analytics?.charts || {};
    return Object.entries(charts).map(([key, values]) => ({
      key,
      title: key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase()),
      values: values || [],
    }));
  }, [analytics]);

  const reportActions = useMemo(() => {
    if (role === 'admin') {
      return [
        { key: 'system-csv', label: 'Download system CSV', reportType: 'system', format: 'csv' },
        { key: 'system-pdf', label: 'Download system PDF', reportType: 'system', format: 'pdf' },
      ];
    }

    if (role === 'student') {
      return [
        { key: 'my-csv', label: 'Download my CSV', reportType: 'me', format: 'csv' },
        { key: 'my-pdf', label: 'Download my PDF', reportType: 'me', format: 'pdf' },
      ];
    }

    return [
      { key: 'lecturer-note', label: 'Use course cards below', helper: 'Download per-course reports from your Courses tab.' },
    ];
  }, [role]);

  const primaryStats = useMemo(() => stats.slice(0, 4), [stats]);
  const recentActivity = useMemo(() => {
    if (notifications.length > 0) {
      return notifications.slice(0, 4);
    }

    if (role === 'student') {
      return history.slice(0, 4).map((entry) => ({
        title: `Attendance ${entry.status}`,
        description: `${entry.session?.course?.courseCode || 'Course'} on ${formatDateTime(entry.markedAt)}`,
        createdAt: entry.markedAt,
        tone: entry.status === 'present' ? 'emerald' : entry.status === 'late' ? 'amber' : 'rose',
      }));
    }

    if (role === 'lecturer') {
      return queries.slice(0, 4).map((entry) => ({
        title: entry.title,
        description: entry.message,
        createdAt: entry.createdAt,
        tone: entry.status === 'pending' ? 'amber' : 'blue',
      }));
    }

    return courses.slice(0, 4).map((entry) => ({
      title: `${entry.courseCode} active`,
      description: entry.courseName,
      createdAt: entry.createdAt,
      tone: 'blue',
    }));
  }, [courses, history, notifications, queries, role]);

  const upcomingItems = useMemo(() => {
    if (role === 'student') {
      return courses.slice(0, 3).map((course, index) => ({
        title: course.courseName || course.courseCode,
        subtitle: course.courseCode,
        time: index === 0 ? '10:00 AM' : index === 1 ? '12:00 PM' : '2:00 PM',
      }));
    }

    if (role === 'lecturer') {
      return sessions.slice(0, 3).map((session) => ({
        title: session.course?.courseName || session.course?.courseCode || 'Attendance session',
        subtitle: session.course?.courseCode || session.sessionCode,
        time: formatTime(session.startTime),
      }));
    }

    return [
      { title: 'Registry audit', subtitle: 'Admin workflow', time: '09:00 AM' },
      { title: 'Course review', subtitle: 'Academic setup', time: '11:30 AM' },
      { title: 'Report export', subtitle: 'Faculty reports', time: '03:00 PM' },
    ];
  }, [courses, role, sessions]);

  const attendanceTrendValues = useMemo(() => {
    const series = role === 'student'
      ? [
          history.filter((entry) => entry.status === 'present').length * 10 + 35,
          45,
          57,
          62,
          59,
          72,
          Math.min(95, (history.filter((entry) => entry.status === 'present').length * 12) + 40),
        ]
      : role === 'lecturer'
        ? [
            44,
            48,
            58,
            61,
            60,
            76,
            Math.min(95, (sessionDetail?.attendanceStats?.markedCount || 0) + 55),
          ]
        : [40, 52, 57, 63, 66, 74, 88];

    return series.map((value) => Math.min(100, Math.max(15, value)));
  }, [history, role, sessionDetail]);

  const trendPoints = useMemo(() => buildTrendPoints(attendanceTrendValues), [attendanceTrendValues]);
  const trendPath = useMemo(
    () => trendPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' '),
    [trendPoints]
  );
  const trendArea = useMemo(
    () => `${trendPath} L ${trendPoints[trendPoints.length - 1]?.x || 660},240 L 0,240 Z`,
    [trendPath, trendPoints]
  );

  const handleLogout = () => {
    dispatch(logout());
  };

  const handleUpdateProfile = async (event) => {
    event.preventDefault();
    try {
      setBusyAction('update-profile');
      setMessage();
      const response = await api.put('/users/me/profile', profileForm);
      setProfile((current) => ({ ...(current || {}), ...response.data.data }));
      setMessage('Profile updated successfully.');
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Profile update failed.');
    } finally {
      setBusyAction('');
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      setMessage('', 'Current password and new password are required.');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setMessage('', 'New password and confirmation do not match.');
      return;
    }

    try {
      setBusyAction('change-password');
      setMessage();
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setMessage('Password changed successfully.');
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Password change failed.');
    } finally {
      setBusyAction('');
    }
  };

  if (loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-900'}`}>
        <div className={`rounded-[2rem] border px-8 py-6 text-center backdrop-blur-xl ${isDark ? 'border-white/10 bg-white/5' : 'border-slate-200 bg-white/90'}`}>
          <LoaderCircle className="mx-auto h-10 w-10 animate-spin text-blue-300" />
          <p className={`mt-4 text-sm ${isDark ? 'text-slate-200' : 'text-slate-600'}`}>Loading your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`dashboard-shell min-h-screen ${isDark ? 'dark dashboard-shell--app text-slate-100' : 'text-slate-900'}`}>
      <QrScannerPanel isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleMarkAttendance} />
      <div className="dashboard-frame">
        <button
          type="button"
          aria-label="Close navigation menu"
          className={`dashboard-sidebar-backdrop ${sidebarOpen ? 'is-visible' : ''}`}
          onClick={() => setSidebarOpen(false)}
        />
        <aside className={`dashboard-sidebar ${sidebarOpen ? 'is-open' : ''}`}>
          <div className="dashboard-brand">
            <div className="dashboard-brand__logo">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span>Attendance System</span>
          </div>

          <nav className="dashboard-nav">
            {primaryTabs.map((tab) => {
              const Icon = TAB_ICONS[tab] || LayoutDashboard;
              return (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setSidebarOpen(false);
                  }}
                  className={`dashboard-nav__item ${activeTab === tab ? 'is-active' : ''}`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{TAB_LABELS[tab]}</span>
                </button>
              );
            })}
          </nav>

          <div className="dashboard-sidebar__footer">
            <div className="dashboard-userchip">
              <div className="dashboard-userchip__avatar">{(user?.firstName || user?.email || 'A').charAt(0).toUpperCase()}</div>
              <div>
                <p className="dashboard-userchip__name">{fullName(user)}</p>
                <p className="dashboard-userchip__meta">{role}</p>
              </div>
              <ChevronDown className="h-4 w-4" />
            </div>
          </div>
        </aside>

        <main className="dashboard-main">
          <header className="dashboard-topbar">
            <div className="dashboard-topbar__left">
              <button className="dashboard-menu-button" onClick={() => setSidebarOpen((current) => !current)}>
                <Menu className="h-5 w-5" />
              </button>
              <div className="dashboard-search">
                <Search className="h-4 w-4 text-slate-500" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search..." />
              </div>
            </div>
            <div className="dashboard-topbar__right">
              <button className="dashboard-icon-button">
                <Bell className="h-5 w-5" />
              </button>
              <div className={`dashboard-account-menu ${accountMenuOpen ? 'is-open' : ''}`}>
                <button type="button" className="dashboard-account" onClick={() => setAccountMenuOpen((current) => !current)}>
                  <div className="dashboard-account__avatar">{(user?.firstName || user?.email || 'A').charAt(0).toUpperCase()}</div>
                  <ChevronDown className="h-4 w-4" />
                </button>
                <div className="dashboard-account-dropdown">
                  {tabs.includes('analytics') && (
                    <button
                      type="button"
                      className="dashboard-account-dropdown__item"
                      onClick={() => {
                        setActiveTab('analytics');
                        setAccountMenuOpen(false);
                        setSidebarOpen(false);
                      }}
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Analytics</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="dashboard-account-dropdown__item"
                    onClick={() => {
                      setActiveTab('profile');
                      setAccountMenuOpen(false);
                      setSidebarOpen(false);
                    }}
                  >
                    <UserCog className="h-4 w-4" />
                    <span>Profile</span>
                  </button>
                  {tabs.includes('help') && (
                    <button
                      type="button"
                      className="dashboard-account-dropdown__item"
                      onClick={() => {
                        setActiveTab('help');
                        setAccountMenuOpen(false);
                        setSidebarOpen(false);
                      }}
                    >
                      <CircleHelp className="h-4 w-4" />
                      <span>Help</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="dashboard-account-dropdown__item"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      handleLogout();
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            </div>
          </header>

          <section className="dashboard-content">
        {error && <div className="mb-6 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
        {success && <div className="mb-6 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{success}</div>}
        <div className="mt-2 grid gap-8">

          {activeTab === 'overview' && (
            <div className="dashboard-overview">
              <section className="dashboard-welcome">
                <h1>Welcome back, {user?.firstName || 'there'} <span className="wave" role="img" aria-label="waving hand">{'\u{1F44B}'}</span></h1>
                <p>
                  {role === 'admin' && "Here's what's happening across the system today."}
                  {role === 'lecturer' && "Here's what's happening with your classes today."}
                  {role === 'student' && "Here's what's happening today."}
                </p>
              </section>

              <div className="dashboard-stat-grid">
                {primaryStats.map((stat, index) => (
                  <article key={stat.label} className="dashboard-stat-card">
                    <div className={`dashboard-stat-card__icon tone-${index + 1}`}>
                      <stat.icon className="h-5 w-5" />
                    </div>
                    <p className="dashboard-stat-card__label">{stat.label}</p>
                    <p className="dashboard-stat-card__value">{stat.value}</p>
                    <p className="dashboard-stat-card__helper">{stat.helper}</p>
                  </article>
                ))}
              </div>

              <div className="dashboard-overview__grid">
                <section className="dashboard-chart-card">
                  <div className="dashboard-card__header">
                    <div>
                      <h2>Attendance</h2>
                      <p>Weekly overview</p>
                    </div>
                    <div className="dashboard-card__meta">Compared to last week</div>
                  </div>
                  <div className="dashboard-chart__summary">
                    <span>{attendanceTrendValues[attendanceTrendValues.length - 1]}%</span>
                    <small>Current trend</small>
                  </div>
                  <div className="dashboard-chart">
                    <svg viewBox="0 0 660 240" preserveAspectRatio="none">
                      <defs>
                        <linearGradient id="attendanceFill" x1="0%" x2="0%" y1="0%" y2="100%">
                          <stop offset="0%" stopColor="rgba(90,137,255,0.35)" />
                          <stop offset="100%" stopColor="rgba(90,137,255,0.02)" />
                        </linearGradient>
                      </defs>
                      {[0, 1, 2, 3].map((line) => (
                        <line key={line} x1="0" x2="660" y1={line * 60} y2={line * 60} className="dashboard-chart__grid" />
                      ))}
                      <path d={trendArea} fill="url(#attendanceFill)" />
                      <path d={trendPath} className="dashboard-chart__line" />
                      {trendPoints.map((point, index) => (
                        <circle key={index} cx={point.x} cy={point.y} r="5" className="dashboard-chart__point" />
                      ))}
                    </svg>
                    {role === 'student' && `${history[0]?.session?.course?.courseCode || 'No latest attendance yet'} - Stay on top of your courses and lecturer responses.`}
                    {role === 'lecturer' && `${activeSession?.course?.courseCode || 'No active session'} - Keep attendance open only during class and close promptly after.`}
                    {role === 'admin' && `${summary?.totalCourses || 0} active courses - Registry, users, and reports are all available from the left menu.`}
                  </div>
                </section>

                <div className="dashboard-stack">
                  <section className="dashboard-feed-card">
                    <div className="dashboard-card__header">
                      <h2>Recent Activity</h2>
                    </div>
                    <div className="dashboard-feed">
                      {recentActivity.slice(0, 3).map((item, index) => (
                        <div key={`${item.title}-${index}`} className="dashboard-feed__item">
                          <div className={`dashboard-feed__icon tone-${(index % 3) + 1}`}>
                            {index === 0 ? <CheckCircle2 className="h-4 w-4" /> : index === 1 ? <Bell className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                          </div>
                          <div>
                            <p className="dashboard-feed__title">{item.title}</p>
                            <p className="dashboard-feed__description">{item.description}</p>
                            <span className="dashboard-feed__time">{formatDateTime(item.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="dashboard-upcoming-card">
                    <div className="dashboard-card__header">
                      <h2>Upcoming {role === 'student' ? 'Classes' : role === 'lecturer' ? 'Sessions' : 'Tasks'}</h2>
                    </div>
                    <div className="dashboard-upcoming">
                      {upcomingItems.map((item) => (
                        <div key={`${item.title}-${item.time}`} className="dashboard-upcoming__item">
                          <div className="dashboard-upcoming__icon">
                            <Calendar className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="dashboard-upcoming__title">{item.title}</p>
                            <p className="dashboard-upcoming__subtitle">{item.subtitle}</p>
                          </div>
                          <span className="dashboard-upcoming__time">{item.time}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>

              <section className="dashboard-summary-strip">
                <div className="dashboard-summary-strip__icon">
                  <LayoutDashboard className="h-5 w-5" />
                </div>
                <div>
                  <p className="dashboard-summary-strip__title">
                    {role === 'student' ? 'Attendance status' : role === 'lecturer' ? 'Current session focus' : 'System focus'}
                  </p>
                  <p className="dashboard-summary-strip__body">
                    {role === 'student' && `${history[0]?.session?.course?.courseCode || 'No latest attendance yet'} - Stay on top of your courses and lecturer responses.`}
                    {role === 'lecturer' && `${activeSession?.course?.courseCode || 'No active session'} - Keep attendance open only during class and close promptly after.`}
                    {role === 'admin' && `${summary?.totalCourses || 0} active courses - Registry, users, and reports are all available from the left menu.`}
                  </p>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'analytics' && (
            <div className="grid gap-8">
              <Panel title="Performance analytics" eyebrow="Insight center">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {analyticsHighlights.length > 0 ? analyticsHighlights.map((item) => (
                    <SummaryTile key={item.label} label={item.label} value={item.value} helper={item.helper} />
                  )) : <EmptyState title="Analytics not ready" description="We could not load advanced analytics for this role yet." />}
                </div>
              </Panel>

              <div className="grid gap-8 xl:grid-cols-[0.85fr_1.15fr]">
                <Panel title="Breakdowns" eyebrow="Distribution">
                  <div className="space-y-6">
                    {analyticsBreakdowns.map((group) => (
                      <div key={group.key}>
                        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-blue-500">{group.title}</p>
                        <div className="space-y-3">
                          {group.values.map((entry) => {
                            const total = group.values.reduce((sum, current) => sum + Number(current.value || 0), 0) || 1;
                            const width = Math.max(8, Math.round((Number(entry.value || 0) / total) * 100));
                            return (
                              <div key={`${group.key}-${entry.label}`}>
                                <div className="mb-2 flex items-center justify-between text-sm">
                                  <span className="font-medium text-slate-700 dark:text-slate-200">{entry.label}</span>
                                  <span className="text-slate-500 dark:text-slate-400">{entry.value}</span>
                                </div>
                                <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800">
                                  <div className="h-3 rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${width}%` }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>

                <Panel title="Top performance table" eyebrow="Operational detail">
                  <MetricList items={analytics?.tables?.courseAnalytics || []} emptyMessage="No course analytics are available yet for this role." />
                </Panel>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="grid gap-8 xl:grid-cols-[0.8fr_1.2fr]">
              <Panel title="Report center" eyebrow="Exports">
                <div className="space-y-4">
                  {reportActions.map((item) => item.reportType ? (
                    <button
                      key={item.key}
                      onClick={() => handleDownloadSpecialReport(item.reportType, item.format)}
                      disabled={busyAction === `download-${item.reportType}-${item.format}`}
                      className="flex w-full items-center justify-between rounded-[1.5rem] border border-slate-200 bg-slate-50/80 px-5 py-4 text-left transition hover:border-blue-300 hover:bg-blue-50/70 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-blue-700 dark:hover:bg-slate-900"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Ready-to-share export for meetings, reviews, and record keeping.</p>
                      </div>
                      {busyAction === `download-${item.reportType}-${item.format}` ? <LoaderCircle className="h-5 w-5 animate-spin text-blue-500" /> : <Download className="h-5 w-5 text-blue-500" />}
                    </button>
                  ) : (
                    <ActionTile key={item.key} title={item.label} description={item.helper} />
                  ))}
                </div>
              </Panel>

              <Panel title="What each report gives you" eyebrow="Guide">
                <div className="grid gap-4 md:grid-cols-2">
                  <ActionTile title="CSV export" description="Best for Excel, statistics work, faculty submissions, and filtering by course, student, or attendance status." />
                  <ActionTile title="PDF export" description="Best for formal presentation, approvals, and sending a clean professional summary without extra editing." />
                  <ActionTile title="Lecturer course exports" description="Lecturers can already export per-course reports directly inside the Courses tab, including PDF and CSV." />
                  <ActionTile title="Student personal history" description="Students can leave with a personal attendance record they can keep for reference or dispute resolution." />
                </div>
              </Panel>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="grid gap-8">
              <Panel title="Notification center" eyebrow="Recent activity">
                <div className="space-y-4">
                  {notifications.length > 0 ? notifications.map((item, index) => <NotificationItem key={`${item.title}-${index}`} item={item} />) : <EmptyState title="No notifications yet" description="Fresh activity, responses, and attendance events will appear here." />}
                </div>
              </Panel>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Profile summary" eyebrow="Identity">
                <div className="space-y-4">
                  <SummaryTile label="Full name" value={fullName(profile || user)} helper="Displayed throughout the system." />
                  <SummaryTile label="Email" value={profile?.email || user?.email || 'Not set'} helper="Used for login and email notifications." />
                  <SummaryTile label="Role" value={role} helper="Controls the workspace sections available to you." />
                  <SummaryTile label="Department" value={profile?.department || 'Not set'} helper="Used for reporting and institutional grouping." />
                  {profile?.matricNumber && <SummaryTile label="Matric number" value={profile.matricNumber} helper="Linked to your registry record." />}
                </div>
              </Panel>

              <div className="grid gap-8">
                <Panel title="Update your profile" eyebrow="Self service">
                  <form onSubmit={handleUpdateProfile} className="grid gap-4 md:grid-cols-2">
                    <Input label="First name" value={profileForm.firstName} onChange={(value) => setProfileForm((current) => ({ ...current, firstName: value }))} />
                    <Input label="Last name" value={profileForm.lastName} onChange={(value) => setProfileForm((current) => ({ ...current, lastName: value }))} />
                    <Input label="Department" value={profileForm.department} onChange={(value) => setProfileForm((current) => ({ ...current, department: value }))} />
                    <Input label="Faculty" value={profileForm.faculty} onChange={(value) => setProfileForm((current) => ({ ...current, faculty: value }))} />
                    <div className="md:col-span-2">
                      <Input label="Program" value={profileForm.program} onChange={(value) => setProfileForm((current) => ({ ...current, program: value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <button type="submit" disabled={busyAction === 'update-profile'} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">
                        {busyAction === 'update-profile' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
                        Save profile
                      </button>
                    </div>
                  </form>
                </Panel>

                <Panel title="Security settings" eyebrow="Password">
                  <form onSubmit={handleChangePassword} className="grid gap-4 md:grid-cols-2">
                    <Input label="Current password" type="password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, currentPassword: value }))} />
                    <Input label="New password" type="password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))} />
                    <div className="md:col-span-2">
                      <Input label="Confirm new password" type="password" value={passwordForm.confirmPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, confirmPassword: value }))} />
                    </div>
                    <div className="md:col-span-2">
                      <button type="submit" disabled={busyAction === 'change-password'} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                        {busyAction === 'change-password' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        Change password
                      </button>
                    </div>
                  </form>
                </Panel>
              </div>
            </div>
          )}

          {activeTab === 'help' && (
            <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
              <Panel title="Help & support" eyebrow="Guidance">
                <HelpArticleList articles={helpCenter.articles} contact={helpCenter.contact} />
              </Panel>
              <Panel title="Quick support actions" eyebrow="Support">
                <div className="space-y-4">
                  <ActionTile title="Check notifications first" description="Most day-to-day issues already show up in the notification center before they become a support request." />
                  <ActionTile title="Use exports for escalation" description="When reporting an issue to your department or administrator, attach the appropriate PDF or CSV report so the evidence is clear." />
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/70">
                    <div className="flex items-start gap-3">
                      <Mail className="mt-1 h-5 w-5 text-blue-500" />
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100">Support channel</p>
                        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Primary contact: {helpCenter.contact?.email || 'support@attendance-system.local'}</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">Expected response time: {helpCenter.contact?.responseTime || 'Within one working day'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            </div>
          )}

          {activeTab === 'users' && role === 'admin' && (
            <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="grid gap-8">
                <Panel title="Create a user account" eyebrow="Admin tools">
                  <form onSubmit={handleCreateUser} className="grid gap-4 md:grid-cols-2">
                    <Input label="First name" value={userForm.firstName} onChange={(value) => setUserForm((current) => ({ ...current, firstName: value }))} />
                    <Input label="Last name" value={userForm.lastName} onChange={(value) => setUserForm((current) => ({ ...current, lastName: value }))} />
                    <Input label="Email" type="email" value={userForm.email} onChange={(value) => setUserForm((current) => ({ ...current, email: value }))} />
                    <Input label="Password" type="password" value={userForm.password} onChange={(value) => setUserForm((current) => ({ ...current, password: value }))} />
                    <Select label="Role" value={userForm.role} onChange={(value) => setUserForm((current) => ({ ...current, role: value }))} options={[{ value: 'student', label: 'Student' }, { value: 'lecturer', label: 'Lecturer' }, { value: 'admin', label: 'Admin' }]} />
                    <Input label="Department" value={userForm.department} onChange={(value) => setUserForm((current) => ({ ...current, department: value }))} />
                    <Input label="Faculty" value={userForm.faculty} onChange={(value) => setUserForm((current) => ({ ...current, faculty: value }))} />
                    <Input label="Program" value={userForm.program} onChange={(value) => setUserForm((current) => ({ ...current, program: value }))} />
                    {userForm.role === 'student' && <Input label="Matric number" value={userForm.matricNumber} onChange={(value) => setUserForm((current) => ({ ...current, matricNumber: value }))} />}
                    <div className="md:col-span-2"><button type="submit" disabled={busyAction === 'create-user'} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{busyAction === 'create-user' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Create user</button></div>
                  </form>
                </Panel>

                <Panel title="Edit student profile & courses" eyebrow="Admin control">
                  <div className="space-y-5">
                    <Select
                      label="Select student"
                      value={selectedStudentId}
                      onChange={(value) => handleSelectStudent(value)}
                      options={[{ value: '', label: 'Choose student' }, ...students.map((student) => ({ value: student.id, label: `${fullName(student)}${student.matricNumber ? ` (${student.matricNumber})` : ''}` }))]}
                    />
                    <form onSubmit={handleUpdateStudentProfile} className="grid gap-4 md:grid-cols-2">
                      <Input label="First name" value={studentEditForm.firstName} onChange={(value) => setStudentEditForm((current) => ({ ...current, firstName: value }))} />
                      <Input label="Last name" value={studentEditForm.lastName} onChange={(value) => setStudentEditForm((current) => ({ ...current, lastName: value }))} />
                      <Input label="Matric number" value={studentEditForm.matricNumber} onChange={(value) => setStudentEditForm((current) => ({ ...current, matricNumber: value }))} />
                      <Input label="Department" value={studentEditForm.department} onChange={(value) => setStudentEditForm((current) => ({ ...current, department: value }))} />
                      <Input label="Faculty" value={studentEditForm.faculty} onChange={(value) => setStudentEditForm((current) => ({ ...current, faculty: value }))} />
                      <Input label="Program" value={studentEditForm.program} onChange={(value) => setStudentEditForm((current) => ({ ...current, program: value }))} />
                      <div className="md:col-span-2">
                        <button type="submit" disabled={busyAction === 'update-student-profile'} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">{busyAction === 'update-student-profile' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Update profile</button>
                      </div>
                    </form>

                    <form onSubmit={handleUpdateStudentEnrollments} className="grid gap-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Select label="Semester" value={enrollmentForm.semester} onChange={(value) => setEnrollmentForm((current) => ({ ...current, semester: value }))} options={[{ value: 'rain', label: 'Rain' }, { value: 'harmattan', label: 'Harmattan' }]} />
                        <Input label="Academic year" value={enrollmentForm.academicYear} onChange={(value) => setEnrollmentForm((current) => ({ ...current, academicYear: value }))} />
                      </div>
                      <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-700">Assign courses (admin override)</p>
                            <p className="mt-1 text-xs text-slate-500">
                              The system recommends department and level matches first, then lets you add carryovers or cross-department courses manually.
                            </p>
                          </div>
                          {selectedStudent && (
                            <div className="flex flex-wrap gap-2">
                              <Badge tone="slate">{selectedStudent.department || 'No department'}</Badge>
                              <Badge tone="blue">{selectedStudent.level ? `${selectedStudent.level} level` : 'No level'}</Badge>
                              <Badge tone="emerald">{enrollmentForm.semester} semester</Badge>
                            </div>
                          )}
                        </div>
                        <div className="mt-4 space-y-4">
                          {groupedEnrollmentCourses.length > 0 ? groupedEnrollmentCourses.map((departmentGroup) => (
                            <div key={`student-course-group-${departmentGroup.department}`} className="rounded-[1.25rem] border border-slate-200 bg-white/80 p-4">
                              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-700">{departmentGroup.department}</p>
                                <Badge tone="slate">
                                  {departmentGroup.levels.reduce((sum, levelGroup) => sum + levelGroup.items.length, 0)} courses
                                </Badge>
                              </div>
                              <div className="space-y-4">
                                {departmentGroup.levels.map((levelGroup) => (
                                  <div key={`student-course-level-${departmentGroup.department}-${levelGroup.level}`}>
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-500">{levelGroup.level}</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                      {levelGroup.items.map((course) => {
                                        const isRecommended = recommendedEnrollmentIds.includes(course.id);
                                        return (
                                          <label key={course.id} className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-sm ${isRecommended ? 'border-blue-200 bg-blue-50/70 text-slate-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                                            <input type="checkbox" checked={enrollmentForm.courseIds.includes(course.id)} onChange={() => toggleEnrollmentCourse(course.id)} className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600" />
                                            <span>
                                              <span className="block font-semibold">{course.courseCode} - {course.courseName}</span>
                                              <span className="mt-1 block text-xs text-slate-500">
                                                {fullName(course.lecturer)}{isRecommended ? ' | recommended for this student' : ''}
                                              </span>
                                            </span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )) : (
                            <EmptyState title="No timetable-linked courses yet" description="Upload the course list or timetable for this semester and academic year, then come back to assign or override a student's courses." />
                          )}
                        </div>
                      </div>
                      <button type="submit" disabled={busyAction === 'update-student-enrollments'} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{busyAction === 'update-student-enrollments' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}Update courses</button>
                    </form>
                  </div>
                </Panel>
              </div>

              <Panel title="Registered users" eyebrow="Directory">
                <div className="space-y-4">
                  {filteredUsers.length > 0 ? filteredUsers.map((entry) => (
                    <div key={entry.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-bold text-slate-950">{fullName(entry)}</p><p className="mt-1 text-sm text-slate-500">{entry.email}</p><p className="mt-2 text-sm text-slate-500">{entry.department || 'No department'} {entry.matricNumber ? `| ${entry.matricNumber}` : ''}</p>
                        </div>
                        <div className="flex flex-wrap gap-2"><Badge tone={entry.role === 'admin' ? 'slate' : entry.role === 'lecturer' ? 'blue' : 'emerald'}>{entry.role}</Badge><Badge tone={entry.isActive ? 'emerald' : 'rose'}>{entry.isActive ? 'active' : 'inactive'}</Badge></div>
                      </div>
                      {entry.isActive && entry.id !== user.id && <button onClick={() => handleDeactivateUser(entry.id)} disabled={busyAction === `deactivate-user-${entry.id}`} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60">{busyAction === `deactivate-user-${entry.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}Deactivate</button>}
                      {!entry.isActive && (
                        <div className="mt-4 grid gap-2">
                          <input
                            type="text"
                            placeholder="Temporary password"
                            value={reactivateDrafts[entry.id] || ''}
                            onChange={(event) => setReactivateDrafts((current) => ({ ...current, [entry.id]: event.target.value }))}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                          />
                          <button onClick={() => handleReactivateUser(entry.id)} disabled={busyAction === `reactivate-user-${entry.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{busyAction === `reactivate-user-${entry.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Reactivate with temp password</button>
                        </div>
                      )}
                    </div>
                  )) : <EmptyState title="No users match your search" description="Try another search term or create a new user account." />}
                </div>
              </Panel>
            </div>
          )}

          {activeTab === 'registry' && role === 'admin' && (
            <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
              <div className="grid gap-8">
                <Panel title="Add a student registry record" eyebrow="School data">
                  <form onSubmit={handleCreateRegistryRecord} className="grid gap-4 md:grid-cols-2">
                    <Input label="Matric number" value={registryForm.matricNumber} onChange={(value) => setRegistryForm((current) => ({ ...current, matricNumber: value.toUpperCase() }))} />
                    <Input label="First name" value={registryForm.firstName} onChange={(value) => setRegistryForm((current) => ({ ...current, firstName: value }))} />
                    <Input label="Last name" value={registryForm.lastName} onChange={(value) => setRegistryForm((current) => ({ ...current, lastName: value }))} />
                    <Input label="Other name" value={registryForm.otherName} onChange={(value) => setRegistryForm((current) => ({ ...current, otherName: value }))} />
                    <Input label="Faculty" value={registryForm.faculty} onChange={(value) => setRegistryForm((current) => ({ ...current, faculty: value }))} />
                    <Input label="Department" value={registryForm.department} onChange={(value) => setRegistryForm((current) => ({ ...current, department: value }))} />
                    <Input label="Program" value={registryForm.program} onChange={(value) => setRegistryForm((current) => ({ ...current, program: value }))} />
                    <Input label="Level" value={registryForm.level} onChange={(value) => setRegistryForm((current) => ({ ...current, level: value }))} />
                    <Input label="Admission year" value={registryForm.admissionYear} onChange={(value) => setRegistryForm((current) => ({ ...current, admissionYear: value }))} />
                    <div className="md:col-span-2"><button type="submit" disabled={busyAction === 'create-registry'} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{busyAction === 'create-registry' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Save registry record</button></div>
                  </form>
                </Panel>
                  <Panel title="Bulk import registry records" eyebrow="CSV or JSON import">
                    <p className="text-sm leading-7 text-slate-600">Upload a CSV file from school records, or paste JSON if you prefer technical import.</p>
                  <div className="mt-4 rounded-[1.5rem] border border-blue-100 bg-blue-50/60 p-4">
                    <label className="block text-sm font-semibold text-slate-700">Upload CSV file</label>
                    <p className="mt-1 text-xs text-slate-500">Supported headers: `matricNumber`/`matric`, `firstName`, `lastName`, or `name`.</p>
                    <input type="file" accept=".csv,text/csv" onChange={handleRegistryCsvUpload} className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" />
                    {registryFileName && <p className="mt-2 text-xs text-slate-500">Last selected file: {registryFileName}</p>}
                  </div>
                  <textarea value={bulkRegistry} onChange={(event) => setBulkRegistry(event.target.value)} rows={10} className="mt-4 w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 font-mono text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" placeholder={`[\n  {\n    "matricNumber": "CSC/24/0001",\n    "firstName": "Amina",\n    "lastName": "Yusuf",\n    "faculty": "Computing",\n    "department": "Computer Science",\n    "program": "B.Sc Computer Science"\n  }\n]`} />
                    <button onClick={handleBulkRegistryImport} disabled={busyAction === 'bulk-registry' || busyAction === 'bulk-registry-csv'} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60">{busyAction === 'bulk-registry' || busyAction === 'bulk-registry-csv' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Import records</button>
                  </Panel>

                  <Panel title="Link registry record to user" eyebrow="Admin mapping">
                    <div className="grid gap-4">
                      <Select label="Registry record" value={linkForm.registryId} onChange={(value) => setLinkForm((current) => ({ ...current, registryId: value }))} options={[{ value: '', label: 'Choose registry record' }, ...registry.map((record) => ({ value: record.id, label: `${record.matricNumber} - ${[record.firstName, record.lastName].filter(Boolean).join(' ')}` }))]} />
                      <Select label="User account" value={linkForm.userId} onChange={(value) => setLinkForm((current) => ({ ...current, userId: value }))} options={[{ value: '', label: 'Choose user' }, ...users.map((entry) => ({ value: entry.id, label: `${fullName(entry)} (${entry.email})` }))]} />
                      <button onClick={handleLinkRegistry} disabled={busyAction === 'link-registry'} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">{busyAction === 'link-registry' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Link record</button>
                    </div>
                  </Panel>
                </div>
                <Panel title="Registry inventory" eyebrow="Student source data">
                  <div className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <Select label="Faculty" value={registryFilters.faculty} onChange={(value) => setRegistryFilters((current) => ({ ...current, faculty: value }))} options={[{ value: '', label: 'All faculties' }, ...registryFilterOptions.faculty.map((value) => ({ value, label: value }))]} />
                      <Select label="Department" value={registryFilters.department} onChange={(value) => setRegistryFilters((current) => ({ ...current, department: value }))} options={[{ value: '', label: 'All departments' }, ...registryFilterOptions.department.map((value) => ({ value, label: value }))]} />
                      <Select label="Program" value={registryFilters.program} onChange={(value) => setRegistryFilters((current) => ({ ...current, program: value }))} options={[{ value: '', label: 'All programs' }, ...registryFilterOptions.program.map((value) => ({ value, label: value }))]} />
                      <Select label="Level" value={registryFilters.level} onChange={(value) => setRegistryFilters((current) => ({ ...current, level: value }))} options={[{ value: '', label: 'All levels' }, ...registryFilterOptions.level.map((value) => ({ value, label: value }))]} />
                      <Select label="Claimed" value={registryFilters.claimed} onChange={(value) => setRegistryFilters((current) => ({ ...current, claimed: value }))} options={[{ value: '', label: 'All records' }, { value: 'true', label: 'Claimed' }, { value: 'false', label: 'Available' }]} />
                    </div>
                    {filteredRegistry.length > 0 ? filteredRegistry.map((record) => (
                      <div key={record.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg font-bold text-slate-950">{record.matricNumber}</p>
                            <p className="mt-1 text-sm text-slate-500">{[record.firstName, record.otherName, record.lastName].filter(Boolean).join(' ')}</p>
                            <p className="mt-2 text-sm text-slate-500">{record.program} | {record.department}</p>
                            <p className="mt-1 text-sm text-slate-500">Level: {record.level || 'Not set'} | Faculty: {record.faculty}</p>
                          </div>
                          <div className="flex flex-wrap gap-2"><Badge tone={record.claimedByUserId ? 'emerald' : 'amber'}>{record.claimedByUserId ? 'claimed' : 'available'}</Badge><Badge tone={record.isActive ? 'blue' : 'rose'}>{record.isActive ? 'active' : 'inactive'}</Badge></div>
                        </div>
                      </div>
                  )) : <EmptyState title="No registry records match your search" description="Add a single record or import many records in JSON format." />}
                </div>
              </Panel>
            </div>
          )}

          {activeTab === 'courses' && (
            <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
              {(role === 'admin' || role === 'lecturer') && (
                <div className="grid gap-8">
                  {role === 'admin' && (
                      <Panel title="Create a course" eyebrow="Academic setup">
                        <form onSubmit={handleCreateCourse} className="grid gap-4 md:grid-cols-2">
                          <Input label="Course code" value={courseForm.courseCode} onChange={(value) => setCourseForm((current) => ({ ...current, courseCode: value.toUpperCase() }))} />
                          <Input label="Course name" value={courseForm.courseName} onChange={(value) => setCourseForm((current) => ({ ...current, courseName: value }))} />
                          <Select label="Semester" value={courseForm.semester} onChange={(value) => setCourseForm((current) => ({ ...current, semester: value }))} options={[{ value: 'rain', label: 'Rain' }, { value: 'harmattan', label: 'Harmattan' }]} />
                          <Input label="Academic year" value={courseForm.academicYear} onChange={(value) => setCourseForm((current) => ({ ...current, academicYear: value }))} />
                          <Input label="Faculty" value={courseForm.faculty} onChange={(value) => setCourseForm((current) => ({ ...current, faculty: value }))} />
                          <Input label="Department" value={courseForm.department} onChange={(value) => setCourseForm((current) => ({ ...current, department: value }))} />
                          <Input label="Program" value={courseForm.program} onChange={(value) => setCourseForm((current) => ({ ...current, program: value }))} />
                          <Input label="Level" value={courseForm.level} onChange={(value) => setCourseForm((current) => ({ ...current, level: value }))} />
                          <Select label="Assign lecturer" value={courseForm.lecturerId} onChange={(value) => setCourseForm((current) => ({ ...current, lecturerId: value }))} options={[{ value: '', label: 'Choose lecturer' }, ...lecturers.map((lecturer) => ({ value: lecturer.id, label: `${fullName(lecturer)} (${lecturer.department || 'No dept'})` }))]} />
                        <div className="md:col-span-2"><label className="mb-2 block text-sm font-semibold text-slate-700">Description</label><textarea value={courseForm.description} onChange={(event) => setCourseForm((current) => ({ ...current, description: event.target.value }))} rows={4} className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></div>
                        <div className="md:col-span-2"><button type="submit" disabled={busyAction === 'create-course'} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{busyAction === 'create-course' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}Create course</button></div>
                      </form>
                    </Panel>
                  )}
                  {role === 'admin' && (
                    <Panel title="Import course catalog" eyebrow="Faculty course list">
                      <div className="space-y-4">
                        <p className="text-sm leading-7 text-slate-600">Upload a CSV with headers like <span className="font-mono">courseCode, courseName, semester, academicYear, lecturerEmail, faculty, department, program, level</span>.</p>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700">Upload course CSV</label>
                          <input type="file" accept=".csv,text/csv" onChange={handleCourseCatalogCsvUpload} className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" />
                          {courseCatalogFileName && <p className="mt-2 text-xs text-slate-500">Last selected file: {courseCatalogFileName}</p>}
                        </div>
                      </div>
                    </Panel>
                  )}
                  {role === 'admin' && (
                    <Panel title="Import timetable" eyebrow="Schedule upload">
                      <div className="space-y-4">
                        <p className="text-sm leading-7 text-slate-600">Upload your school timetable <span className="font-mono">PDF</span> to map offered courses by department and level automatically, or upload a <span className="font-mono">CSV</span> with headers like <span className="font-mono">courseCode, dayOfWeek, startTime, endTime, venue, notifyMinutesBefore</span> for detailed class-time notifications.</p>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700">Upload timetable file</label>
                          <input type="file" accept=".pdf,.csv,text/csv,application/pdf" onChange={handleTimetableCsvUpload} className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" />
                          {timetableFileName && <p className="mt-2 text-xs text-slate-500">Last selected file: {timetableFileName}</p>}
                        </div>
                      </div>
                    </Panel>
                  )}
                  {role === 'admin' && (
                    <Panel title="Building geofences" eyebrow="Location setup">
                      <form onSubmit={handleCreateBuilding} className="grid gap-4 md:grid-cols-2">
                        <Input label="Building name" value={buildingForm.name} onChange={(value) => setBuildingForm((current) => ({ ...current, name: value }))} />
                        <Input label="Tag (optional)" value={buildingForm.tag} onChange={(value) => setBuildingForm((current) => ({ ...current, tag: value }))} />
                        <Input label="Latitude" value={buildingForm.latitude} onChange={(value) => setBuildingForm((current) => ({ ...current, latitude: value }))} />
                        <Input label="Longitude" value={buildingForm.longitude} onChange={(value) => setBuildingForm((current) => ({ ...current, longitude: value }))} />
                        <Input label="Radius (meters)" type="number" value={buildingForm.radiusMeters} onChange={(value) => setBuildingForm((current) => ({ ...current, radiusMeters: value }))} />
                        <div className="md:col-span-2">
                          <button type="submit" disabled={busyAction === 'create-building'} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">
                            {busyAction === 'create-building' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                            Save building geofence
                          </button>
                        </div>
                      </form>

                      <div className="mt-6 space-y-3">
                        {filteredBuildings.length > 0 ? filteredBuildings.map((building) => (
                          <div key={building.id} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{building.name} {building.tag ? `(${building.tag})` : ''}</p>
                                <p className="mt-1 text-sm text-slate-500">Center: {building.latitude}, {building.longitude}</p>
                                <p className="mt-1 text-sm text-slate-500">Radius: {building.radiusMeters}m</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge tone={building.isActive ? 'emerald' : 'rose'}>{building.isActive ? 'active' : 'inactive'}</Badge>
                                {building.isActive && (
                                  <button onClick={() => handleDeactivateBuilding(building.id)} disabled={busyAction === `deactivate-building-${building.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60">
                                    {busyAction === `deactivate-building-${building.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                    Deactivate
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )) : (
                          <EmptyState title="No building geofences yet" description="Add lecture halls/buildings so lecturers can select them when creating sessions." />
                        )}
                      </div>
                    </Panel>
                  )}
                  {role === 'lecturer' && (
                    <Panel title="Import course roster" eyebrow="Lecturer student list">
                      <div className="space-y-4">
                        <Select label="Assigned course" value={lecturerRosterCourseId} onChange={(value) => setLecturerRosterCourseId(value)} options={[{ value: '', label: 'Choose course' }, ...courses.map((course) => ({ value: course.id, label: `${course.courseCode} - ${course.courseName}` }))]} />
                        <p className="text-sm leading-7 text-slate-600">Upload a CSV with headers like <span className="font-mono">matricNumber</span> or <span className="font-mono">email</span>. Matched students will be enrolled into the selected course automatically.</p>
                        <div>
                          <label className="block text-sm font-semibold text-slate-700">Upload roster CSV</label>
                          <input type="file" accept=".csv,text/csv" onChange={handleLecturerRosterCsvUpload} className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700" />
                          {lecturerRosterFileName && <p className="mt-2 text-xs text-slate-500">Last selected file: {lecturerRosterFileName}</p>}
                        </div>
                      </div>
                    </Panel>
                  )}
                  {role === 'lecturer' && (
                    <Panel title="Create an attendance session" eyebrow="Class operations">
                      <form onSubmit={handleCreateSession} className="grid gap-4 md:grid-cols-2">
                        <Select label="Course" value={sessionForm.courseId} onChange={(value) => setSessionForm((current) => ({ ...current, courseId: value }))} options={[{ value: '', label: 'Choose course' }, ...courses.map((course) => ({ value: course.id, label: `${course.courseCode} - ${course.courseName}` }))]} />
                        <Input label="Date" type="date" value={sessionForm.date} onChange={(value) => setSessionForm((current) => ({ ...current, date: value }))} />
                        <Input label="Start time" type="time" value={sessionForm.startTime} onChange={(value) => setSessionForm((current) => ({ ...current, startTime: value }))} />
                        <Input label="Duration (minutes)" type="number" value={sessionForm.durationMinutes} onChange={(value) => setSessionForm((current) => ({ ...current, durationMinutes: value }))} />
                        <Select
                          label="Lecture building geofence"
                          value={sessionForm.buildingId}
                          onChange={(value) => setSessionForm((current) => ({ ...current, buildingId: value }))}
                          options={[
                            { value: '', label: 'Choose building' },
                            ...buildings
                              .filter((building) => building.isActive !== false)
                              .map((building) => ({
                                value: building.id,
                                label: `${building.name}${building.tag ? ` (${building.tag})` : ''} - ${building.radiusMeters}m`,
                              })),
                          ]}
                        />
                        <Input label="Venue" value={sessionForm.venue} onChange={(value) => setSessionForm((current) => ({ ...current, venue: value }))} />
                        <Input label="Grace period (minutes)" type="number" value={sessionForm.maxAttendanceTime} onChange={(value) => setSessionForm((current) => ({ ...current, maxAttendanceTime: value }))} />
                        <div className="md:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
                          Geofence is auto-applied from the selected building. Students outside that building radius cannot mark attendance.
                        </div>
                        <div className="md:col-span-2"><button type="submit" disabled={busyAction === 'create-session'} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{busyAction === 'create-session' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}Create session</button></div>
                      </form>
                    </Panel>
                  )}
                </div>
              )}
              <Panel title={role === 'student' ? 'My semester courses' : 'Course directory'} eyebrow="Course list">
                <div className="space-y-4">
                  {groupedCourses.length > 0 ? groupedCourses.map((departmentGroup) => (
                    <div key={`course-group-${departmentGroup.department}`} className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{departmentGroup.department}</p>
                          <p className="mt-1 text-sm text-slate-500">Grouped by department and level for cleaner academic administration.</p>
                        </div>
                        <Badge tone="slate">{departmentGroup.levels.reduce((sum, levelGroup) => sum + levelGroup.items.length, 0)} courses</Badge>
                      </div>
                      {departmentGroup.levels.map((levelGroup) => (
                        <div key={`course-level-${departmentGroup.department}-${levelGroup.level}`} className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{levelGroup.level}</p>
                          <div className="space-y-4">
                            {levelGroup.items.map((course) => (
                              <div key={course.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{course.courseCode}</p>
                                    <p className="mt-2 text-lg font-bold text-slate-950">{course.courseName}</p>
                                    <p className="mt-2 text-sm text-slate-500">{course.semester} semester | {course.academicYear}</p>
                                    <p className="mt-1 text-sm text-slate-500">Lecturer: {fullName(course.lecturer)}</p>
                                    {course.enrollment && <p className="mt-1 text-sm text-slate-500">Enrollment status: {course.enrollment.status}</p>}
                                    {course.schedules?.length > 0 && (
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {course.schedules.map((schedule) => (
                                          <Badge key={`${course.id}-${schedule.id}`} tone="slate">
                                            {schedule.dayOfWeek} {formatTime(schedule.startTime)}-{formatTime(schedule.endTime)}{schedule.venue ? ` | ${schedule.venue}` : ''}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    <Badge tone={course.isActive === false ? 'rose' : 'emerald'}>{course.isActive === false ? 'archived' : 'active'}</Badge>
                                    <Badge tone="slate">{getCourseDepartmentLabel(course)}</Badge>
                                    <Badge tone="blue">{getCourseLevelLabel(course)}</Badge>
                                    {course.enrollment && <Badge tone="blue">enrolled</Badge>}
                                  </div>
                                </div>
                                {role === 'admin' && (
                                  <div className="mt-4 space-y-4">
                                    <div className="flex flex-wrap gap-2">
                                      {editingCourseId === String(course.id) ? (
                                        <button onClick={handleCancelCourseEdit} type="button" className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                                          Cancel edit
                                        </button>
                                      ) : (
                                        <button onClick={() => handleStartCourseEdit(course)} type="button" className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50">
                                          Edit course
                                        </button>
                                      )}
                                      {course.isActive !== false && (
                                        <button onClick={() => handleArchiveCourse(course.id)} disabled={busyAction === `archive-course-${course.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50 disabled:opacity-60">
                                          {busyAction === `archive-course-${course.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                          Archive course
                                        </button>
                                      )}
                                    </div>
                                    {editingCourseId === String(course.id) && (
                                      <form onSubmit={(event) => handleUpdateCourse(event, course.id)} className="grid gap-4 rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-4 md:grid-cols-2">
                                        <Input label="Course code" value={courseEditForm.courseCode} onChange={(value) => setCourseEditForm((current) => ({ ...current, courseCode: value.toUpperCase() }))} />
                                        <Input label="Course name" value={courseEditForm.courseName} onChange={(value) => setCourseEditForm((current) => ({ ...current, courseName: value }))} />
                                        <Select label="Semester" value={courseEditForm.semester} onChange={(value) => setCourseEditForm((current) => ({ ...current, semester: value }))} options={[{ value: 'rain', label: 'Rain' }, { value: 'harmattan', label: 'Harmattan' }]} />
                                        <Input label="Academic year" value={courseEditForm.academicYear} onChange={(value) => setCourseEditForm((current) => ({ ...current, academicYear: value }))} />
                                        <Input label="Faculty" value={courseEditForm.faculty} onChange={(value) => setCourseEditForm((current) => ({ ...current, faculty: value }))} />
                                        <Input label="Department" value={courseEditForm.department} onChange={(value) => setCourseEditForm((current) => ({ ...current, department: value }))} />
                                        <Input label="Program" value={courseEditForm.program} onChange={(value) => setCourseEditForm((current) => ({ ...current, program: value }))} />
                                        <Input label="Level" value={courseEditForm.level} onChange={(value) => setCourseEditForm((current) => ({ ...current, level: value }))} />
                                        <Select label="Assign lecturer" value={courseEditForm.lecturerId} onChange={(value) => setCourseEditForm((current) => ({ ...current, lecturerId: value }))} options={[{ value: '', label: 'Choose lecturer' }, ...lecturers.map((lecturer) => ({ value: lecturer.id, label: `${fullName(lecturer)} (${lecturer.department || 'No dept'})` }))]} />
                                        <div className="md:col-span-2">
                                          <label className="mb-2 block text-sm font-semibold text-slate-700">Description</label>
                                          <textarea value={courseEditForm.description} onChange={(event) => setCourseEditForm((current) => ({ ...current, description: event.target.value }))} rows={4} className="w-full rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
                                        </div>
                                        <div className="md:col-span-2">
                                          <button type="submit" disabled={busyAction === `update-course-${course.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">
                                            {busyAction === `update-course-${course.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                                            Save course changes
                                          </button>
                                        </div>
                                      </form>
                                    )}
                                  </div>
                                )}
                                {role === 'lecturer' && (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <button onClick={() => handleDownloadReport(course.id, 'csv')} disabled={busyAction === `download-csv-${course.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-60">{busyAction === `download-csv-${course.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download CSV</button>
                                    <button onClick={() => handleDownloadReport(course.id, 'pdf')} disabled={busyAction === `download-pdf-${course.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60">{busyAction === `download-pdf-${course.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download PDF</button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )) : <EmptyState title="No courses available" description={role === 'student' ? 'No active enrollments were found for your account yet.' : 'Create a course or update your search.'} />}
                </div>
              </Panel>
            </div>
          )}

          {activeTab === 'sessions' && role === 'lecturer' && (
            <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
              <Panel title="Attendance sessions" eyebrow="Lecturer control">
                <div className="space-y-4">
                  {filteredSessions.length > 0 ? filteredSessions.map((session) => (
                    <button key={session.id} onClick={() => loadSessionDetail(session.id)} className={`w-full rounded-[1.5rem] border p-5 text-left transition ${sessionDetail?.id === session.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50/80 hover:border-blue-300'}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{session.course?.courseCode || 'Course'}</p><p className="mt-2 text-lg font-bold text-slate-950">{session.course?.courseName || 'Attendance session'}</p><p className="mt-2 text-sm text-slate-500">{formatDate(session.date)} at {formatTime(session.startTime)}</p><p className="mt-1 text-sm text-slate-500">Venue: {session.venue || 'Not set'}</p></div>
                        <div className="flex flex-wrap gap-2"><Badge tone={session.status === 'active' ? 'emerald' : 'slate'}>{session.status}</Badge><Badge tone="blue">{session.sessionCode}</Badge></div>
                      </div>
                    </button>
                  )) : <EmptyState title="No sessions found" description="Create a class session to generate a QR attendance code." />}
                </div>
              </Panel>
              <div className="grid gap-8">
                <Panel title="Selected session detail" eyebrow="Live attendance">
                  {sessionDetail ? (
                    <div className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-2">
                        <SummaryTile label="Course" value={sessionDetail.course?.courseCode || 'Not set'} helper={sessionDetail.course?.courseName || 'No course linked'} />
                        <SummaryTile label="Session code" value={sessionDetail.sessionCode} helper={`${formatDate(sessionDetail.date)} at ${formatTime(sessionDetail.startTime)}`} />
                        <SummaryTile label="Expected students" value={sessionDetail.attendanceStats?.expectedCount || 0} helper="Active enrolled students for this course" />
                        <SummaryTile label="Marked attendance" value={sessionDetail.attendanceStats?.markedCount || 0} helper="Students already present or late" />
                        <SummaryTile label="Present on time" value={sessionDetail.attendanceStats?.presentCount || 0} helper="Students marked within the attendance window" />
                        <SummaryTile label="Absent students" value={sessionDetail.attendanceStats?.absentCount || 0} helper="Students who will receive automatic absence follow-up" />
                      </div>
                      {(sessionDetail.geofenceLatitude && sessionDetail.geofenceLongitude && sessionDetail.geofenceRadiusMeters) && (
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-900">
                          Geofence active: center {sessionDetail.geofenceLatitude}, {sessionDetail.geofenceLongitude} with {sessionDetail.geofenceRadiusMeters}m radius.
                        </div>
                      )}
                      {qrDataUrl && <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50/70 p-5"><div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">Scannable QR</p><p className="mt-2 text-sm leading-7 text-slate-600">Students must sign in to the app and use the in-app QR scanner. Outside-app scanning no longer auto-marks attendance.</p><p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fallback code: {sessionDetail.sessionCode}</p></div><div className="rounded-[1.5rem] border border-white bg-white p-4 shadow-sm"><img src={qrDataUrl} alt="Session QR code" className="h-44 w-44" /></div></div></div>}
                      <div className="flex flex-wrap gap-3">
                        {sessionDetail.status === 'active' && <button onClick={() => handleCloseSession(sessionDetail.id)} disabled={busyAction === `close-session-${sessionDetail.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60">{busyAction === `close-session-${sessionDetail.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Close session and auto-send queries</button>}
                        <button onClick={() => { setQueryForm((current) => ({ ...current, sessionId: String(sessionDetail.id) })); setActiveTab('queries'); }} className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 font-semibold text-blue-700 transition hover:bg-blue-100"><Bell className="h-4 w-4" />Open query composer</button>
                      </div>
                    </div>
                  ) : <EmptyState title="No session selected" description="Choose a session from the left to view present and absent students, QR code, and attendance stats." />}
                </Panel>
                <Panel title="Attendance register" eyebrow="Present and absent lists">
                  {sessionDetail ? (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <div>
                        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Present or late</h3><Badge tone="emerald">{sessionDetail.attendances?.length || 0}</Badge></div>
                        <div className="space-y-3">
                          {sessionDetail.attendances?.length > 0 ? sessionDetail.attendances.map((entry) => (
                            <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="font-semibold text-slate-900">{fullName(entry.student)}</p><p className="mt-1 text-sm text-slate-500">{entry.student?.matricNumber || entry.student?.email}</p><div className="mt-3 flex flex-wrap gap-2"><Badge tone={entry.status === 'late' ? 'amber' : 'emerald'}>{entry.status}</Badge><Badge tone="slate">{formatDateTime(entry.markedAt)}</Badge></div></div>
                          )) : <EmptyState title="No attendance marks yet" description="Students who scan the QR or enter the code will appear here." />}
                        </div>
                      </div>
                      <div>
                        <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Absent students</h3><Badge tone="rose">{sessionDetail.absentStudents?.length || 0}</Badge></div>
                        <div className="space-y-3">
                          {sessionDetail.absentStudents?.length > 0 ? sessionDetail.absentStudents.map((student) => (
                            <div key={student.id} className="rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-4"><p className="font-semibold text-slate-900">{fullName(student)}</p><p className="mt-1 text-sm text-slate-500">{student.matricNumber || student.email}</p><p className="mt-1 text-sm text-slate-500">{student.department || 'No department'}</p></div>
                          )) : <EmptyState title="No absent students" description="Once this session closes, the system will show any missing students here and auto-send queries." />}
                        </div>
                      </div>
                    </div>
                  ) : <EmptyState title="No register loaded" description="Choose a session to see attendance and absent-student detail." />}
                </Panel>
              </div>
            </div>
          )}

          {activeTab === 'attendance' && role === 'student' && (
            <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
              <div className="grid gap-8">
                <Panel title="Mark attendance" eyebrow="Student check-in">
                  <div className="space-y-5">
                    <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-5"><p className="text-sm leading-7 text-slate-600">Use the QR scanner for the smoothest flow, or enter the session code manually if your camera is unavailable.</p></div>
                    <div className="grid gap-4">
                      <Input label="Session code" value={attendanceForm.sessionCode} onChange={(value) => setAttendanceForm((current) => ({ ...current, sessionCode: value.toUpperCase() }))} />
                      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700"><input type="checkbox" checked={attendanceForm.useLocation} onChange={(event) => setAttendanceForm((current) => ({ ...current, useLocation: event.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />Include device location when available for stronger attendance verification.</label>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button onClick={() => handleMarkAttendance()} disabled={busyAction === 'mark-attendance'} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{busyAction === 'mark-attendance' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Mark with code</button>
                      <button onClick={() => setScannerOpen(true)} disabled={busyAction === 'mark-attendance' || scannerOpen} className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-3 font-semibold text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"><Camera className="h-4 w-4" />Scan QR code</button>
                    </div>
                  </div>
                </Panel>
                <Panel title="Attendance tips" eyebrow="Verification">
                  <div className="space-y-4"><ActionTile title="Arrive early" description="Marks made after the session grace period are recorded as late." /><ActionTile title="Keep your course list current" description="Absent-student checks rely on your registered semester courses." /><ActionTile title="Reply to absence queries" description="If you miss class, a lecturer can review your reason directly in the system." /></div>
                </Panel>
              </div>
              <Panel title="Attendance history" eyebrow="Your records">
                <div className="space-y-4">
                  {history.length > 0 ? history.map((entry) => (
                    <div key={entry.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{entry.session?.course?.courseCode || 'Course'}</p><p className="mt-2 text-lg font-bold text-slate-950">{entry.session?.course?.courseName || 'Attendance record'}</p><p className="mt-2 text-sm text-slate-500">{formatDate(entry.session?.date)} at {formatTime(entry.session?.startTime)}</p><p className="mt-1 text-sm text-slate-500">Marked: {formatDateTime(entry.markedAt)}</p></div>
                        <div className="flex flex-wrap gap-2"><Badge tone={entry.status === 'present' ? 'emerald' : entry.status === 'late' ? 'amber' : 'slate'}>{entry.status}</Badge><Badge tone="slate">{entry.verificationMethod}</Badge></div>
                      </div>
                    </div>
                  )) : <EmptyState title="No attendance history yet" description="Mark your first session and your record will appear here." />}
                </div>
              </Panel>
            </div>
          )}

          {activeTab === 'queries' && (
            <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
              {role === 'lecturer' && (
                <Panel title="Send a manual absence query" eyebrow="Lecturer follow-up">
                  <form onSubmit={handleCreateQuery} className="grid gap-4">
                    <Select label="Session (optional)" value={queryForm.sessionId} onChange={(value) => setQueryForm((current) => ({ ...current, sessionId: value, studentId: '' }))} options={[{ value: '', label: 'No linked session' }, ...sessions.map((session) => ({ value: session.id, label: `${session.course?.courseCode || 'Course'} - ${formatDate(session.date)} (${session.sessionCode})` }))]} />
                    {queryForm.sessionId && (
                      <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50/70 px-4 py-4 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">{selectedQuerySession?.course?.courseCode || 'Selected session'}</p>
                        <p className="mt-1">Eligible students for this query: {queryEligibleStudents.length}</p>
                        <p className="mt-1 text-slate-500">When a session is selected, the list below prefers absent students first, then enrolled students for that class.</p>
                      </div>
                    )}
                    <Select label="Student" value={queryForm.studentId} onChange={(value) => setQueryForm((current) => ({ ...current, studentId: value }))} options={[{ value: '', label: queryEligibleStudents.length > 0 ? 'Choose eligible student' : 'No eligible students found' }, ...queryEligibleStudents.map((student) => ({ value: student.id, label: `${fullName(student)}${student.matricNumber ? ` (${student.matricNumber})` : ''}` }))]} />
                    <Input label="Title" value={queryForm.title} onChange={(value) => setQueryForm((current) => ({ ...current, title: value }))} />
                    <div><label className="mb-2 block text-sm font-semibold text-slate-700">Message</label><textarea value={queryForm.message} onChange={(event) => setQueryForm((current) => ({ ...current, message: event.target.value }))} rows={6} className="w-full rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" /></div>
                    <button type="submit" disabled={busyAction === 'create-query'} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{busyAction === 'create-query' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send query</button>
                  </form>
                </Panel>
              )}
              <Panel title={role === 'student' ? 'Queries from lecturers' : 'Absence query inbox'} eyebrow="Follow-up workflow">
                <div className="space-y-4">
                  {filteredQueries.length > 0 ? filteredQueries.map((query) => (
                    <div key={query.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-lg font-bold text-slate-950">{query.title}</p>
                          <p className="mt-2 text-sm leading-7 text-slate-600">{query.message}</p>
                          <p className="mt-3 text-sm text-slate-500">{role === 'student' ? `From ${fullName(query.lecturer)}` : `To ${fullName(query.student)}${query.student?.matricNumber ? ` (${query.student.matricNumber})` : ''}`}</p>
                          {query.session && <p className="mt-1 text-sm text-slate-500">Linked session: {query.session.course?.courseCode} on {formatDate(query.session.date)}</p>}
                          {query.studentResponse && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800"><span className="font-semibold">Student response:</span> {query.studentResponse}</div>}
                        </div>
                        <div className="flex flex-wrap gap-2"><Badge tone={query.status === 'pending' ? 'amber' : query.status === 'responded' ? 'blue' : 'emerald'}>{query.status}</Badge></div>
                      </div>
                      {role === 'student' && query.status === 'pending' && <div className="mt-4 space-y-3"><textarea value={responseDrafts[query.id] || ''} onChange={(event) => setResponseDrafts((current) => ({ ...current, [query.id]: event.target.value }))} rows={4} className="w-full rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" placeholder="Explain why you missed class" /><button onClick={() => handleRespondToQuery(query.id)} disabled={busyAction === `respond-query-${query.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{busyAction === `respond-query-${query.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Submit response</button></div>}
                      {role === 'lecturer' && query.status === 'responded' && <button onClick={() => handleCloseQuery(query.id)} disabled={busyAction === `close-query-${query.id}`} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60">{busyAction === `close-query-${query.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Close query</button>}
                    </div>
                  )) : <EmptyState title="No queries found" description={role === 'student' ? 'You have no outstanding lecturer queries right now.' : 'Auto-generated and manual absence queries will appear here.'} />}
                </div>
              </Panel>
            </div>
          )}
        </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
