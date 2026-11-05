/**
 * Shared assignment field validation for Teacher create + update.
 *
 * Timezone / datetime contract:
 * - User-entered datetime-local values (no Z/offset) are Asia/Karachi wall times.
 * - Values that already include Z or a numeric offset are UTC instants and are
 *   NOT shifted again.
 * - Mongo stores UTC instants. Calendar comparisons use Asia/Karachi.
 * - Create and update re-check strictly-future datetimes. A schedule-intent
 *   token does not waive that check.
 */

const TITLE_MIN_LENGTH = 3;
const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MIN_LENGTH = 10;
const DESCRIPTION_MAX_LENGTH = 2000;
/** Checklist ceiling. Env MAX_ASSIGNMENT_POINTS cannot raise this. */
const ASSIGNMENT_MARKS_MIN = 1;
const ASSIGNMENT_MARKS_MAX = 100;

/** Project calendar timezone for assignment wall times. */
const PROJECT_TIMEZONE = "Asia/Karachi";

/**
 * Total marks are whole numbers from 1 to 100.
 * If MAX_ASSIGNMENT_POINTS is set to anything else, it does not raise or
 * lower this ceiling. marksConfigurationNote() reports that conflict.
 */
function getMaxAssignmentPoints() {
  return ASSIGNMENT_MARKS_MAX;
}

function marksConfigurationNote() {
  const raw = process.env.MAX_ASSIGNMENT_POINTS;
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).trim());
  if (n === ASSIGNMENT_MARKS_MAX) return null;
  return "MAX_ASSIGNMENT_POINTS differs from the required 1–100 range and is not applied.";
}

function normalizeAssignmentTitle(title) {
  return String(title ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitleForComparison(title) {
  return normalizeAssignmentTitle(title).toLowerCase();
}

function getTimeZoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map = {};
  for (const part of dtf.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
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

/** Interpret a wall-clock time in an IANA zone as a UTC instant. */
function zonedWallTimeToUtc(year, month, day, hour, minute, second, timeZone) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second || 0);
  let utc = utcGuess - getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  utc = utcGuess - getTimeZoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/**
 * @returns {{ instant: Date|null, missing: boolean, missingTime: boolean, invalid: boolean }}
 */
function parseScheduleInput(value, timeZone = PROJECT_TIMEZONE) {
  if (value == null || value === "") {
    return { instant: null, missing: true, missingTime: false, invalid: false };
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { instant: null, missing: false, missingTime: false, invalid: true }
      : { instant: value, missing: false, missingTime: false, invalid: false };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromMs = new Date(value);
    return Number.isNaN(fromMs.getTime())
      ? { instant: null, missing: false, missingTime: false, invalid: true }
      : { instant: fromMs, missing: false, missingTime: false, invalid: false };
  }
  const s = String(value).trim();
  if (!s) {
    return { instant: null, missing: true, missingTime: false, invalid: false };
  }
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
  if (!match) {
    return { instant: null, missing: false, missingTime: false, invalid: true };
  }
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

function fieldPresent(body, key) {
  return Object.prototype.hasOwnProperty.call(body || {}, key) && body[key] !== undefined;
}

/**
 * Calendar date key (YYYY-MM-DD) in a named IANA timezone.
 * Uses Intl — does not compare UTC date strings to Pakistan days.
 */
function calendarDateKeyInTimeZone(instant, timeZone = PROJECT_TIMEZONE) {
  const d = instant instanceof Date ? instant : parseInstant(instant);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
}

function pastDateTimeMessage(kind) {
  return kind === "start"
    ? "Start time must be in the future."
    : "Due time must be in the future.";
}

/**
 * Whole marks from 1 to 100. Empty / whitespace is not coerced to zero.
 * Decimals, scientific notation, and values above 100 are rejected.
 */
function parseAssignmentPoints(raw) {
  if (typeof raw === "number") {
    if (!Number.isInteger(raw)) {
      return { error: "Marks must be 1-100." };
    }
    if (raw < ASSIGNMENT_MARKS_MIN) {
      return { error: "Marks must be 1-100." };
    }
    if (raw > ASSIGNMENT_MARKS_MAX) {
      return { error: "Marks must be 1-100." };
    }
    return { value: raw };
  }
  const text = String(raw ?? "").trim();
  if (text === "") {
    return { error: "Marks are required." };
  }
  if (/^\d+$/.test(text)) {
    const points = Number(text);
    if (points > ASSIGNMENT_MARKS_MAX) {
      return { error: "Marks must be 1-100." };
    }
    if (!/^(?:[1-9]\d?|100)$/.test(text)) {
      return { error: "Marks must be 1-100." };
    }
    return { value: points };
  }
  return { error: "Marks must be 1-100." };
}

function titleValidationError(normalized) {
  if (!normalized) return "Assignment title is required.";
  if (normalized.length < TITLE_MIN_LENGTH) return "Title is too short.";
  if (normalized.length > TITLE_MAX_LENGTH) return "Title is too long.";
  if (/\p{Extended_Pictographic}/u.test(normalized)) return "Enter a valid title.";
  if (!/[\p{L}\p{N}]/u.test(normalized)) return "Enter a valid title.";
  return "";
}

/**
 * @param {object} input raw body fields
 * @param {{
 *   mode?: "create"|"update",
 *   existing?: object,
 *   now?: number|Date,
 *   maxPoints?: number|null
 * }} [options]
 * scheduleIntentVerified is ignored. Create always revalidates future times.
 */
function validateAssignmentFields(input = {}, options = {}) {
  const mode = options.mode === "update" ? "update" : "create";
  const existing = options.existing || {};
  const nowMs =
    options.now instanceof Date
      ? options.now.getTime()
      : Number.isFinite(Number(options.now))
        ? Number(options.now)
        : Date.now();
  const maxPoints = ASSIGNMENT_MARKS_MAX;
  const errors = {};
  const values = {};

  const requireAll = mode === "create";
  const checkTitle = requireAll || fieldPresent(input, "title");
  const checkDescription = requireAll || fieldPresent(input, "description");
  const checkPoints = requireAll || fieldPresent(input, "points");
  const checkStart = requireAll || fieldPresent(input, "startDate");
  const checkDeadline = requireAll || fieldPresent(input, "deadline");

  if (checkTitle) {
    const normalized = normalizeAssignmentTitle(input.title);
    const titleError = titleValidationError(normalized);
    if (titleError) errors.title = titleError;
    else values.title = normalized;
  }

  if (checkDescription) {
    const description = String(input.description ?? "").trim();
    if (!description) {
      errors.description = "Description is required.";
    } else if (description.length < DESCRIPTION_MIN_LENGTH) {
      errors.description = "Description is too short.";
    } else if (description.length > DESCRIPTION_MAX_LENGTH) {
      errors.description = "Description is too long.";
    } else {
      values.description = description;
    }
  }

  if (checkPoints) {
    const parsed = parseAssignmentPoints(input.points);
    if (parsed.error) errors.points = parsed.error;
    else values.points = parsed.value;
  }

  let start = null;
  let end = null;

  if (checkStart) {
    const parsed = parseScheduleInput(input.startDate);
    if (parsed.missing) {
      errors.startDate = "Select a start date.";
    } else if (parsed.missingTime) {
      errors.startDate = "Select a start time.";
    } else if (parsed.invalid || !parsed.instant) {
      errors.startDate = "Select a valid start time.";
    } else {
      start = parsed.instant;
      const existingStart = parseInstant(existing.startDate);
      const startUnchanged = mode === "update" && sameInstant(start, existingStart);
      if (startUnchanged) {
        values.startDate = start;
      } else if (start.getTime() <= nowMs) {
        errors.startDate = pastDateTimeMessage("start");
      } else {
        values.startDate = start;
      }
    }
  }

  if (checkDeadline) {
    const parsed = parseScheduleInput(input.deadline);
    if (parsed.missing) {
      errors.deadline = "Select a due date.";
    } else if (parsed.missingTime) {
      errors.deadline = "Select a due time.";
    } else if (parsed.invalid || !parsed.instant) {
      errors.deadline = "Select a valid due time.";
    } else {
      end = parsed.instant;
      const existingEnd = parseInstant(existing.deadline);
      const deadlineUnchanged = mode === "update" && sameInstant(end, existingEnd);
      if (deadlineUnchanged) {
        values.deadline = end;
      } else if (end.getTime() <= nowMs) {
        errors.deadline = pastDateTimeMessage("due");
      } else {
        values.deadline = end;
      }
    }
  }

  if (!errors.startDate && !errors.deadline && (checkStart || checkDeadline)) {
    const effectiveStart = values.startDate || parseInstant(existing.startDate) || null;
    const effectiveEnd = values.deadline || parseInstant(existing.deadline) || null;
    if (effectiveStart && effectiveEnd && effectiveEnd.getTime() <= effectiveStart.getTime()) {
        errors.deadline = "Due time must be after start time.";
    }
  }

  if (Object.keys(errors).length) {
    const first = Object.values(errors)[0];
    return {
      ok: false,
      code: "ASSIGNMENT_VALIDATION",
      message: first || "Assignment validation failed.",
      errors,
      maxPoints,
    };
  }

  return { ok: true, values, maxPoints };
}

module.exports = {
  TITLE_MIN_LENGTH,
  TITLE_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  DESCRIPTION_MAX_LENGTH,
  ASSIGNMENT_MARKS_MIN,
  ASSIGNMENT_MARKS_MAX,
  PROJECT_TIMEZONE,
  getMaxAssignmentPoints,
  marksConfigurationNote,
  titleValidationError,
  normalizeAssignmentTitle,
  normalizeTitleForComparison,
  calendarDateKeyInTimeZone,
  parseScheduleInput,
  parseAssignmentPoints,
  zonedWallTimeToUtc,
  validateAssignmentFields,
};
