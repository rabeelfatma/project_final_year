/**
 * Client-side assignment field validation (mirrors backend).
 * Backend remains authoritative.
 *
 * datetime-local values are Asia/Karachi wall times. ISO strings with Z or an
 * offset are already absolute instants and are not shifted again.
 * Decimals are allowed. A maximum applies only when VITE_MAX_ASSIGNMENT_POINTS is set.
 */

export const TITLE_MIN_LENGTH = 3;
export const TITLE_MAX_LENGTH = 100;
export const DESCRIPTION_MIN_LENGTH = 10;
export const DESCRIPTION_MAX_LENGTH = 2000;
export const ASSIGNMENT_MARKS_MIN = 1;
export const ASSIGNMENT_MARKS_MAX = 100;
export const PROJECT_TIMEZONE = 'Asia/Karachi';

/** Whole marks 1–100. VITE_MAX_ASSIGNMENT_POINTS cannot raise this ceiling. */
export function getMaxAssignmentPoints() {
  return ASSIGNMENT_MARKS_MAX;
}

export function normalizeAssignmentTitle(title) {
  return String(title ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitleForComparison(title) {
  return normalizeAssignmentTitle(title).toLowerCase();
}

function getTimeZoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - date.getTime();
}

export function zonedWallTimeToUtc(year, month, day, hour, minute, second = 0, timeZone = PROJECT_TIMEZONE) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  let utc = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  utc = utcGuess - getTimeZoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

export function parseScheduleInput(value, timeZone = PROJECT_TIMEZONE) {
  if (value == null || value === '') {
    return { instant: null, missing: true, missingTime: false, invalid: false };
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { instant: null, missing: false, missingTime: false, invalid: true }
      : { instant: value, missing: false, missingTime: false, invalid: false };
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const fromMs = new Date(value);
    return Number.isNaN(fromMs.getTime())
      ? { instant: null, missing: false, missingTime: false, invalid: true }
      : { instant: fromMs, missing: false, missingTime: false, invalid: false };
  }
  const s = String(value).trim();
  if (!s) return { instant: null, missing: true, missingTime: false, invalid: false };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { instant: null, missing: false, missingTime: true, invalid: false };
  }
  if (/[zZ]$/.test(s) || /[+-]\d{2}:\d{2}$/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime())
      ? { instant: null, missing: false, missingTime: false, invalid: true }
      : { instant: d, missing: false, missingTime: false, invalid: false };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!match) return { instant: null, missing: false, missingTime: false, invalid: true };
  const instant = zonedWallTimeToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] || 0),
    timeZone
  );
  return Number.isNaN(instant.getTime())
    ? { instant: null, missing: false, missingTime: false, invalid: true }
    : { instant, missing: false, missingTime: false, invalid: false };
}

function parseInstant(value) {
  return parseScheduleInput(value).instant;
}

function sameInstant(a, b, toleranceMs = 1000) {
  if (!a || !b) return false;
  return Math.abs(a.getTime() - b.getTime()) <= toleranceMs;
}

export function calendarDateKeyInTimeZone(instant, timeZone = PROJECT_TIMEZONE) {
  const d = instant instanceof Date ? instant : parseInstant(instant);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function pastDateTimeMessage(kind) {
  return kind === 'start'
    ? 'Start time must be in the future.'
    : 'Due time must be in the future.';
}

export function parseAssignmentPoints(raw) {
  if (typeof raw === 'number') {
    if (!Number.isInteger(raw) || raw < ASSIGNMENT_MARKS_MIN) {
      return { error: 'Marks must be 1-100.' };
    }
    if (raw > ASSIGNMENT_MARKS_MAX) {
      return { error: 'Marks must be 1-100.' };
    }
    return { value: raw };
  }
  const text = String(raw ?? '').trim();
  if (text === '') return { error: 'Marks are required.' };
  if (/^\d+$/.test(text)) {
    const points = Number(text);
    if (points > ASSIGNMENT_MARKS_MAX || !/^(?:[1-9]\d?|100)$/.test(text)) {
      return { error: 'Marks must be 1-100.' };
    }
    return { value: points };
  }
  return { error: 'Marks must be 1-100.' };
}

function titleValidationError(normalized) {
  if (!normalized) return 'Assignment title is required.';
  if (normalized.length < TITLE_MIN_LENGTH) return 'Title is too short.';
  if (normalized.length > TITLE_MAX_LENGTH) return 'Title is too long.';
  if (/\p{Extended_Pictographic}/u.test(normalized)) return 'Enter a valid title.';
  if (!/[\p{L}\p{N}]/u.test(normalized)) return 'Enter a valid title.';
  return '';
}

/**
 * @param {object} input
 * @param {{ mode?: 'create'|'update', existing?: object, now?: number|Date, maxPoints?: number|null }} [options]
 */
export function validateAssignmentFormFields(input = {}, options = {}) {
  const mode = options.mode === 'update' ? 'update' : 'create';
  const existing = options.existing || {};
  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : Number.isFinite(Number(options.now))
        ? Number(options.now)
        : Date.now();
  const maxPoints = ASSIGNMENT_MARKS_MAX;
  const errors = {};

  const title = normalizeAssignmentTitle(input.title);
  const titleError = titleValidationError(title);
  if (titleError) errors.title = titleError;

  const description = String(input.description ?? '').trim();
  if (!description) {
    errors.description = 'Description is required.';
  } else if (description.length < DESCRIPTION_MIN_LENGTH) {
    errors.description = 'Description is too short.';
  } else if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = 'Description is too long.';
  }

  const parsedPoints = parseAssignmentPoints(input.points);
  if (parsedPoints.error) errors.points = parsedPoints.error;

  const startParsed = parseScheduleInput(input.startDate);
  let start = null;
  if (startParsed.missing) {
    errors.startDate = 'Select a start date.';
  } else if (startParsed.missingTime) {
    errors.startDate = 'Select a start time.';
  } else if (startParsed.invalid || !startParsed.instant) {
    errors.startDate = 'Select a valid start time.';
  } else {
    start = startParsed.instant;
    const existingStart = parseInstant(existing.startDate);
    const startUnchanged = mode === 'update' && sameInstant(start, existingStart);
    if (!startUnchanged && start.getTime() <= nowMs) {
      errors.startDate = pastDateTimeMessage('start');
    }
  }

  const endParsed = parseScheduleInput(input.deadline);
  let end = null;
  if (endParsed.missing) {
    errors.deadline = 'Select a due date.';
  } else if (endParsed.missingTime) {
    errors.deadline = 'Select a due time.';
  } else if (endParsed.invalid || !endParsed.instant) {
    errors.deadline = 'Select a valid due time.';
  } else {
    end = endParsed.instant;
    const existingEnd = parseInstant(existing.deadline);
    const deadlineUnchanged = mode === 'update' && sameInstant(end, existingEnd);
    if (!deadlineUnchanged && end.getTime() <= nowMs) {
      errors.deadline = pastDateTimeMessage('due');
    } else if (start && end.getTime() <= start.getTime()) {
      errors.deadline = 'Due time must be after start time.';
    }
  }

  if (!errors.startDate && !errors.deadline && start && end && end.getTime() <= start.getTime()) {
    errors.deadline = 'Due time must be after start time.';
  }

  if (Object.keys(errors).length) {
    return {
      ok: false,
      message: Object.values(errors)[0],
      errors,
      maxPoints,
    };
  }

  return {
    ok: true,
    values: {
      title,
      description,
      points: parsedPoints.value,
      startDate: start,
      deadline: end,
    },
    maxPoints,
  };
}

/** Convert a datetime-local value as Asia/Karachi wall time to a UTC ISO string. */
export function datetimeLocalToIso(value) {
  const parsed = parseScheduleInput(value);
  if (!parsed.instant) return '';
  return parsed.instant.toISOString();
}

export function utcIsoToKarachiDatetimeLocal(value) {
  const parsed = parseScheduleInput(value);
  const d = parsed.instant;
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PROJECT_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }
  let hour = map.hour;
  if (hour === '24') hour = '00';
  return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}`;
}

export function toDatetimeLocalValue(date = new Date()) {
  return utcIsoToKarachiDatetimeLocal(date instanceof Date ? date : new Date(date));
}

/** Suggest a future Asia/Karachi wall time for the datetime-local control. */
export function suggestStartDatetimeLocal(fromMs = Date.now(), offsetMs = 5 * 60 * 1000) {
  return toDatetimeLocalValue(new Date(Number(fromMs) + Number(offsetMs)));
}

/**
 * Same-day future start: created. A later Karachi calendar day: scheduled.
 * Every accepted start is still strictly after now.
 */
export function assignmentCreatedMessage(startDate, now = Date.now()) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  const startDay = calendarDateKeyInTimeZone(start);
  const today = calendarDateKeyInTimeZone(now);
  if (startDay && today && startDay > today) {
    const date = new Intl.DateTimeFormat('en-GB', {
      timeZone: PROJECT_TIMEZONE,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(start);
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: PROJECT_TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(start);
    return `Assignment scheduled successfully.\nStudents can access it from ${date} at ${time}.`;
  }
  return 'Assignment created successfully.';
}
