
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
  Moon,
  Search,
  Send,
  ShieldCheck,
  Settings2,
  Sun,
  Trash2,
  Upload,
  UserCog,
  UserPlus,
  Users,
  MapPin,
  XCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { useDispatch, useSelector } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import { io as createSocket } from 'socket.io-client';
import api from '../services/api';
import { logout } from '../redux/slices/authSlice';
import { useTheme } from '../theme/ThemeContext';
import './dashboard-theme.css';

const initialUserForm = { firstName: '', lastName: '', email: '', password: '', role: 'student', department: '', faculty: '', program: '', campus: '', matricNumber: '' };
const initialCourseForm = { courseCode: '', courseName: '', description: '', semester: 'rain', academicYear: '', lecturerId: '', faculty: '', department: '', program: '', campus: '', level: '' };
const initialRegistryForm = { matricNumber: '', firstName: '', lastName: '', otherName: '', faculty: '', department: '', program: '', campus: '', level: '', admissionYear: '' };
const initialSessionForm = { courseId: '', date: '', startTime: '', durationMinutes: '120', venue: '', maxAttendanceTime: '15', buildingId: '' };
const initialBuildingForm = { name: '', tag: '', campus: '', latitude: '', longitude: '', radiusMeters: '80' };
const initialQueryForm = { studentId: '', sessionId: '', title: '', message: '' };
const initialAttendanceForm = { sessionCode: '', attendancePass: '', useLocation: true };
const initialSiteMaintenanceForm = {
  isMaintenanceEnabled: false,
  badge: 'Temporary maintenance',
  title: 'Site temporarily unavailable',
  body: "We're applying a few updates right now. Please check back soon. All access is currently paused while maintenance is active.",
  footer: 'Everything is locked during maintenance',
};
const TABS_BY_ROLE = {
  admin: ['overview', 'analytics', 'users', 'registry', 'courses', 'queries', 'reports', 'notifications', 'help'],
  lecturer: ['overview', 'analytics', 'courses', 'sessions', 'queries', 'reports', 'notifications', 'help'],
  student: ['overview', 'analytics', 'courses', 'attendance', 'queries', 'reports', 'notifications', 'help'],
};

const PRIMARY_TABS_BY_ROLE = {
  admin: ['overview', 'users', 'registry', 'courses', 'queries', 'reports', 'notifications'],
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
  settings: 'Settings',
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
  settings: Settings2,
  help: CircleHelp,
};

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : 'Not set');
const formatDateTime = (value) => (value ? new Date(value).toLocaleString() : 'Not available');
const formatTime = (value) => (value ? String(value).slice(0, 5) : 'Not set');
const fullName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'No name';
const initialsFor = (person) => {
  const seed = fullName(person) === 'No name' ? String(person?.email || 'A') : fullName(person);
  return seed.trim().charAt(0).toUpperCase() || 'A';
};
const normalizeSearch = (value) => String(value || '').toLowerCase();
const includesSearch = (value, search) => normalizeSearch(value).includes(normalizeSearch(search));
const getAvatarStorageKey = (user) => `attendance-system-avatar:${user?.id || user?.email || 'guest'}`;
const getPreferenceStorageKey = (user) => `attendance-system-preferences:${user?.id || user?.email || 'guest'}`;
const MAX_PROFILE_PHOTO_BYTES = 900 * 1024;
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

const titleCaseInstitutionText = (value) => String(value || '')
  .toLowerCase()
  .split(' ')
  .filter(Boolean)
  .map((word) => {
    if (['oou', 'ui', 'futa', 'csc', 'get', 'gst', 'mth'].includes(word)) {
      return word.toUpperCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  })
  .join(' ');

const normalizeInstitutionText = (value, field = 'generic') => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const collapsed = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = collapsed.toLowerCase();
  const noisePatterns = [
    'timetable',
    'teaching',
    'rain timetable',
    'harmattan timetable',
    'imported from timetable pdf',
    '.pdf',
    'final 25',
    'final teaching',
  ];

  if (noisePatterns.some((pattern) => lower.includes(pattern))) {
    if (field === 'faculty' && lower.includes('engineering')) {
      return 'College of Engineering and Environmental Studies';
    }
    return '';
  }

  if (field === 'level') {
    const digits = lower.match(/\d+/)?.[0];
    return digits ? digits : collapsed.toUpperCase();
  }

  if (field === 'academicYear') {
    return normalizeAcademicYearValue(collapsed);
  }

  const aliasChecks = [
    {
      match: ['engineering', 'environmental'],
      value: 'College of Engineering and Environmental Studies',
    },
  ];

  const aliased = aliasChecks.find((entry) => entry.match.every((token) => lower.includes(token)))?.value;
  if (aliased) {
    return aliased;
  }

  if (field === 'campus') {
    return titleCaseInstitutionText(collapsed);
  }

  return titleCaseInstitutionText(collapsed);
};

const normalizeInstitutionPayload = (payload, fieldMap) => Object.fromEntries(
  Object.entries(payload).map(([key, value]) => {
    const field = fieldMap[key];
    if (!field) {
      return [key, value];
    }
    return [key, normalizeInstitutionText(value, field)];
  })
);

const getCourseDepartmentLabel = (course) => {
  const primaryAudience = course?.audiences?.find((entry) => entry?.isActive !== false) || null;
  const department = normalizeInstitutionText(course?.department || primaryAudience?.department || '', 'department');
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
  const rawLevel = normalizeInstitutionText(course?.level || course?.audiences?.find((entry) => entry?.isActive !== false)?.level || '', 'level');
  if (!rawLevel) {
    return 'UNSPECIFIED LEVEL';
  }

  const digits = rawLevel.match(/\d+/)?.[0];
  return digits ? `${digits} LEVEL` : rawLevel.toUpperCase();
};

const getAttendanceKeyForCourse = (course) => String(course?.courseCode || '').trim().toUpperCase();
const PENDING_ATTENDANCE_STORAGE_KEY = 'attendance-system-pending-entry';
const DEFAULT_LEVEL_OPTIONS = ['100', '200', '300', '400', '500', '600'];
const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;
const ALLOWED_EVIDENCE_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']);
const isLecturerOriginatedQuery = (query) => query?.lecturer?.role === 'lecturer';
const canEscalateQueryInDashboard = (query, role, user) => {
  if (!query || query.status === 'closed' || role === 'student') {
    return false;
  }

  if (role === 'lecturer') {
    return String(query.lecturerId) === String(user?.id);
  }

  return role === 'admin' && isLecturerOriginatedQuery(query);
};
const SOCKET_BASE_URL = (() => {
  const fallback = 'http://localhost:5000';
  const raw = String(process.env.REACT_APP_API_URL || '').trim();
  if (!raw) {
    return fallback;
  }

  try {
    const parsed = new URL(raw);
    parsed.pathname = parsed.pathname.replace(/\/api\/?$/, '').replace(/\/+$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch (error) {
    return raw.replace(/\/api\/?$/, '').replace(/\/+$/, '') || fallback;
  }
})();

const collectUniqueValues = (...collections) => {
  const values = new Set();
  collections.flat().forEach((value) => {
    const normalized = String(value || '').trim();
    if (normalized) {
      values.add(normalized);
    }
  });
  return Array.from(values).sort((left, right) => left.localeCompare(right));
};

const buildSelectOptions = (values, emptyLabel, extraValues = []) => [
  { value: '', label: emptyLabel },
  ...collectUniqueValues(values, extraValues).map((value) => ({ value, label: value })),
];

const getCurrentLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('File could not be read.'));
    reader.readAsDataURL(file);
  });

const createEvidencePayload = async (file, note = '') => {
  if (!file) {
    return null;
  }

  if (!ALLOWED_EVIDENCE_MIME_TYPES.has(file.type)) {
    throw new Error('Please choose a PDF or image file for the evidence attachment.');
  }

  if (file.size > MAX_EVIDENCE_BYTES) {
    throw new Error('Evidence should be 3MB or smaller.');
  }

  const data = await readFileAsDataUrl(file);
  return {
    fileName: file.name,
    mimeType: file.type,
    data,
    note: String(note || '').trim(),
  };
};

const extractAttendancePayload = (decodedText) => {
  const fallback = { sessionCode: '', attendancePass: '' };
  const compactText = String(decodedText || '').trim();
  const readAttendanceParams = (params) => {
    const sessionCode = (params.get('sessionCode') || params.get('s') || '').trim().toUpperCase();
    if (!sessionCode) {
      return null;
    }

    return {
      sessionCode,
      attendancePass: (params.get('attendancePass') || params.get('p') || params.get('attendanceKey') || params.get('k') || '').trim().toUpperCase(),
    };
  };

  if (compactText.toUpperCase().startsWith('ATD|')) {
    const [, sessionCode = '', attendanceKey = ''] = compactText.split('|');
    return {
      sessionCode: String(sessionCode || '').trim().toUpperCase(),
      attendancePass: String(attendanceKey || '').trim().toUpperCase(),
    };
  }

  try {
    const parsedUrl = new URL(compactText);
    const directParams = readAttendanceParams(parsedUrl.searchParams);
    if (directParams) {
      return directParams;
    }

    const hashQueryIndex = parsedUrl.hash.indexOf('?');
    if (hashQueryIndex >= 0) {
      const hashParams = new URLSearchParams(parsedUrl.hash.slice(hashQueryIndex + 1));
      const hashPayload = readAttendanceParams(hashParams);
      if (hashPayload) {
        return hashPayload;
      }
    }
  } catch (error) {
    // not a full absolute URL, keep trying other formats
  }

  if (compactText.includes('sessionCode=') || compactText.includes('s=')) {
    const queryString = compactText.includes('?') ? compactText.slice(compactText.indexOf('?') + 1) : compactText;
    const params = new URLSearchParams(queryString);
    const queryPayload = readAttendanceParams(params);
    if (queryPayload) {
      return queryPayload;
    }
  }

  try {
    const parsed = JSON.parse(compactText);
    return {
      sessionCode: String(parsed.sessionCode || '').trim().toUpperCase(),
      attendancePass: String(parsed.attendancePass || parsed.attendanceKey || '').trim().toUpperCase(),
    };
  } catch (error) {
    return { ...fallback, sessionCode: compactText.toUpperCase() };
  }
};

const Panel = ({ title, eyebrow, action, children }) => {
  const { isDark } = useTheme();

  return (
  <section className={`dashboard-panel rounded-[2rem] border p-6 backdrop-blur-xl ${isDark ? 'border-slate-700 bg-slate-900/80 shadow-[0_20px_60px_rgba(2,6,23,0.6)]' : 'border-white/70 bg-white/90 shadow-[0_20px_60px_rgba(148,163,184,0.14)]'}`}>
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

const MobileCommandCenter = ({ command, onOpenTab }) => {
  if (!command) {
    return null;
  }

  const PrimaryIcon = command.primaryIcon || LayoutDashboard;

  return (
    <section className="dashboard-mobile-command" aria-label="Mobile command center">
      <div className="dashboard-mobile-command__hero">
        <div>
          <p className="dashboard-mobile-command__eyebrow">{command.eyebrow}</p>
          <h2>{command.title}</h2>
          <p>{command.description}</p>
        </div>
        <button type="button" className="dashboard-mobile-command__cta" onClick={() => onOpenTab(command.primaryTab)}>
          <PrimaryIcon className="h-5 w-5" />
          <span>{command.primaryLabel}</span>
        </button>
      </div>

      <div className="dashboard-mobile-command__list">
        {command.items.map((item) => {
          const Icon = item.icon || LayoutDashboard;
          return (
            <button type="button" key={item.label} className="dashboard-mobile-command__item" onClick={() => onOpenTab(item.tab)}>
              <span className={`dashboard-mobile-command__item-icon tone-${item.tone || 'blue'}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.value}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

const Avatar = ({ person, photo, className = '' }) => (
  <div className={`dashboard-avatar ${className}`.trim()}>
    {photo ? <img src={photo} alt={`${fullName(person)} avatar`} className="dashboard-avatar__image" /> : <span className="dashboard-avatar__fallback">{initialsFor(person)}</span>}
  </div>
);

const PreferenceToggle = ({ label, description, checked, onChange }) => {
  const { isDark } = useTheme();

  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-4 rounded-[1.5rem] border px-5 py-4 text-left transition ${isDark ? 'border-slate-700 bg-slate-900/70 hover:border-slate-500' : 'border-slate-200 bg-slate-50/80 hover:border-blue-300'}`}
    >
      <div>
        <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{label}</p>
        <p className={`mt-1 text-sm leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{description}</p>
      </div>
      <span className={`inline-flex h-7 w-12 items-center rounded-full p-1 transition ${checked ? 'bg-blue-600' : isDark ? 'bg-slate-700' : 'bg-slate-300'}`}>
        <span className={`h-5 w-5 rounded-full bg-white transition ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </span>
    </button>
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
      {items.map((item, index) => {
        const values = Object.entries(item).filter(([key]) => !['courseId', 'courseLabel', 'label'].includes(key));
        return (
          <div key={item.courseId || `${item.label}-${index}`} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-700 dark:bg-slate-900/70">
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
    <div className="dashboard-field">
      <label className={`dashboard-field__label ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{label}</label>
      <input onChange={(event) => onChange(event.target.value)} className={`dashboard-field__control ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-900'}`} {...props} />
    </div>
  );
};

const EvidenceAttachment = ({ label, fileName, mimeType, data, note }) => {
  const { isDark } = useTheme();

  if (!data) {
    return null;
  }

  const isImage = String(mimeType || '').startsWith('image/');

  return (
    <div className={`mt-4 rounded-[1.25rem] border p-4 ${isDark ? 'border-slate-700 bg-slate-950/60' : 'border-slate-200 bg-white/80'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</p>
          <p className={`mt-1 font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fileName || 'Evidence attachment'}</p>
          <p className={`mt-1 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{mimeType || 'Unknown file type'}</p>
          {note && <p className={`mt-3 text-sm leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{note}</p>}
        </div>
        <a href={data} download={fileName || 'evidence'} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
          Open
        </a>
      </div>
      {isImage ? (
        <img src={data} alt={fileName || 'Evidence preview'} className="mt-4 max-h-72 w-full rounded-2xl object-cover" />
      ) : (
        <div className={`mt-4 rounded-2xl border px-4 py-4 text-sm ${isDark ? 'border-slate-700 bg-slate-900/70 text-slate-300' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          PDF evidence preview is available in the new tab.
        </div>
      )}
    </div>
  );
};

const LiveNotificationToast = ({ item, onOpen, onClose }) => {
  const { isDark } = useTheme();

  if (!item) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[80] w-[min(92vw,28rem)]">
      <div className={`pointer-events-auto rounded-[1.5rem] border p-4 shadow-[0_18px_50px_rgba(15,23,42,0.22)] ${isDark ? 'border-slate-700 bg-slate-950/95' : 'border-slate-200 bg-white/95'}`}>
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-2xl bg-blue-600 p-2 text-white">
            <Bell className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{item.title}</p>
            <p className={`mt-1 text-sm leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{item.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={onOpen} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-800">
                Open {item.linkTab || 'notifications'}
              </button>
              <button type="button" onClick={onClose} className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold ${isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                Dismiss
              </button>
            </div>
          </div>
          <button type="button" onClick={onClose} className={`rounded-full p-1 ${isDark ? 'text-slate-400 hover:bg-slate-900' : 'text-slate-500 hover:bg-slate-100'}`}>
            <XCircle className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const Select = ({ label, value, onChange, options }) => {
  const { isDark } = useTheme();

  return (
    <div className="dashboard-field">
      <label className={`dashboard-field__label ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{label}</label>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`dashboard-field__control ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-slate-50 text-slate-900'}`}>
        {options.map((option) => (
          <option key={`${option.value}-${option.label}`} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
};

const TextAreaField = ({ label, value, onChange, rows = 4, placeholder = '' }) => {
  const { isDark } = useTheme();

  return (
    <div className="dashboard-field md:col-span-2">
      <label className={`dashboard-field__label ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{label}</label>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`dashboard-field__control dashboard-field__control--textarea ${isDark ? 'border-slate-700 bg-slate-800 text-slate-100 placeholder:text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-900'}`}
      />
    </div>
  );
};

const FileField = ({ label, onChange, accept, helper, fileName }) => {
  const { isDark } = useTheme();

  return (
    <div className="dashboard-field">
      <label className={`dashboard-field__label ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{label}</label>
      <input
        type="file"
        accept={accept}
        onChange={onChange}
        className={`dashboard-file-input ${isDark ? 'border-slate-700 bg-slate-800/80 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'}`}
      />
      {helper && <p className={`dashboard-field__helper ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{helper}</p>}
      {fileName && <p className={`dashboard-field__helper ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Last selected file: {fileName}</p>}
    </div>
  );
};

const ActionButton = ({ children, variant = 'primary', className = '', ...props }) => {
  const styles = {
    primary: 'bg-blue-700 text-white hover:bg-blue-800',
    secondary: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800',
    contrast: 'border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800',
    soft: 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-slate-700 dark:bg-blue-950/30 dark:text-blue-200 dark:hover:bg-blue-950/50',
    danger: 'border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-900 dark:text-rose-300 dark:hover:bg-rose-950/30',
    warning: 'border border-amber-200 bg-white text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:bg-slate-900 dark:text-amber-300 dark:hover:bg-amber-950/30',
  };

  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition disabled:opacity-60 ${styles[variant]} ${className}`.trim()}
    >
      {children}
    </button>
  );
};

const QrScannerPanel = ({ isOpen, onClose, onDetected }) => {
  const { isDark } = useTheme();
  const [scannerError, setScannerError] = useState('');
  const [scannerStatus, setScannerStatus] = useState('');
  const scanHandledRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      setScannerError('');
      setScannerStatus('');
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
        const payload = extractAttendancePayload(decodedText);
        if (!payload.sessionCode) {
          scanHandledRef.current = false;
          setScannerError('The scanned QR code does not contain a valid attendance session.');
          return;
        }

        try {
          setScannerError('');
          setScannerStatus('QR captured. Verifying attendance...');
          await stopScanner();
          const result = await onDetected(payload);
          if (result?.success) {
            cancelled = true;
            await stopScanner();
            onClose();
            return;
          }
          setScannerError(result?.message || 'Attendance could not be marked after scanning. Review the message above and try again.');
        } finally {
          setScannerStatus('');
          if (!cancelled) {
            onClose();
          }
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
        {scannerStatus && <p className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${isDark ? 'border-blue-800 bg-blue-950/60 text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-700'}`}>{scannerStatus}</p>}
        {scannerError && <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">{scannerError}</p>}
      </div>
    </div>
  );
};

const Dashboard = () => {
  const { isDark, theme, toggleTheme } = useTheme();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state) => state.auth);
  const role = user?.role || 'student';
  const tabs = TABS_BY_ROLE[role] || TABS_BY_ROLE.student;
  const primaryTabs = PRIMARY_TABS_BY_ROLE[role] || PRIMARY_TABS_BY_ROLE.student;

  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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
  const [profilePhoto, setProfilePhoto] = useState('');
  const [preferences, setPreferences] = useState({ emailUpdates: true, classReminders: true, compactMode: false, browserNotifications: false });
  const [siteMaintenance, setSiteMaintenance] = useState(initialSiteMaintenanceForm);
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
  const [lecturerCourseRoster, setLecturerCourseRoster] = useState({ course: null, count: 0, enrollments: [] });
  const [lecturerRosterStudentIdentifier, setLecturerRosterStudentIdentifier] = useState('');
  const [rosterLoading, setRosterLoading] = useState(false);
  const [responseDrafts, setResponseDrafts] = useState({});
  const [responseEvidenceDrafts, setResponseEvidenceDrafts] = useState({});
  const [escalationDrafts, setEscalationDrafts] = useState({});
  const [attendanceEntrySource, setAttendanceEntrySource] = useState('');
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
  const [queryEvidence, setQueryEvidence] = useState({ fileName: '', mimeType: '', data: '', note: '' });
  const [attendanceForm, setAttendanceForm] = useState(initialAttendanceForm);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [liveNotification, setLiveNotification] = useState(null);
  const attendanceRequestRef = useRef(false);
  const photoInputRef = useRef(null);
  const legacyPhotoSyncRef = useRef(false);
  const socketRef = useRef(null);
  const loadDataRef = useRef(null);
  const refreshTimerRef = useRef(null);

  const activeSession = useMemo(() => sessions.find((session) => session.status === 'active') || null, [sessions]);

  const queueDashboardRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }

    refreshTimerRef.current = window.setTimeout(() => {
      loadDataRef.current?.(false).catch(() => null);
    }, 250);
  }, []);

  const deliverLiveNotification = useCallback((notification) => {
    if (notification?.type === 'class.reminder' && !preferences.classReminders) {
      return;
    }

    setLiveNotification(notification);

    if (!preferences.browserNotifications) {
      return;
    }

    if (!window.Notification || window.Notification.permission !== 'granted') {
      return;
    }

    if (!document.hidden && document.hasFocus()) {
      return;
    }

    try {
      new window.Notification(notification.title, {
        body: notification.description,
        icon: '/favicon.ico',
      });
    } catch (error) {
      // Browser notifications are best-effort only.
    }
  }, [preferences.browserNotifications, preferences.classReminders]);

  useEffect(() => {
    if (!user) {
      setProfilePhoto('');
      setPreferences({ emailUpdates: true, classReminders: true, compactMode: false, browserNotifications: false });
      legacyPhotoSyncRef.current = false;
      return;
    }

    const storedPhoto = window.localStorage.getItem(getAvatarStorageKey(user)) || '';
    setProfilePhoto(user?.profilePhoto || storedPhoto);

    try {
      const storedPreferences = JSON.parse(window.localStorage.getItem(getPreferenceStorageKey(user)) || '{}');
      setPreferences({
        emailUpdates: storedPreferences.emailUpdates ?? true,
        classReminders: storedPreferences.classReminders ?? true,
        compactMode: storedPreferences.compactMode ?? false,
        browserNotifications: storedPreferences.browserNotifications ?? false,
      });
    } catch (storageError) {
      setPreferences({ emailUpdates: true, classReminders: true, compactMode: false, browserNotifications: false });
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    window.localStorage.setItem(getPreferenceStorageKey(user), JSON.stringify(preferences));
  }, [preferences, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const serverPhoto = profile?.profilePhoto || user?.profilePhoto || '';
    if (serverPhoto) {
      setProfilePhoto(serverPhoto);
      window.localStorage.setItem(getAvatarStorageKey(user), serverPhoto);
      return;
    }

    const storedPhoto = window.localStorage.getItem(getAvatarStorageKey(user)) || '';
    if (storedPhoto) {
      setProfilePhoto(storedPhoto);
    }
  }, [profile, user]);

  useEffect(() => {
    if (!user || !profile || profile?.profilePhoto || legacyPhotoSyncRef.current) {
      return;
    }

    const storedPhoto = window.localStorage.getItem(getAvatarStorageKey(user)) || '';
    if (!storedPhoto) {
      return;
    }

    legacyPhotoSyncRef.current = true;
    api.put('/users/me/profile', { profilePhoto: storedPhoto })
      .then((response) => {
        const nextProfile = response.data.data || {};
        setProfile((current) => ({ ...(current || {}), ...nextProfile }));
        setProfilePhoto(nextProfile.profilePhoto || storedPhoto);
        window.localStorage.setItem(getAvatarStorageKey(user), nextProfile.profilePhoto || storedPhoto);
      })
      .catch(() => {
        legacyPhotoSyncRef.current = false;
      });
  }, [profile, user]);

  useEffect(() => {
    setActiveTab(tabs[0]);
  }, [tabs]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get('tab');
    if (requestedTab && tabs.includes(requestedTab) && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    }
  }, [activeTab, location.search, tabs]);

  useEffect(() => {
    if (role !== 'student') {
      return;
    }

    const rawPendingEntry = window.localStorage.getItem(PENDING_ATTENDANCE_STORAGE_KEY);
    if (!rawPendingEntry) {
      return;
    }

    try {
      const pendingEntry = JSON.parse(rawPendingEntry);
      const sessionCode = String(pendingEntry?.sessionCode || '').trim().toUpperCase();
      const attendancePass = String(pendingEntry?.attendancePass || '').trim().toUpperCase();
      if (!sessionCode) {
        window.localStorage.removeItem(PENDING_ATTENDANCE_STORAGE_KEY);
        return;
      }

      setAttendanceForm((current) => ({
        ...current,
        sessionCode,
        attendancePass,
      }));
      setAttendanceEntrySource(String(pendingEntry?.sourcePath || 'QR link'));
      setActiveTab('attendance');
      window.localStorage.removeItem(PENDING_ATTENDANCE_STORAGE_KEY);
      setMessage('Attendance link loaded. Review the details below and tap "Mark with code" to complete attendance.');
    } catch (error) {
      window.localStorage.removeItem(PENDING_ATTENDANCE_STORAGE_KEY);
    }
  }, [role]);

  useEffect(() => {
    if (!user?.id) {
      return undefined;
    }

    const token = window.localStorage.getItem('token');
    if (!token) {
      return undefined;
    }

    const socket = createSocket(SOCKET_BASE_URL, {
      auth: { token },
      transports: ['websocket'],
      withCredentials: false,
    });

    socketRef.current = socket;

    const handleNotification = (notification) => {
      if (!notification) {
        return;
      }

      setNotifications((current) => {
        const exists = current.some((item) => (
          item.type === notification.type &&
          item.entityType === notification.entityType &&
          item.entityId === notification.entityId &&
          item.title === notification.title &&
          item.createdAt === notification.createdAt
        ));

        if (exists) {
          return current;
        }

        return [notification, ...current].slice(0, 20);
      });

      deliverLiveNotification(notification);
    };

    const handleRefresh = () => {
      queueDashboardRefresh();
    };

    socket.on('notification:new', handleNotification);
    socket.on('dashboard:refresh', handleRefresh);
    socket.on('connect_error', (socketError) => {
      console.warn('Realtime notification connection failed:', socketError.message);
    });

    return () => {
      socket.off('notification:new', handleNotification);
      socket.off('dashboard:refresh', handleRefresh);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [deliverLiveNotification, queueDashboardRefresh, user?.id]);

  useEffect(() => () => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (!liveNotification) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setLiveNotification(null);
    }, 6500);

    return () => window.clearTimeout(timer);
  }, [liveNotification]);

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
    if (nextSuccess || nextError) {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  };

  const loadLecturerCourseRoster = useCallback(async (courseId) => {
    if (role !== 'lecturer' || !courseId) {
      setLecturerCourseRoster({ course: null, count: 0, enrollments: [] });
      return;
    }

    try {
      setRosterLoading(true);
      const response = await api.get(`/courses/${courseId}/enrollments`);
      setLecturerCourseRoster(response.data.data || { course: null, count: 0, enrollments: [] });
    } catch (actionError) {
      setLecturerCourseRoster({ course: null, count: 0, enrollments: [] });
      setMessage('', actionError.response?.data?.message || 'Course roster could not be loaded.');
    } finally {
      setRosterLoading(false);
    }
  }, [role]);

  useEffect(() => {
    if (role !== 'lecturer' || !lecturerRosterCourseId) {
      setLecturerCourseRoster({ course: null, count: 0, enrollments: [] });
      return;
    }

    loadLecturerCourseRoster(lecturerRosterCourseId);
  }, [lecturerRosterCourseId, loadLecturerCourseRoster, role]);

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
      const attendanceKey = detail.attendanceKey || getAttendanceKeyForCourse(detail.course) || '';
      const qrPayload = `${window.location.origin}${window.location.pathname}#/attendance-entry?sessionCode=${encodeURIComponent(detail.sessionCode)}&attendanceKey=${encodeURIComponent(attendanceKey)}`;
      const dataUrl = await QRCode.toDataURL(qrPayload, {
        width: 420,
        margin: 1,
        errorCorrectionLevel: 'L',
        color: { dark: '#0f172a', light: '#ffffff' },
      });
      setQrDataUrl(dataUrl);
    }
  }, []);

  useEffect(() => {
    if (role !== 'lecturer' || !sessionDetail?.id || sessionDetail?.status !== 'active') {
      return undefined;
    }

    const refreshInterval = window.setInterval(() => {
      loadSessionDetail(sessionDetail.id).catch(() => null);
    }, 45000);

    return () => window.clearInterval(refreshInterval);
  }, [loadSessionDetail, role, sessionDetail?.id, sessionDetail?.status]);

  const loadData = useCallback(async (spin = false) => {
    try {
      setError('');
      setRefreshing(true);
      setLoading(Boolean(spin));

      const [analyticsResponse, notificationsResponse, helpResponse, profileResponse, siteMaintenanceResponse] = await Promise.all([
        api.get('/dashboard/analytics'),
        api.get('/dashboard/notifications'),
        api.get('/dashboard/help'),
        api.get('/users/me/profile'),
        api.get('/site/maintenance'),
      ]);

      setAnalytics(analyticsResponse.data.data || { highlightCards: [], charts: {}, tables: {} });
      setNotifications(notificationsResponse.data.data || []);
      setHelpCenter(helpResponse.data.data || { articles: [], contact: null });
      setProfile(profileResponse.data.data || null);
      setProfilePhoto(profileResponse.data.data?.profilePhoto || '');
      setSiteMaintenance({
        ...initialSiteMaintenanceForm,
        ...(siteMaintenanceResponse.data.data || {}),
      });
      setProfileForm({
        firstName: profileResponse.data.data?.firstName || '',
        lastName: profileResponse.data.data?.lastName || '',
        department: profileResponse.data.data?.department || '',
        faculty: profileResponse.data.data?.faculty || '',
        program: profileResponse.data.data?.program || '',
      });

      if (role === 'admin') {
        const [summaryResponse, usersResponse, lecturersResponse, studentsResponse, coursesResponse, registryResponse, buildingsResponse, queriesResponse] = await Promise.all([
          api.get('/users/summary'),
          api.get('/users'),
          api.get('/users/lecturers'),
          api.get('/users/students'),
          api.get('/courses'),
          api.get('/registry'),
          api.get('/buildings'),
          api.get('/queries'),
        ]);

        setSummary(summaryResponse.data.data);
        setUsers(usersResponse.data.data || []);
        setLecturers(lecturersResponse.data.data || []);
        setStudents(studentsResponse.data.data || []);
        setCourses(coursesResponse.data.data || []);
        setRegistry(registryResponse.data.data || []);
        setBuildings(buildingsResponse.data.data || []);
        setQueries(queriesResponse.data.data || []);
        setSessions([]);
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
      setError(loadError.userMessage || loadError.response?.data?.message || 'Dashboard data could not be loaded.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadSessionDetail, role, sessionDetail?.id]);

  useEffect(() => {
    loadDataRef.current = loadData;
  }, [loadData]);

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
      await api.post('/auth/register', normalizeInstitutionPayload(userForm, {
        faculty: 'faculty',
        department: 'department',
        program: 'program',
        campus: 'campus',
      }));
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
      await api.post('/courses', normalizeInstitutionPayload(courseForm, {
        academicYear: 'academicYear',
        faculty: 'faculty',
        department: 'department',
        program: 'program',
        campus: 'campus',
        level: 'level',
      }));
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
      await api.put(`/courses/${courseId}`, normalizeInstitutionPayload(courseEditForm, {
        academicYear: 'academicYear',
        faculty: 'faculty',
        department: 'department',
        program: 'program',
        campus: 'campus',
        level: 'level',
      }));
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
        campus: normalizeInstitutionText(buildingForm.campus, 'campus'),
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

  const handleRemoveCourseSchedule = async (scheduleId) => {
    try {
      setBusyAction(`remove-schedule-${scheduleId}`);
      setMessage();
      const response = await api.delete(`/courses/schedules/${scheduleId}`);
      setMessage(response.data.message || 'Timetable entry removed successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Timetable entry could not be removed.');
    } finally {
      setBusyAction('');
    }
  };

  const handleClearCourseSchedules = async (courseId) => {
    try {
      setBusyAction(`clear-course-schedules-${courseId}`);
      setMessage();
      const response = await api.delete(`/courses/${courseId}/schedules`);
      setMessage(response.data.message || 'Course timetable removed successfully.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Course timetable could not be removed.');
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
      await api.post('/registry', normalizeInstitutionPayload(registryForm, {
        faculty: 'faculty',
        department: 'department',
        program: 'program',
        campus: 'campus',
        level: 'level',
      }));
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
      await loadLecturerCourseRoster(lecturerRosterCourseId);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || actionError.message || 'Student roster import failed.');
    } finally {
      setBusyAction('');
      event.target.value = '';
    }
  };

  const handleAddLecturerRosterStudent = async (event) => {
    event.preventDefault();
    const identifier = lecturerRosterStudentIdentifier.trim();

    if (!lecturerRosterCourseId) {
      setMessage('', 'Choose a course before adding a student.');
      return;
    }

    if (!identifier) {
      setMessage('', 'Enter a matric number or email.');
      return;
    }

    const studentPayload = identifier.includes('@')
      ? { email: identifier.toLowerCase() }
      : { matricNumber: identifier.toUpperCase() };

    try {
      setBusyAction('add-course-roster-student');
      setMessage();
      const response = await api.post(`/courses/${lecturerRosterCourseId}/enrollments/bulk`, { students: [studentPayload] });
      const linkedCount = response.data.data?.count || 0;
      const missing = response.data.data?.missing || [];

      if (!linkedCount) {
        setMessage('', missing.length ? `${missing[0]} was not found as an active student.` : 'No matching active student was found.');
        return;
      }

      setLecturerRosterStudentIdentifier('');
      setMessage('Student added to this course roster.');
      await loadData(false);
      await loadLecturerCourseRoster(lecturerRosterCourseId);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || actionError.message || 'Student could not be added.');
    } finally {
      setBusyAction('');
    }
  };

  const handleRemoveLecturerRosterStudent = async (enrollment) => {
    if (!lecturerRosterCourseId || !enrollment?.id) {
      return;
    }

    const studentName = fullName(enrollment.student);
    if (!window.confirm(`Remove ${studentName} from this course roster?`)) {
      return;
    }

    try {
      setBusyAction(`remove-course-roster-${enrollment.id}`);
      setMessage();
      await api.delete(`/courses/${lecturerRosterCourseId}/enrollments/${enrollment.id}`);
      setMessage('Student removed from this course roster.');
      await loadData(false);
      await loadLecturerCourseRoster(lecturerRosterCourseId);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || actionError.message || 'Student could not be removed.');
    } finally {
      setBusyAction('');
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
      await api.post('/queries', {
        ...queryForm,
        queryEvidence: queryEvidence.data ? queryEvidence : null,
      });
      setQueryForm(initialQueryForm);
      clearQueryEvidence();
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
      await api.patch(`/queries/${queryId}/respond`, {
        response: responseDrafts[queryId] || '',
        responseEvidence: responseEvidenceDrafts[queryId] || null,
      });
      setResponseDrafts((current) => ({ ...current, [queryId]: '' }));
      setResponseEvidenceDrafts((current) => ({ ...current, [queryId]: null }));
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

  const handleEscalateQuery = async (queryId) => {
    try {
      setBusyAction(`escalate-query-${queryId}`);
      setMessage();
      await api.patch(`/queries/${queryId}/escalate`, {
        reason: escalationDrafts[queryId] || '',
      });
      setEscalationDrafts((current) => ({ ...current, [queryId]: '' }));
      setMessage(role === 'admin' ? 'Lecturer query escalated for admin review.' : 'Query escalated to admin review.');
      await loadData(true);
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Query could not be escalated.');
    } finally {
      setBusyAction('');
    }
  };

  const handleMarkAttendance = useCallback(async (overridePayload) => {
    if (attendanceRequestRef.current) {
      return { success: false, message: 'Attendance is already being processed. Please wait a moment.' };
    }

    try {
      const resolvedPayload = typeof overridePayload === 'string'
        ? { sessionCode: overridePayload, attendancePass: '' }
        : (overridePayload || {});
      const sessionCode = String(resolvedPayload.sessionCode || attendanceForm.sessionCode || '').trim().toUpperCase();
      const attendancePass = String(resolvedPayload.attendancePass || attendanceForm.attendancePass || '').trim();
      if (resolvedPayload.sessionCode || resolvedPayload.attendancePass) {
        setAttendanceForm((current) => ({
          ...current,
          sessionCode: sessionCode || current.sessionCode,
          attendancePass: attendancePass || current.attendancePass,
        }));
      }
      if (!sessionCode) {
        const message = 'Enter or scan a valid session code before marking attendance.';
        setMessage('', message);
        return { success: false, message };
      }

      if (!attendancePass) {
        const message = 'Attendance key is missing. Scan the lecturer QR code or enter the session code with the course short code.';
        setMessage('', message);
        return { success: false, message };
      }

      attendanceRequestRef.current = true;
      setBusyAction('mark-attendance');
      setMessage();
      const location = attendanceForm.useLocation ? await getCurrentLocation() : null;
      const response = await api.post('/attendance/mark', {
        sessionCode,
        attendancePass,
        latitude: location?.latitude,
        longitude: location?.longitude,
        accuracy: location?.accuracy,
      });
      setAttendanceForm(initialAttendanceForm);
      setAttendanceEntrySource('');
      const message = response.data?.message || 'Attendance marked successfully.';
      setMessage(message);
      await loadData(true);
      return { success: true, message };
    } catch (actionError) {
      const message = actionError.response?.data?.message || 'Attendance could not be marked.';
      setMessage('', message);
      return { success: false, message };
    } finally {
      attendanceRequestRef.current = false;
      setBusyAction('');
    }
  }, [attendanceForm.attendancePass, attendanceForm.sessionCode, attendanceForm.useLocation, loadData]);

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
  const selectedLecturerRosterCourse = useMemo(
    () => courses.find((entry) => String(entry.id) === String(lecturerRosterCourseId)) || lecturerCourseRoster.course || null,
    [courses, lecturerCourseRoster.course, lecturerRosterCourseId]
  );
  const lecturerRosterEnrollments = useMemo(
    () => lecturerCourseRoster.enrollments || [],
    [lecturerCourseRoster.enrollments]
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
    const unique = (values, field) => [...new Set(values.map((value) => normalizeInstitutionText(value, field)).filter(Boolean))].sort();
    return {
      faculty: unique(registry.map((entry) => entry.faculty), 'faculty'),
      department: unique(registry.map((entry) => entry.department), 'department'),
      program: unique(registry.map((entry) => entry.program), 'program'),
      level: unique(registry.map((entry) => entry.level), 'level'),
    };
  }, [registry]);
  const adminMetadataOptions = useMemo(() => {
    const faculties = collectUniqueValues(
      users.map((entry) => normalizeInstitutionText(entry.faculty, 'faculty')),
      students.map((entry) => normalizeInstitutionText(entry.faculty, 'faculty')),
      registry.map((entry) => normalizeInstitutionText(entry.faculty, 'faculty')),
      courses.map((entry) => normalizeInstitutionText(entry.faculty, 'faculty'))
    );
    const departments = collectUniqueValues(
      users.map((entry) => normalizeInstitutionText(entry.department, 'department')),
      students.map((entry) => normalizeInstitutionText(entry.department, 'department')),
      registry.map((entry) => normalizeInstitutionText(entry.department, 'department')),
      courses.map((entry) => normalizeInstitutionText(entry.department, 'department'))
    );
    const programs = collectUniqueValues(
      users.map((entry) => normalizeInstitutionText(entry.program, 'program')),
      students.map((entry) => normalizeInstitutionText(entry.program, 'program')),
      registry.map((entry) => normalizeInstitutionText(entry.program, 'program')),
      courses.map((entry) => normalizeInstitutionText(entry.program, 'program'))
    );
    const campuses = collectUniqueValues(
      users.map((entry) => normalizeInstitutionText(entry.campus, 'campus')),
      students.map((entry) => normalizeInstitutionText(entry.campus, 'campus')),
      registry.map((entry) => normalizeInstitutionText(entry.campus, 'campus')),
      courses.map((entry) => normalizeInstitutionText(entry.campus, 'campus')),
      buildings.map((entry) => normalizeInstitutionText(entry.campus, 'campus'))
    );
    const levels = collectUniqueValues(
      registry.map((entry) => normalizeInstitutionText(entry.level, 'level')),
      courses.map((entry) => normalizeInstitutionText(entry.level, 'level')),
      DEFAULT_LEVEL_OPTIONS
    );
    const academicYears = collectUniqueValues(
      courses.map((entry) => normalizeAcademicYearValue(entry.academicYear)),
      enrollmentForm.academicYear,
      courseForm.academicYear,
      courseEditForm.academicYear
    );

    return {
      faculties,
      departments,
      programs,
      campuses,
      levels,
      academicYears,
    };
  }, [
    buildings,
    courseEditForm.academicYear,
    courseForm.academicYear,
    courses,
    enrollmentForm.academicYear,
    registry,
    students,
    users,
  ]);

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
        { label: 'Users', value: summary?.totalUsers || 0, helper: 'All roles', icon: Users, tone: 'bg-blue-600' },
        { label: 'Courses', value: summary?.totalCourses || 0, helper: 'Active courses', icon: BookOpen, tone: 'bg-slate-900' },
        { label: 'Registry', value: summary?.totalRegistryRecords || 0, helper: `${summary?.claimedRegistryRecords || 0} claimed`, icon: ShieldCheck, tone: 'bg-sky-500' },
        { label: 'Queries', value: summary?.pendingQueries || 0, helper: 'Pending replies', icon: Bell, tone: 'bg-amber-500' },
      ];
    }

    if (role === 'lecturer') {
      return [
        { label: 'Courses', value: summary?.totalCourses || 0, helper: 'Your courses', icon: BookOpen, tone: 'bg-blue-600' },
        { label: 'Active Sessions', value: summary?.activeSessions || 0, helper: 'Open now', icon: Calendar, tone: 'bg-slate-900' },
        { label: 'Pending Queries', value: summary?.pendingQueries || 0, helper: 'Awaiting follow-up', icon: Bell, tone: 'bg-amber-500' },
        { label: 'Students', value: summary?.totalStudents || 0, helper: 'Available students', icon: Users, tone: 'bg-sky-500' },
      ];
    }

    return [
      { label: 'Courses', value: summary?.totalCourses || 0, helper: 'Your courses', icon: BookOpen, tone: 'bg-blue-600' },
      { label: 'Attendance Marks', value: summary?.totalAttendanceMarks || 0, helper: 'Total marks', icon: CheckCircle2, tone: 'bg-slate-900' },
      { label: 'Pending Queries', value: summary?.pendingQueries || 0, helper: 'Awaiting reply', icon: Bell, tone: 'bg-amber-500' },
      { label: 'Late Marks', value: summary?.lateMarks || 0, helper: 'After grace period', icon: Clock3, tone: 'bg-sky-500' },
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
  const analyticsTables = useMemo(() => {
    const tables = analytics?.tables || {};
    return Object.entries(tables).map(([key, values]) => ({
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
      { key: 'lecturer-note', label: 'Use course cards below', helper: 'Download reports from Courses.' },
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

  const mobileCommand = useMemo(() => {
    const pendingQueries = queries.filter((query) => query.status === 'pending').length;
    const respondedQueries = queries.filter((query) => query.status === 'responded').length;
    const escalatedQueries = queries.filter((query) => query.escalationState === 'requested').length;
    const latestAttendance = history[0];
    const nextSession = activeSession || sessions[0] || null;
    const nextCourse = courses[0] || null;

    if (role === 'admin') {
      return {
        eyebrow: 'Mobile command',
        title: escalatedQueries > 0 ? `${escalatedQueries} escalated query${escalatedQueries === 1 ? '' : 'ies'}` : 'Admin control center',
        description: escalatedQueries > 0 ? 'Start with lecturer escalations before reports.' : 'Quickly check registry, courses, queries, and reports from your phone.',
        primaryLabel: escalatedQueries > 0 || pendingQueries > 0 ? 'Review queries' : 'Open registry',
        primaryTab: escalatedQueries > 0 || pendingQueries > 0 ? 'queries' : 'registry',
        primaryIcon: escalatedQueries > 0 || pendingQueries > 0 ? MessageSquare : ShieldCheck,
        items: [
          { label: 'Registry', value: `${summary?.claimedRegistryRecords || 0}/${summary?.totalRegistryRecords || 0} claimed`, tab: 'registry', icon: ShieldCheck, tone: 'emerald' },
          { label: 'Courses', value: `${summary?.totalCourses || courses.length || 0} active`, tab: 'courses', icon: BookOpen, tone: 'blue' },
          { label: 'Reports', value: 'Export ready', tab: 'reports', icon: FileText, tone: 'slate' },
        ],
      };
    }

    if (role === 'lecturer') {
      return {
        eyebrow: 'Today on mobile',
        title: activeSession ? `${activeSession.course?.courseCode || activeSession.sessionCode} is live` : 'Ready for your next class',
        description: activeSession ? 'Monitor attendance and close the session when class ends.' : 'Start from sessions, then handle replies and exports.',
        primaryLabel: activeSession ? 'Open session' : 'Start session',
        primaryTab: 'sessions',
        primaryIcon: Calendar,
        items: [
          { label: 'Queries', value: respondedQueries > 0 ? `${respondedQueries} need decision` : pendingQueries > 0 ? `${pendingQueries} waiting` : 'Clear', tab: 'queries', icon: MessageSquare, tone: respondedQueries > 0 ? 'amber' : 'blue' },
          { label: 'Courses', value: `${summary?.totalCourses || courses.length || 0} assigned`, tab: 'courses', icon: BookOpen, tone: 'emerald' },
          { label: 'Reports', value: 'Course exports', tab: 'reports', icon: FileText, tone: 'slate' },
        ],
      };
    }

    return {
      eyebrow: 'Today at a glance',
      title: pendingQueries > 0 ? `${pendingQueries} lecturer quer${pendingQueries === 1 ? 'y' : 'ies'} need reply` : 'Attendance ready',
      description: nextCourse ? `${nextCourse.courseCode || 'Your next course'} is one tap away. Mark attendance when your lecturer opens class.` : 'Use the attendance tab when your class starts.',
      primaryLabel: pendingQueries > 0 ? 'Reply now' : 'Mark attendance',
      primaryTab: pendingQueries > 0 ? 'queries' : 'attendance',
      primaryIcon: pendingQueries > 0 ? MessageSquare : CheckCircle2,
      items: [
        { label: 'Next class', value: nextCourse?.courseCode || nextSession?.course?.courseCode || 'No class yet', tab: 'courses', icon: BookOpen, tone: 'blue' },
        { label: 'Latest mark', value: latestAttendance?.status || 'No mark yet', tab: 'attendance', icon: CheckCircle2, tone: latestAttendance?.status === 'late' ? 'amber' : 'emerald' },
        { label: 'Reports', value: `${summary?.totalAttendanceMarks || history.length || 0} records`, tab: 'reports', icon: FileText, tone: 'slate' },
      ],
    };
  }, [activeSession, courses, history, queries, role, sessions, summary]);

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

  const openWorkspaceTab = (tab) => {
    setActiveTab(tab);
    setAccountMenuOpen(false);
    setSidebarOpen(false);
  };

  const handleQueryEvidenceChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const evidence = await createEvidencePayload(file);
      setQueryEvidence({
        ...evidence,
        note: queryEvidence.note || '',
      });
    } catch (error) {
      setMessage('', error.message || 'Evidence could not be loaded.');
    }
  };

  const clearQueryEvidence = () => {
    setQueryEvidence({ fileName: '', mimeType: '', data: '', note: '' });
  };

  const handleResponseEvidenceChange = async (queryId, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    try {
      const evidence = await createEvidencePayload(file);
      setResponseEvidenceDrafts((current) => ({
        ...current,
        [queryId]: evidence,
      }));
    } catch (error) {
      setMessage('', error.message || 'Response evidence could not be loaded.');
    }
  };

  const handleEscalationDraftChange = (queryId, value) => {
    setEscalationDrafts((current) => ({
      ...current,
      [queryId]: value,
    }));
  };

  const handleBrowserNotificationsChange = async (enabled) => {
    if (!enabled) {
      setPreferences((current) => ({ ...current, browserNotifications: false }));
      setMessage('Browser notifications turned off.');
      return;
    }

    if (!window.Notification) {
      setMessage('', 'This browser does not support browser notifications.');
      return;
    }

    let permission = window.Notification.permission;
    if (permission === 'default') {
      permission = await window.Notification.requestPermission();
    }

    if (permission !== 'granted') {
      setPreferences((current) => ({ ...current, browserNotifications: false }));
      setMessage('', 'Browser notifications were not enabled.');
      return;
    }

    setPreferences((current) => ({ ...current, browserNotifications: true }));
    setMessage('Browser notifications are enabled.');
  };

  const handleProfilePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setMessage('', 'Please choose an image file for your profile photo.');
      return;
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      setMessage('', 'Profile photo should be 900KB or smaller for reliable sync across devices.');
      return;
    }

    try {
      setBusyAction('update-profile-photo');
      setMessage();
      const nextPhoto = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('File could not be read.'));
        reader.readAsDataURL(file);
      });

      const response = await api.put('/users/me/profile', { profilePhoto: nextPhoto });
      const savedPhoto = response.data.data?.profilePhoto || nextPhoto;
      setProfile((current) => ({ ...(current || {}), ...(response.data.data || {}), profilePhoto: savedPhoto }));
      setProfilePhoto(savedPhoto);
      if (user) window.localStorage.setItem(getAvatarStorageKey(user), savedPhoto);
      setMessage('Profile photo updated successfully.');
    } catch (fileError) {
      setMessage('', fileError.response?.data?.message || fileError.message || 'Profile photo could not be updated.');
    } finally {
      setBusyAction('');
    }
  };

  const handleRemoveProfilePhoto = async () => {
    try {
      setBusyAction('update-profile-photo');
      setMessage();
      await api.put('/users/me/profile', { profilePhoto: null });
      setProfile((current) => ({ ...(current || {}), profilePhoto: null }));
      setProfilePhoto('');
      if (user) window.localStorage.removeItem(getAvatarStorageKey(user));
      setMessage('Profile photo removed.');
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Profile photo could not be removed.');
    } finally {
      setBusyAction('');
    }
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

  const handleToggleSiteMaintenance = async (enabled) => {
    const nextSettings = {
      ...siteMaintenance,
      isMaintenanceEnabled: enabled,
    };

    try {
      setBusyAction('update-site-maintenance');
      setMessage();
      setSiteMaintenance(nextSettings);
      const response = await api.put('/site/maintenance', nextSettings);
      setSiteMaintenance({
        ...initialSiteMaintenanceForm,
        ...(response.data.data || nextSettings),
      });
      setMessage(response.data.message || (enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.'));
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Maintenance settings could not be updated.');
      setSiteMaintenance((current) => ({ ...current, isMaintenanceEnabled: !enabled }));
    } finally {
      setBusyAction('');
    }
  };

  const handleSaveSiteMaintenance = async (event) => {
    event.preventDefault();

    try {
      setBusyAction('update-site-maintenance');
      setMessage();
      const response = await api.put('/site/maintenance', siteMaintenance);
      setSiteMaintenance({
        ...initialSiteMaintenanceForm,
        ...(response.data.data || siteMaintenance),
      });
      setMessage(response.data.message || 'Site maintenance settings saved.');
    } catch (actionError) {
      setMessage('', actionError.response?.data?.message || 'Site maintenance settings could not be saved.');
    } finally {
      setBusyAction('');
    }
  };

  return (
    <div className={`dashboard-shell min-h-screen ${isDark ? 'dark dashboard-shell--app text-slate-100' : 'dashboard-shell--light text-slate-900'} ${preferences.compactMode ? 'dashboard-shell--compact' : ''}`}>
      <QrScannerPanel isOpen={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleMarkAttendance} />
      <LiveNotificationToast
        item={liveNotification}
        onOpen={() => {
          if (!liveNotification) {
            return;
          }

          const tabToOpen = tabs.includes(liveNotification.linkTab) ? liveNotification.linkTab : 'notifications';
          openWorkspaceTab(tabToOpen);
          setLiveNotification(null);
        }}
        onClose={() => setLiveNotification(null)}
      />
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
              <Avatar person={user} photo={profilePhoto} className="dashboard-userchip__avatar" />
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
                  <Avatar person={user} photo={profilePhoto} className="dashboard-account__avatar" />
                  <ChevronDown className="h-4 w-4" />
                </button>
                <div className="dashboard-account-dropdown">
                  {tabs.includes('analytics') && (
                    <button
                      type="button"
                      className="dashboard-account-dropdown__item"
                      onClick={() => openWorkspaceTab('analytics')}
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      <span>Analytics</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="dashboard-account-dropdown__item"
                    onClick={() => openWorkspaceTab('settings')}
                  >
                    <Settings2 className="h-4 w-4" />
                    <span>Settings</span>
                  </button>
                  <button
                    type="button"
                    className="dashboard-account-dropdown__item"
                    onClick={() => openWorkspaceTab('profile')}
                  >
                    <UserCog className="h-4 w-4" />
                    <span>Profile & security</span>
                  </button>
                  {tabs.includes('help') && (
                    <button
                      type="button"
                      className="dashboard-account-dropdown__item"
                      onClick={() => openWorkspaceTab('help')}
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
        {refreshing && <div className={`mb-5 flex items-center gap-3 rounded-[1.2rem] border px-4 py-3 text-sm ${isDark ? 'border-white/10 bg-white/5 text-slate-200' : 'border-slate-200 bg-white/80 text-slate-600'}`}><LoaderCircle className="h-4 w-4 animate-spin text-blue-500" /><span>{loading ? 'Loading your workspace...' : 'Refreshing your workspace...'}</span></div>}
        {error && <div className="mb-6 rounded-[1.5rem] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>}
        {success && <div className="mb-6 rounded-[1.5rem] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">{success}</div>}
        <div className="mt-2 grid gap-8">

          {activeTab === 'overview' && (
            <div className="dashboard-overview">
              <section className="dashboard-welcome">
                <h1>Welcome back, {user?.firstName || 'there'} <span className="wave" role="img" aria-label="waving hand">{'\u{1F44B}'}</span></h1>
                <p>
                  {role === 'admin' && 'System overview.'}
                  {role === 'lecturer' && 'Your classes today.'}
                  {role === 'student' && 'Today at a glance.'}
                </p>
              </section>

              <MobileCommandCenter command={mobileCommand} onOpenTab={openWorkspaceTab} />

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
                    <div className="dashboard-card__meta">Vs last week</div>
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
                    {role === 'student' && `${history[0]?.session?.course?.courseCode || 'No attendance yet'} - Keep up with your courses.`}
                    {role === 'lecturer' && `${activeSession?.course?.courseCode || 'No active session'} - Open during class, close after.`}
                    {role === 'admin' && `${summary?.totalCourses || 0} active courses - Registry, users, and reports are in the menu.`}
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

                <div className="grid gap-8">
                  {analyticsTables.length > 0 ? analyticsTables.map((table) => (
                    <Panel key={table.key} title={table.title} eyebrow="Operational detail">
                      <MetricList items={table.values} emptyMessage={`No ${table.title.toLowerCase()} data is available yet for this role.`} />
                    </Panel>
                  )) : (
                    <Panel title="Operational detail" eyebrow="Operational detail">
                      <EmptyState title="No detailed tables yet" description="Detailed analytics will appear here later." />
                    </Panel>
                  )}
                </div>
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
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Export for reports and reviews.</p>
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
                <div className={`mb-4 rounded-[1.5rem] border px-5 py-4 text-sm ${preferences.browserNotifications ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900' : 'border-amber-200 bg-amber-50/80 text-amber-900'}`}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{preferences.browserNotifications ? 'Browser push alerts are enabled' : 'Browser push alerts are off'}</p>
                      <p className="mt-1 leading-6">{preferences.browserNotifications ? 'You will receive live alerts for class reminders, queries, escalations, and session updates while the dashboard is open or in the background.' : 'Turn on browser push alerts in Settings to get class reminders and live query or session updates without refreshing.'}</p>
                    </div>
                    {!preferences.browserNotifications && (
                      <button type="button" onClick={() => openWorkspaceTab('settings')} className="inline-flex items-center gap-2 rounded-2xl border border-amber-300 bg-white px-4 py-2 font-semibold text-amber-700 transition hover:bg-amber-100">
                        Open settings
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  {notifications.length > 0 ? notifications.map((item, index) => <NotificationItem key={`${item.title}-${index}`} item={item} />) : <EmptyState title="No notifications yet" description="New activity will appear here." />}
                </div>
              </Panel>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="grid gap-8 xl:grid-cols-[0.9fr_1.1fr]">
              <Panel title="Profile summary" eyebrow="Identity">
                <div className="space-y-4">
                  <div className={`flex items-center gap-4 rounded-[1.5rem] border p-5 ${isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-slate-50/80'}`}>
                    <Avatar person={profile || user} photo={profilePhoto} className="h-20 w-20 text-2xl" />
                    <div>
                      <p className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fullName(profile || user)}</p>
                      <p className={`mt-1 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Profile photo, theme, and personal preferences now live in Settings.</p>
                      <button type="button" onClick={() => openWorkspaceTab('settings')} className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
                        <Settings2 className="h-4 w-4" />
                        Open settings
                      </button>
                    </div>
                  </div>
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
                      <ActionButton type="submit" disabled={busyAction === 'change-password'} variant="contrast">
                        {busyAction === 'change-password' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                        Change password
                      </ActionButton>
                    </div>
                  </form>
                </Panel>
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
              <Panel title="Personal settings" eyebrow="Workspace control">
                <div className="space-y-5">
                  <div className={`flex flex-col gap-5 rounded-[1.75rem] border p-5 ${isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-slate-50/80'} sm:flex-row sm:items-center sm:justify-between`}>
                    <div className="flex items-center gap-4">
                      <Avatar person={profile || user} photo={profilePhoto} className="h-24 w-24 text-3xl" />
                      <div>
                        <p className={`text-xl font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{fullName(profile || user)}</p>
                        <p className={`mt-1 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{profile?.email || user?.email || 'No email available'}</p>
                        <p className={`mt-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Your photo now stays with your account and should appear across phone, tablet, and laptop views after sync.</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfilePhotoChange} />
                      <button type="button" onClick={() => photoInputRef.current?.click()} disabled={busyAction === 'update-profile-photo'} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">
                        <Upload className="h-4 w-4" />
                        {profilePhoto ? 'Change photo' : 'Add photo'}
                      </button>
                      {profilePhoto && (
                        <button type="button" onClick={handleRemoveProfilePhoto} disabled={busyAction === 'update-profile-photo'} className="inline-flex items-center gap-2 rounded-2xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                          {busyAction === 'update-profile-photo' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Remove
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <ActionTile title="Profile details" description="Update your profile and password." />
                    <ActionTile title="Account experience" description="Adjust the dashboard and reminders." />
                  </div>
                </div>
              </Panel>

              <div className="grid gap-8">
                <Panel title="Appearance" eyebrow="Theme">
                  <div className="space-y-5">
                    <div className={`rounded-[1.75rem] border p-5 ${isDark ? 'border-slate-700 bg-[linear-gradient(135deg,rgba(17,24,39,0.98),rgba(30,41,59,0.92))]' : 'border-slate-200 bg-[linear-gradient(135deg,#ffffff,#eef4ff)]'} shadow-[0_18px_40px_rgba(15,23,42,0.08)]`}>
                      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-blue-400">
                            {theme === 'dark' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5 text-amber-500" />}
                            {theme} mode
                          </div>
                          <h3 className={`mt-4 text-xl font-bold tracking-tight ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Switch the workspace mood with one toggle</h3>
                          <p className={`mt-2 max-w-xl text-sm leading-7 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Dark keeps the dashboard cinematic and focused. Light opens it up for daytime use. Flip once and the whole workspace follows.</p>
                        </div>

                        <button
                          type="button"
                          onClick={toggleTheme}
                          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
                          className={`group relative inline-flex w-full items-center justify-between rounded-[1.5rem] border p-2 md:w-[19rem] ${isDark ? 'border-slate-600 bg-slate-950/60' : 'border-slate-200 bg-white/90'} shadow-[0_16px_36px_rgba(15,23,42,0.12)] transition hover:scale-[1.01]`}
                        >
                          <span
                            className={`absolute inset-y-2 w-[calc(50%-0.5rem)] rounded-[1.1rem] transition-transform duration-300 ${theme === 'dark' ? 'translate-x-0 bg-[linear-gradient(135deg,#1d4ed8,#312e81)]' : 'translate-x-[calc(100%+0.25rem)] bg-[linear-gradient(135deg,#f59e0b,#facc15)]'}`}
                          />
                          <span className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-[1.1rem] px-4 py-3 text-sm font-semibold transition ${theme === 'dark' ? 'text-white' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            <Moon className="h-4 w-4" />
                            Dark
                          </span>
                          <span className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-[1.1rem] px-4 py-3 text-sm font-semibold transition ${theme === 'light' ? 'text-slate-950' : isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            <Sun className="h-4 w-4" />
                            Light
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className={`rounded-[1.5rem] border p-5 transition ${theme === 'dark' ? 'border-blue-500 bg-blue-950/20 shadow-[0_14px_30px_rgba(37,99,235,0.18)]' : isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-slate-50/80'}`}>
                        <div className="mb-4 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#1d4ed8,#312e81)] text-white">
                            <Moon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Dark theme</p>
                            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Focused, sleek, and easier on the eyes at night.</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="h-3 rounded-full bg-slate-800/90" />
                          <div className="grid grid-cols-[1.3fr_0.7fr] gap-3">
                            <div className="h-20 rounded-[1.25rem] bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94))]" />
                            <div className="space-y-3">
                              <div className="h-9 rounded-2xl bg-blue-600/90" />
                              <div className="h-8 rounded-2xl bg-slate-700/90" />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className={`rounded-[1.5rem] border p-5 transition ${theme === 'light' ? 'border-amber-300 bg-amber-50/80 shadow-[0_14px_30px_rgba(251,191,36,0.18)]' : isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-slate-50/80'}`}>
                        <div className="mb-4 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#fde047)] text-slate-900">
                            <Sun className="h-4 w-4" />
                          </div>
                          <div>
                            <p className={`font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Light theme</p>
                            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Bright, airy, and great when you want more visual lift.</p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <div className="h-3 rounded-full bg-slate-200" />
                          <div className="grid grid-cols-[1.3fr_0.7fr] gap-3">
                            <div className="h-20 rounded-[1.25rem] bg-[linear-gradient(180deg,#ffffff,#eaf2ff)]" />
                            <div className="space-y-3">
                              <div className="h-9 rounded-2xl bg-amber-300/90" />
                              <div className="h-8 rounded-2xl bg-slate-200" />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Panel>

                <Panel title="Preferences" eyebrow="Your experience">
                  <div className="space-y-4">
                    <PreferenceToggle
                      label="Attendance and account alerts"
                      description="Keep in-app notifications for important attendance activity and account updates."
                      checked={preferences.emailUpdates}
                      onChange={(value) => setPreferences((current) => ({ ...current, emailUpdates: value }))}
                    />
                    <PreferenceToggle
                      label="Class reminder prompts"
                      description="Keep 30-minute timetable reminder cues visible before upcoming classes and attendance windows."
                      checked={preferences.classReminders}
                      onChange={(value) => setPreferences((current) => ({ ...current, classReminders: value }))}
                    />
                    <PreferenceToggle
                      label="Browser push alerts"
                      description="Show live browser notifications for class reminders, new queries, escalations, and session updates."
                      checked={preferences.browserNotifications}
                      onChange={(value) => handleBrowserNotificationsChange(value)}
                    />
                    <PreferenceToggle
                      label="Compact dashboard layout"
                      description="Reduce spacing a bit so more information fits comfortably on your screen."
                      checked={preferences.compactMode}
                      onChange={(value) => setPreferences((current) => ({ ...current, compactMode: value }))}
                    />
                  </div>
                </Panel>

                {role === 'admin' && (
                  <Panel title="Site maintenance" eyebrow="Global access control">
                    <form onSubmit={handleSaveSiteMaintenance} className="space-y-5">
                      <div className={`rounded-[1.75rem] border p-5 ${isDark ? 'border-slate-700 bg-slate-900/70' : 'border-slate-200 bg-slate-50/80'}`}>
                        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className={`text-lg font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>Maintenance mode</p>
                            <p className={`mt-2 max-w-2xl text-sm leading-6 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>When this is enabled, all non-admin visitors will see the maintenance screen and the rest of the site will be locked for them.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleToggleSiteMaintenance(!siteMaintenance.isMaintenanceEnabled)}
                            disabled={busyAction === 'update-site-maintenance'}
                            className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${siteMaintenance.isMaintenanceEnabled ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                          >
                            {busyAction === 'update-site-maintenance' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                            {siteMaintenance.isMaintenanceEnabled ? 'Disable maintenance' : 'Enable maintenance'}
                          </button>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge tone={siteMaintenance.isMaintenanceEnabled ? 'rose' : 'emerald'}>{siteMaintenance.isMaintenanceEnabled ? 'Maintenance active' : 'Site open'}</Badge>
                          <Badge tone="slate">Last updated: {formatDateTime(siteMaintenance.updatedAt)}</Badge>
                        </div>
                      </div>

                      <div className="grid gap-4">
                        <Input
                          label="Badge text"
                          value={siteMaintenance.badge}
                          onChange={(value) => setSiteMaintenance((current) => ({ ...current, badge: value }))}
                        />
                        <Input
                          label="Title"
                          value={siteMaintenance.title}
                          onChange={(value) => setSiteMaintenance((current) => ({ ...current, title: value }))}
                        />
                        <div>
                          <label className={`mb-2 block text-sm font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Message</label>
                          <textarea
                            rows={5}
                            value={siteMaintenance.body}
                            onChange={(event) => setSiteMaintenance((current) => ({ ...current, body: event.target.value }))}
                            className={`w-full rounded-[1.5rem] border px-4 py-4 text-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100 ${isDark ? 'border-slate-700 bg-slate-900/80 text-slate-100 placeholder:text-slate-500' : 'border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-400'}`}
                            placeholder="Write the maintenance message visitors will see."
                          />
                        </div>
                        <Input
                          label="Footer text"
                          value={siteMaintenance.footer}
                          onChange={(value) => setSiteMaintenance((current) => ({ ...current, footer: value }))}
                        />
                      </div>

                      <div className="flex flex-wrap gap-3">
                        <button
                          type="submit"
                          disabled={busyAction === 'update-site-maintenance'}
                          className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {busyAction === 'update-site-maintenance' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                          Save site message
                        </button>
                        <button
                          type="button"
                          onClick={() => setSiteMaintenance(initialSiteMaintenanceForm)}
                          className={`inline-flex items-center gap-2 rounded-2xl border px-5 py-3 font-semibold transition ${isDark ? 'border-slate-700 text-slate-200 hover:bg-slate-800' : 'border-slate-300 text-slate-700 hover:bg-slate-100'}`}
                        >
                          Reset defaults
                        </button>
                      </div>
                    </form>
                  </Panel>
                )}

                <Panel title="Quick links" eyebrow="Shortcuts">
                  <div className="grid gap-4 md:grid-cols-2">
                    <button type="button" onClick={() => openWorkspaceTab('profile')} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 text-left transition hover:border-blue-300 hover:bg-blue-50/70 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-blue-700 dark:hover:bg-slate-900">
                      <div className="flex items-center gap-3">
                        <UserCog className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">Profile & security</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Update names, department info, and password.</p>
                        </div>
                      </div>
                    </button>
                    <button type="button" onClick={() => openWorkspaceTab('help')} className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 text-left transition hover:border-blue-300 hover:bg-blue-50/70 dark:border-slate-700 dark:bg-slate-900/70 dark:hover:border-blue-700 dark:hover:bg-slate-900">
                      <div className="flex items-center gap-3">
                        <CircleHelp className="h-5 w-5 text-blue-500" />
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-slate-100">Help & support</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Open support articles and contact details quickly.</p>
                        </div>
                      </div>
                    </button>
                  </div>
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
                  <ActionTile title="Check notifications first" description="Most issues show up here first." />
                  <ActionTile title="Use exports for escalation" description="Attach a PDF or CSV when reporting." />
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
                    <Select label="Department" value={userForm.department} onChange={(value) => setUserForm((current) => ({ ...current, department: value }))} options={buildSelectOptions(adminMetadataOptions.departments, 'Choose department', userForm.department)} />
                    <Select label="Faculty" value={userForm.faculty} onChange={(value) => setUserForm((current) => ({ ...current, faculty: value }))} options={buildSelectOptions(adminMetadataOptions.faculties, 'Choose faculty', userForm.faculty)} />
                    <Select label="Program" value={userForm.program} onChange={(value) => setUserForm((current) => ({ ...current, program: value }))} options={buildSelectOptions(adminMetadataOptions.programs, 'Choose program', userForm.program)} />
                    <Select label="Campus" value={userForm.campus} onChange={(value) => setUserForm((current) => ({ ...current, campus: value }))} options={buildSelectOptions(adminMetadataOptions.campuses, 'Choose campus', userForm.campus)} />
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
                      <Select label="Department" value={studentEditForm.department} onChange={(value) => setStudentEditForm((current) => ({ ...current, department: value }))} options={buildSelectOptions(adminMetadataOptions.departments, 'Choose department', studentEditForm.department)} />
                      <Select label="Faculty" value={studentEditForm.faculty} onChange={(value) => setStudentEditForm((current) => ({ ...current, faculty: value }))} options={buildSelectOptions(adminMetadataOptions.faculties, 'Choose faculty', studentEditForm.faculty)} />
                      <Select label="Program" value={studentEditForm.program} onChange={(value) => setStudentEditForm((current) => ({ ...current, program: value }))} options={buildSelectOptions(adminMetadataOptions.programs, 'Choose program', studentEditForm.program)} />
                      <div className="md:col-span-2">
                        <ActionButton type="submit" disabled={busyAction === 'update-student-profile'} variant="contrast">{busyAction === 'update-student-profile' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Update profile</ActionButton>
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
                              Department and level matches come first, then you can add others manually.
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
                    <Select label="Faculty" value={registryForm.faculty} onChange={(value) => setRegistryForm((current) => ({ ...current, faculty: value }))} options={buildSelectOptions(adminMetadataOptions.faculties, 'Choose faculty', registryForm.faculty)} />
                    <Select label="Department" value={registryForm.department} onChange={(value) => setRegistryForm((current) => ({ ...current, department: value }))} options={buildSelectOptions(adminMetadataOptions.departments, 'Choose department', registryForm.department)} />
                    <Select label="Program" value={registryForm.program} onChange={(value) => setRegistryForm((current) => ({ ...current, program: value }))} options={buildSelectOptions(adminMetadataOptions.programs, 'Choose program', registryForm.program)} />
                    <Select label="Campus" value={registryForm.campus} onChange={(value) => setRegistryForm((current) => ({ ...current, campus: value }))} options={buildSelectOptions(adminMetadataOptions.campuses, 'Choose campus', registryForm.campus)} />
                    <Select label="Level" value={registryForm.level} onChange={(value) => setRegistryForm((current) => ({ ...current, level: value }))} options={buildSelectOptions(adminMetadataOptions.levels, 'Choose level', registryForm.level)} />
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
                      <ActionButton onClick={handleLinkRegistry} disabled={busyAction === 'link-registry'} variant="contrast">{busyAction === 'link-registry' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Link record</ActionButton>
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
                        <form onSubmit={handleCreateCourse} className="dashboard-form-grid md:grid-cols-2">
                          <Input label="Course code" value={courseForm.courseCode} onChange={(value) => setCourseForm((current) => ({ ...current, courseCode: value.toUpperCase() }))} />
                          <Input label="Course name" value={courseForm.courseName} onChange={(value) => setCourseForm((current) => ({ ...current, courseName: value }))} />
                          <Select label="Semester" value={courseForm.semester} onChange={(value) => setCourseForm((current) => ({ ...current, semester: value }))} options={[{ value: 'rain', label: 'Rain' }, { value: 'harmattan', label: 'Harmattan' }]} />
                          <Select label="Academic year" value={courseForm.academicYear} onChange={(value) => setCourseForm((current) => ({ ...current, academicYear: value }))} options={buildSelectOptions(adminMetadataOptions.academicYears, 'Choose academic year', courseForm.academicYear)} />
                          <Select label="Faculty" value={courseForm.faculty} onChange={(value) => setCourseForm((current) => ({ ...current, faculty: value }))} options={buildSelectOptions(adminMetadataOptions.faculties, 'Choose faculty', courseForm.faculty)} />
                          <Select label="Department" value={courseForm.department} onChange={(value) => setCourseForm((current) => ({ ...current, department: value }))} options={buildSelectOptions(adminMetadataOptions.departments, 'Choose department', courseForm.department)} />
                          <Select label="Program" value={courseForm.program} onChange={(value) => setCourseForm((current) => ({ ...current, program: value }))} options={buildSelectOptions(adminMetadataOptions.programs, 'Choose program', courseForm.program)} />
                          <Select label="Campus" value={courseForm.campus} onChange={(value) => setCourseForm((current) => ({ ...current, campus: value }))} options={buildSelectOptions(adminMetadataOptions.campuses, 'Choose campus', courseForm.campus)} />
                          <Select label="Level" value={courseForm.level} onChange={(value) => setCourseForm((current) => ({ ...current, level: value }))} options={buildSelectOptions(adminMetadataOptions.levels, 'Choose level', courseForm.level)} />
                          <Select label="Assign lecturer" value={courseForm.lecturerId} onChange={(value) => setCourseForm((current) => ({ ...current, lecturerId: value }))} options={[{ value: '', label: 'Choose lecturer' }, ...lecturers.map((lecturer) => ({ value: lecturer.id, label: `${fullName(lecturer)} (${lecturer.department || 'No dept'})` }))]} />
                          <TextAreaField label="Description" value={courseForm.description} onChange={(value) => setCourseForm((current) => ({ ...current, description: value }))} />
                          <div className="md:col-span-2">
                            <ActionButton type="submit" disabled={busyAction === 'create-course'}>
                              {busyAction === 'create-course' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                              Create course
                            </ActionButton>
                          </div>
                      </form>
                    </Panel>
                  )}
                  {role === 'admin' && (
                    <Panel title="Import course catalog" eyebrow="Faculty course list">
                      <div className="space-y-4">
                        <p className="dashboard-section-copy text-sm leading-7 text-slate-600">Upload a CSV with course details.</p>
                        <FileField label="Upload course CSV" accept=".csv,text/csv" onChange={handleCourseCatalogCsvUpload} fileName={courseCatalogFileName} />
                      </div>
                    </Panel>
                  )}
                  {role === 'admin' && (
                    <Panel title="Import timetable" eyebrow="Schedule upload">
                      <div className="space-y-4">
                        <p className="dashboard-section-copy text-sm leading-7 text-slate-600">Upload a timetable <span className="font-mono">PDF</span> or <span className="font-mono">CSV</span> to map courses and class times. Removing timetable slots from a course card stops future reminder alerts automatically.</p>
                        <FileField label="Upload timetable file" accept=".pdf,.csv,text/csv,application/pdf" onChange={handleTimetableCsvUpload} fileName={timetableFileName} />
                      </div>
                    </Panel>
                  )}
                  {role === 'admin' && (
                    <Panel title="Building geofences" eyebrow="Location setup">
                      <form onSubmit={handleCreateBuilding} className="dashboard-form-grid md:grid-cols-2">
                        <Input label="Building name" value={buildingForm.name} onChange={(value) => setBuildingForm((current) => ({ ...current, name: value }))} />
                        <Input label="Tag (optional)" value={buildingForm.tag} onChange={(value) => setBuildingForm((current) => ({ ...current, tag: value }))} />
                        <Select label="Campus" value={buildingForm.campus} onChange={(value) => setBuildingForm((current) => ({ ...current, campus: value }))} options={buildSelectOptions(adminMetadataOptions.campuses, 'Choose campus', buildingForm.campus)} />
                        <Input label="Latitude" value={buildingForm.latitude} onChange={(value) => setBuildingForm((current) => ({ ...current, latitude: value }))} />
                        <Input label="Longitude" value={buildingForm.longitude} onChange={(value) => setBuildingForm((current) => ({ ...current, longitude: value }))} />
                        <Input label="Radius (meters)" type="number" value={buildingForm.radiusMeters} onChange={(value) => setBuildingForm((current) => ({ ...current, radiusMeters: value }))} />
                        <div className="md:col-span-2">
                          <ActionButton type="submit" variant="secondary" disabled={busyAction === 'create-building'}>
                            {busyAction === 'create-building' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                            Save building geofence
                          </ActionButton>
                        </div>
                      </form>

                      <div className="dashboard-list mt-6 space-y-3">
                        {filteredBuildings.length > 0 ? filteredBuildings.map((building) => (
                          <div key={building.id} className="dashboard-record-card rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{building.name} {building.tag ? `(${building.tag})` : ''}</p>
                                <p className="mt-1 text-sm text-slate-500">Campus: {building.campus || 'Not set'}</p>
                                <p className="mt-1 text-sm text-slate-500">Center: {building.latitude}, {building.longitude}</p>
                                <p className="mt-1 text-sm text-slate-500">Radius: {building.radiusMeters}m</p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Badge tone={building.isActive ? 'emerald' : 'rose'}>{building.isActive ? 'active' : 'inactive'}</Badge>
                                {building.isActive && (
                                  <ActionButton onClick={() => handleDeactivateBuilding(building.id)} disabled={busyAction === `deactivate-building-${building.id}`} variant="danger" className="px-3 py-2 text-xs">
                                    {busyAction === `deactivate-building-${building.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                    Deactivate
                                  </ActionButton>
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
                    <Panel
                      title="Course roster"
                      eyebrow="Lecturer student list"
                      action={<Badge tone={rosterLoading ? 'amber' : 'blue'}>{rosterLoading ? 'Loading' : `${lecturerRosterEnrollments.length} students`}</Badge>}
                    >
                      <div className="space-y-5">
                        <div className="grid gap-4 lg:grid-cols-2">
                          <Select label="Assigned course" value={lecturerRosterCourseId} onChange={(value) => setLecturerRosterCourseId(value)} options={[{ value: '', label: 'Choose course' }, ...courses.map((course) => ({ value: course.id, label: `${course.courseCode} - ${course.courseName}` }))]} />
                          <form onSubmit={handleAddLecturerRosterStudent} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                            <Input label="Matric number or email" value={lecturerRosterStudentIdentifier} onChange={setLecturerRosterStudentIdentifier} placeholder="Matric number or email" />
                            <ActionButton type="submit" disabled={busyAction === 'add-course-roster-student' || !lecturerRosterCourseId} className="justify-center">
                              {busyAction === 'add-course-roster-student' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                              Add
                            </ActionButton>
                          </form>
                        </div>

                        <FileField label="Roster CSV" accept=".csv,text/csv" onChange={handleLecturerRosterCsvUpload} fileName={lecturerRosterFileName} />

                        {selectedLecturerRosterCourse && (
                          <div className="dashboard-callout rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selectedLecturerRosterCourse.courseCode} - {selectedLecturerRosterCourse.courseName}</p>
                                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{selectedLecturerRosterCourse.semester} semester | {selectedLecturerRosterCourse.academicYear}</p>
                              </div>
                              <Badge tone="slate">{lecturerCourseRoster.count || lecturerRosterEnrollments.length} active</Badge>
                            </div>
                          </div>
                        )}

                        {rosterLoading ? (
                          <div className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-300">
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Loading course roster
                          </div>
                        ) : lecturerRosterEnrollments.length > 0 ? (
                          <div className="space-y-3">
                            {lecturerRosterEnrollments.map((enrollment) => {
                              const student = enrollment.student || {};
                              return (
                                <div key={enrollment.id} className="dashboard-record-card rounded-[1.25rem] border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/70">
                                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                      <p className="font-semibold text-slate-950 dark:text-slate-100">{fullName(student)}</p>
                                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{student.matricNumber || 'No matric number'} | {student.email || 'No email'}</p>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        <Badge tone="slate">{student.department || student.registryRecord?.department || 'No department'}</Badge>
                                        <Badge tone="blue">{student.registryRecord?.level || 'No level'}</Badge>
                                        <Badge tone="emerald">{enrollment.status}</Badge>
                                      </div>
                                    </div>
                                    <ActionButton
                                      type="button"
                                      onClick={() => handleRemoveLecturerRosterStudent(enrollment)}
                                      disabled={busyAction === `remove-course-roster-${enrollment.id}`}
                                      variant="danger"
                                      className="px-4 py-2"
                                    >
                                      {busyAction === `remove-course-roster-${enrollment.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                      Remove
                                    </ActionButton>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <EmptyState title="No students linked" description={lecturerRosterCourseId ? 'This course roster is empty.' : 'Choose an assigned course.'} />
                        )}
                      </div>
                    </Panel>
                  )}
                  {role === 'lecturer' && (
                    <Panel title="Create an attendance session" eyebrow="Class operations">
                      <form onSubmit={handleCreateSession} className="dashboard-form-grid md:grid-cols-2">
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
                        <div className="dashboard-callout md:col-span-2 rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm text-slate-700">
                          Geofence is auto-applied from the selected building. Students outside that building radius cannot mark attendance.
                        </div>
                        <div className="md:col-span-2">
                          <ActionButton type="submit" disabled={busyAction === 'create-session'}>
                            {busyAction === 'create-session' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                            Create session
                          </ActionButton>
                        </div>
                      </form>
                    </Panel>
                  )}
                </div>
              )}
              <Panel title={role === 'student' ? 'My semester courses' : 'Course directory'} eyebrow="Course list">
                <div className="space-y-4">
                  {role === 'student' && (
                    <div className="dashboard-callout rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Manage semester courses.</p>
                          <p className="mt-1 text-sm text-slate-600">Use course selection to update your list.</p>
                        </div>
                        <ActionButton
                          type="button"
                          onClick={() => navigate('/course-selection')}
                          className="px-4"
                        >
                          <BookOpen className="h-4 w-4" />
                          Manage courses
                        </ActionButton>
                      </div>
                    </div>
                  )}
                  {groupedCourses.length > 0 ? groupedCourses.map((departmentGroup) => (
                    <div key={`course-group-${departmentGroup.department}`} className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">{departmentGroup.department}</p>
                          <p className="mt-1 text-sm text-slate-500">Grouped by department and level.</p>
                        </div>
                        <Badge tone="slate">{departmentGroup.levels.reduce((sum, levelGroup) => sum + levelGroup.items.length, 0)} courses</Badge>
                      </div>
                      {departmentGroup.levels.map((levelGroup) => (
                        <div key={`course-level-${departmentGroup.department}-${levelGroup.level}`} className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{levelGroup.level}</p>
                          <div className="space-y-4">
                            {levelGroup.items.map((course) => (
                              <div key={course.id} className="dashboard-record-card rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-5">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{course.courseCode}</p>
                                    <p className="mt-2 text-lg font-bold text-slate-950">{course.courseName}</p>
                                    <p className="mt-2 text-sm text-slate-500">{course.semester} semester | {course.academicYear}</p>
                                    {course.campus && <p className="mt-1 text-sm text-slate-500">Campus: {course.campus}</p>}
                                    <p className="mt-1 text-sm text-slate-500">Lecturer: {fullName(course.lecturer)}</p>
                                    {course.enrollment && <p className="mt-1 text-sm text-slate-500">Enrollment status: {course.enrollment.status}</p>}
                                    {course.schedules?.length > 0 && (
                                      <div className="mt-3 space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                        {course.schedules.map((schedule) => (
                                          <span key={`${course.id}-${schedule.id}`} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                                            <span>{schedule.dayOfWeek} {formatTime(schedule.startTime)}-{formatTime(schedule.endTime)}{schedule.venue ? ` | ${schedule.venue}` : ''}</span>
                                            {role === 'admin' && (
                                              <button
                                                type="button"
                                                onClick={() => handleRemoveCourseSchedule(schedule.id)}
                                                disabled={busyAction === `remove-schedule-${schedule.id}`}
                                                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                                                aria-label={`Remove timetable slot for ${course.courseCode}`}
                                              >
                                                {busyAction === `remove-schedule-${schedule.id}` ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                              </button>
                                            )}
                                          </span>
                                        ))}
                                        </div>
                                        {role === 'admin' && (
                                          <ActionButton onClick={() => handleClearCourseSchedules(course.id)} disabled={busyAction === `clear-course-schedules-${course.id}`} type="button" variant="danger" className="px-4 py-2">
                                            {busyAction === `clear-course-schedules-${course.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                            Remove course timetable
                                          </ActionButton>
                                        )}
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
                                        <ActionButton onClick={handleCancelCourseEdit} type="button" variant="secondary" className="px-4 py-2">
                                          Cancel edit
                                        </ActionButton>
                                      ) : (
                                        <ActionButton onClick={() => handleStartCourseEdit(course)} type="button" variant="soft" className="px-4 py-2">
                                          Edit course
                                        </ActionButton>
                                      )}
                                      {course.isActive !== false && (
                                        <ActionButton onClick={() => handleArchiveCourse(course.id)} disabled={busyAction === `archive-course-${course.id}`} variant="warning" className="px-4 py-2">
                                          {busyAction === `archive-course-${course.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                          Archive course
                                        </ActionButton>
                                      )}
                                    </div>
                                    {editingCourseId === String(course.id) && (
                                      <form onSubmit={(event) => handleUpdateCourse(event, course.id)} className="dashboard-form-grid dashboard-form-grid--nested rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-4 md:grid-cols-2">
                                        <Input label="Course code" value={courseEditForm.courseCode} onChange={(value) => setCourseEditForm((current) => ({ ...current, courseCode: value.toUpperCase() }))} />
                                        <Input label="Course name" value={courseEditForm.courseName} onChange={(value) => setCourseEditForm((current) => ({ ...current, courseName: value }))} />
                                        <Select label="Semester" value={courseEditForm.semester} onChange={(value) => setCourseEditForm((current) => ({ ...current, semester: value }))} options={[{ value: 'rain', label: 'Rain' }, { value: 'harmattan', label: 'Harmattan' }]} />
                                        <Select label="Academic year" value={courseEditForm.academicYear} onChange={(value) => setCourseEditForm((current) => ({ ...current, academicYear: value }))} options={buildSelectOptions(adminMetadataOptions.academicYears, 'Choose academic year', courseEditForm.academicYear)} />
                                        <Select label="Faculty" value={courseEditForm.faculty} onChange={(value) => setCourseEditForm((current) => ({ ...current, faculty: value }))} options={buildSelectOptions(adminMetadataOptions.faculties, 'Choose faculty', courseEditForm.faculty)} />
                                        <Select label="Department" value={courseEditForm.department} onChange={(value) => setCourseEditForm((current) => ({ ...current, department: value }))} options={buildSelectOptions(adminMetadataOptions.departments, 'Choose department', courseEditForm.department)} />
                                        <Select label="Program" value={courseEditForm.program} onChange={(value) => setCourseEditForm((current) => ({ ...current, program: value }))} options={buildSelectOptions(adminMetadataOptions.programs, 'Choose program', courseEditForm.program)} />
                                        <Select label="Campus" value={courseEditForm.campus} onChange={(value) => setCourseEditForm((current) => ({ ...current, campus: value }))} options={buildSelectOptions(adminMetadataOptions.campuses, 'Choose campus', courseEditForm.campus)} />
                                        <Select label="Level" value={courseEditForm.level} onChange={(value) => setCourseEditForm((current) => ({ ...current, level: value }))} options={buildSelectOptions(adminMetadataOptions.levels, 'Choose level', courseEditForm.level)} />
                                        <Select label="Assign lecturer" value={courseEditForm.lecturerId} onChange={(value) => setCourseEditForm((current) => ({ ...current, lecturerId: value }))} options={[{ value: '', label: 'Choose lecturer' }, ...lecturers.map((lecturer) => ({ value: lecturer.id, label: `${fullName(lecturer)} (${lecturer.department || 'No dept'})` }))]} />
                                        <TextAreaField label="Description" value={courseEditForm.description} onChange={(value) => setCourseEditForm((current) => ({ ...current, description: value }))} />
                                        <div className="md:col-span-2">
                                          <ActionButton type="submit" disabled={busyAction === `update-course-${course.id}`}>
                                            {busyAction === `update-course-${course.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}
                                            Save course changes
                                          </ActionButton>
                                        </div>
                                      </form>
                                    )}
                                  </div>
                                )}
                                {role === 'lecturer' && (
                                  <div className="mt-4 flex flex-wrap gap-2">
                                    <ActionButton onClick={() => handleDownloadReport(course.id, 'csv')} disabled={busyAction === `download-csv-${course.id}`} variant="soft" className="px-4 py-2">{busyAction === `download-csv-${course.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download CSV</ActionButton>
                                    <ActionButton onClick={() => handleDownloadReport(course.id, 'pdf')} disabled={busyAction === `download-pdf-${course.id}`} variant="secondary" className="px-4 py-2">{busyAction === `download-pdf-${course.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Download PDF</ActionButton>
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
                    <button key={session.id} onClick={() => loadSessionDetail(session.id)} className={`dashboard-record-card dashboard-record-card--interactive w-full rounded-[1.5rem] border p-5 text-left transition ${sessionDetail?.id === session.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50/80 hover:border-blue-300'}`}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">{session.course?.courseCode || 'Course'}</p><p className="mt-2 text-lg font-bold text-slate-950">{session.course?.courseName || 'Attendance session'}</p><p className="mt-2 text-sm text-slate-500">{formatDate(session.date)} at {formatTime(session.startTime)}</p><p className="mt-1 text-sm text-slate-500">Venue: {session.venue || 'Not set'}</p></div>
                        <div className="flex flex-wrap gap-2"><Badge tone={session.status === 'active' ? 'emerald' : 'slate'}>{session.status}</Badge><Badge tone="blue">{session.sessionCode}</Badge></div>
                      </div>
                    </button>
                  )) : <EmptyState title="No sessions found" description="Create a session to generate a QR code." />}
                </div>
              </Panel>
              <div className="grid gap-8">
                <Panel title="Selected session detail" eyebrow="Live attendance">
                  {sessionDetail ? (
                    <div className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-2">
                        <SummaryTile label="Course" value={sessionDetail.course?.courseCode || 'Not set'} helper={sessionDetail.course?.courseName || 'Linked course'} />
                        <SummaryTile label="Session code" value={sessionDetail.sessionCode} helper={`${formatDate(sessionDetail.date)} at ${formatTime(sessionDetail.startTime)}`} />
                        <SummaryTile label="Attendance key" value={sessionDetail.attendanceKey || getAttendanceKeyForCourse(sessionDetail.course) || 'Unavailable'} helper={sessionDetail.attendancePassExpiresAt ? `Fallback uses the course short code until ${formatDateTime(sessionDetail.attendancePassExpiresAt)}.` : 'Fallback uses the course short code.'} />
                        <SummaryTile label="Expected students" value={sessionDetail.attendanceStats?.expectedCount || 0} helper="Expected count" />
                        <SummaryTile label="Marked attendance" value={sessionDetail.attendanceStats?.markedCount || 0} helper="Present or late" />
                        <SummaryTile label="Present on time" value={sessionDetail.attendanceStats?.presentCount || 0} helper="Marked in time" />
                        <SummaryTile label="Absent students" value={sessionDetail.attendanceStats?.absentCount || 0} helper="Will get follow-up" />
                      </div>
                      {(sessionDetail.geofenceLatitude && sessionDetail.geofenceLongitude && sessionDetail.geofenceRadiusMeters) && (
                        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-900">
                          Geofence active: center {sessionDetail.geofenceLatitude}, {sessionDetail.geofenceLongitude} with {sessionDetail.geofenceRadiusMeters}m radius.
                        </div>
                      )}
                      {qrDataUrl && <div className="rounded-[1.75rem] border border-blue-100 bg-blue-50/70 p-5"><div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"><div className="max-w-2xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">QR code</p><p className="mt-2 text-sm leading-7 text-slate-600">Scan to open attendance with the session filled in.</p><p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Fallback pair: {sessionDetail.sessionCode} + {sessionDetail.attendanceKey || getAttendanceKeyForCourse(sessionDetail.course) || 'COURSE CODE'}</p></div><div className="shrink-0 self-center rounded-[1.75rem] border border-white bg-white p-4 shadow-sm"><img src={qrDataUrl} alt="Session QR code" className="block h-52 w-52 shrink-0 rounded-[1.25rem] object-contain sm:h-56 sm:w-56" /></div></div></div>}
                      <div className="flex flex-wrap gap-3">
                        {sessionDetail.status === 'active' && <ActionButton onClick={() => handleCloseSession(sessionDetail.id)} disabled={busyAction === `close-session-${sessionDetail.id}`} variant="contrast">{busyAction === `close-session-${sessionDetail.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Close session and auto-send queries</ActionButton>}
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
                    {attendanceEntrySource && <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50/80 px-5 py-4 text-sm text-emerald-800">Attendance details were loaded from {attendanceEntrySource}. Confirm the session code and tap <span className="font-semibold">Mark with code</span>.</div>}
                    <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-5"><p className="text-sm leading-7 text-slate-600">Use the scanner, or enter the session code and course short code manually.</p></div>
                    <div className="grid gap-4">
                      <Input label="Session code" value={attendanceForm.sessionCode} onChange={(value) => setAttendanceForm((current) => ({ ...current, sessionCode: value.toUpperCase() }))} />
                      <Input label="Attendance key (course short code)" value={attendanceForm.attendancePass} onChange={(value) => setAttendanceForm((current) => ({ ...current, attendancePass: value.toUpperCase() }))} />
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
                    <FileField label="Attach evidence (optional)" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={handleQueryEvidenceChange} helper="Optional PDF or image, up to 3MB." fileName={queryEvidence.fileName} />
                    <TextAreaField label="Evidence note (optional)" value={queryEvidence.note} onChange={(value) => setQueryEvidence((current) => ({ ...current, note: value }))} rows={3} placeholder="Add a short explanation for the attachment." />
                    {queryEvidence.data && (
                      <div className="rounded-[1.5rem] border border-blue-100 bg-blue-50/70 p-4 text-sm text-slate-700">
                        <p className="font-semibold text-slate-900">Selected evidence</p>
                        <p className="mt-1">{queryEvidence.fileName}</p>
                        <button type="button" onClick={clearQueryEvidence} className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50">Remove attachment</button>
                      </div>
                    )}
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
                          {query.escalationState === 'requested' && <p className="mt-1 text-sm font-semibold text-rose-600">Escalated to admin for review.</p>}
                          {query.escalatedBy && <p className="mt-1 text-sm text-slate-500">Escalated by: {fullName(query.escalatedBy)}</p>}
                          {query.escalationReason && <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800"><span className="font-semibold">Escalation note:</span> {query.escalationReason}</div>}
                          <EvidenceAttachment label="Query evidence" fileName={query.queryEvidenceFileName} mimeType={query.queryEvidenceMimeType} data={query.queryEvidenceData} note={query.queryEvidenceNote} />
                          {query.studentResponse && <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800"><span className="font-semibold">Student response:</span> {query.studentResponse}</div>}
                          <EvidenceAttachment label="Response evidence" fileName={query.responseEvidenceFileName} mimeType={query.responseEvidenceMimeType} data={query.responseEvidenceData} note={query.responseEvidenceNote} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone={query.status === 'pending' ? 'amber' : query.status === 'responded' ? 'blue' : 'emerald'}>{query.status}</Badge>
                          {query.escalationState === 'requested' && <Badge tone="rose">escalated</Badge>}
                        </div>
                      </div>
                      {role === 'student' && query.status === 'pending' && (
                        <div className="mt-4 space-y-3">
                          <textarea value={responseDrafts[query.id] || ''} onChange={(event) => setResponseDrafts((current) => ({ ...current, [query.id]: event.target.value }))} rows={4} className="w-full rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" placeholder="Explain why you missed class" />
                          <FileField label="Attach response evidence (optional)" accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={(event) => handleResponseEvidenceChange(query.id, event)} fileName={responseEvidenceDrafts[query.id]?.fileName || ''} helper="Optional PDF or image, up to 3MB." />
                          <button onClick={() => handleRespondToQuery(query.id)} disabled={busyAction === `respond-query-${query.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-blue-700 px-5 py-3 font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60">{busyAction === `respond-query-${query.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Submit response</button>
                        </div>
                      )}
                      {canEscalateQueryInDashboard(query, role, user) && (
                        <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-white/70 p-4">
                          <p className="text-sm font-semibold text-slate-900">{role === 'admin' ? 'Escalate lecturer query' : 'Escalate to admin'}</p>
                          <p className="mt-1 text-sm text-slate-600">{role === 'admin' ? 'Use this when a lecturer-originated query needs formal admin attention.' : 'Use this when the explanation still needs a higher-level review.'}</p>
                          <textarea value={escalationDrafts[query.id] || ''} onChange={(event) => handleEscalationDraftChange(query.id, event.target.value)} rows={3} className="mt-3 w-full rounded-[1.25rem] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100" placeholder={role === 'admin' ? 'What should be reviewed formally?' : 'What should admin review?'} />
                          <div className="mt-3 flex flex-wrap gap-3">
                            <button onClick={() => handleEscalateQuery(query.id)} disabled={busyAction === `escalate-query-${query.id}`} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">{busyAction === `escalate-query-${query.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}{role === 'admin' ? 'Escalate lecturer query' : 'Escalate to admin'}</button>
                          </div>
                        </div>
                      )}
                      {((role === 'lecturer' && query.status === 'responded') || (role === 'admin' && query.status !== 'closed')) && <button onClick={() => handleCloseQuery(query.id)} disabled={busyAction === `close-query-${query.id}`} className="mt-4 inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60">{busyAction === `close-query-${query.id}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{role === 'admin' ? 'Resolve query' : 'Close query'}</button>}
                    </div>
                  )) : <EmptyState title="No queries found" description={role === 'student' ? 'You have no outstanding lecturer queries right now.' : 'Auto-generated and manual absence queries will appear here.'} />}
                </div>
              </Panel>
            </div>
          )}
            </div>
          </section>
        </main>
        <nav className="dashboard-mobile-nav" aria-label="Mobile dashboard navigation">
          {primaryTabs.slice(0, 5).map((tab) => {
            const Icon = TAB_ICONS[tab] || LayoutDashboard;
            return (
              <button
                type="button"
                key={tab}
                onClick={() => openWorkspaceTab(tab)}
                className={`dashboard-mobile-nav__item ${activeTab === tab ? 'is-active' : ''}`}
              >
                <Icon className="h-5 w-5" />
                <span>{TAB_LABELS[tab]}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default Dashboard;
