const titleCaseInstitutionText = (value = '') => String(value || '')
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

const normalizeAcademicYear = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const compact = raw.replace(/\s+/g, '');
  const match = compact.match(/^(\d{2,4})\/(\d{2,4})$/);
  if (match) {
    const [, startRaw, endRaw] = match;
    const startYear = startRaw.length === 2 ? `20${startRaw}` : startRaw;
    const endYear = endRaw.length === 2 ? `20${endRaw}` : endRaw;
    return `${startYear.slice(-2)}/${endYear.slice(-2)}`;
  }

  const fourDigitYears = compact.match(/\d{4}/g);
  if (fourDigitYears && fourDigitYears.length >= 2) {
    return `${fourDigitYears[0].slice(-2)}/${fourDigitYears[1].slice(-2)}`;
  }

  const twoDigitYears = compact.match(/\d{2}/g);
  if (twoDigitYears && twoDigitYears.length >= 2) {
    return `${twoDigitYears[0]}/${twoDigitYears[1]}`;
  }

  return compact;
};

const normalizeLevel = (value = '') => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) {
    return '';
  }

  if (digits.length === 1) {
    return `${digits}00`;
  }

  if (digits.length >= 3) {
    return `${digits[0]}00`;
  }

  return digits;
};

const normalizeInstitutionText = (value = '', field = 'generic') => {
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
    return normalizeLevel(collapsed);
  }

  if (field === 'academicYear') {
    return normalizeAcademicYear(collapsed);
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

  return titleCaseInstitutionText(collapsed);
};

const normalizeInstitutionPayload = (payload = {}, fieldMap = {}) => Object.fromEntries(
  Object.entries(payload).map(([key, value]) => {
    if (!fieldMap[key]) {
      return [key, value];
    }
    const normalized = normalizeInstitutionText(value, fieldMap[key]);
    return [key, normalized || null];
  })
);

module.exports = {
  normalizeAcademicYear,
  normalizeLevel,
  normalizeInstitutionText,
  normalizeInstitutionPayload,
};
