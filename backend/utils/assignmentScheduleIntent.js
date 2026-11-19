/**
 * Server-issued schedule intent for assignment create.
 *
 * Teacher validates start/deadline with the API BEFORE a slow durable upload.
 * The signed token locks teacher + start + deadline so a client cannot swap
 * dates after validation. Create still re-checks the strictly-future rule;
 * upload duration does not waive it.
 *
 * Token is HMAC-signed with JWT_SECRET; payload is verified on create.
 */

const jwt = require("jsonwebtoken");
const {
  validateAssignmentFields,
  calendarDateKeyInTimeZone,
  PROJECT_TIMEZONE,
} = require("./assignmentFieldValidation");

const INTENT_PURPOSE = "assignment_schedule_intent";
/** Covers large (up to 200MB) durable uploads without enlarging date skew. */
const INTENT_EXPIRES_IN = "45m";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error("Server signing secret is not configured.");
    err.statusCode = 500;
    err.code = "SCHEDULE_INTENT_SECRET_MISSING";
    throw err;
  }
  return secret;
}

/**
 * Validate schedule as of now and return a short-lived intent token.
 */
function issueScheduleIntent({
  teacherId,
  startDate,
  deadline,
  now = Date.now(),
}) {
  const validated = validateAssignmentFields(
    {
      title: "Schedule Intent",
      description: "Schedule intent placeholder",
      points: 1,
      startDate,
      deadline,
    },
    { mode: "create", now }
  );
  if (!validated.ok) {
    return { ok: false, ...validated };
  }

  const start = validated.values.startDate;
  const end = validated.values.deadline;
  const token = jwt.sign(
    {
      purpose: INTENT_PURPOSE,
      tid: String(teacherId),
      startMs: start.getTime(),
      deadlineMs: end.getTime(),
      pkDay: calendarDateKeyInTimeZone(start, PROJECT_TIMEZONE),
    },
    getSecret(),
    { expiresIn: INTENT_EXPIRES_IN }
  );

  return {
    ok: true,
    scheduleIntentToken: token,
    expiresIn: INTENT_EXPIRES_IN,
    startDate: start.toISOString(),
    deadline: end.toISOString(),
    projectTimezone: PROJECT_TIMEZONE,
  };
}

/**
 * Verify token matches the teacher and exact schedule on the create request.
 * @returns {{ ok: true, payload: object } | { ok: false, message: string, code: string }}
 */
function verifyScheduleIntent(token, { teacherId, startDate, deadline }) {
  if (!token || typeof token !== "string") {
    return {
      ok: false,
      message: "Save the schedule and try again.",
      code: "SCHEDULE_INTENT_REQUIRED",
    };
  }

  let payload;
  try {
    payload = jwt.verify(token, getSecret());
  } catch (error) {
    return {
      ok: false,
      message:
        error.name === "TokenExpiredError"
          ? "Schedule expired. Try again."
          : "Schedule could not be verified.",
      code: "SCHEDULE_INTENT_INVALID",
    };
  }

  if (payload.purpose !== INTENT_PURPOSE) {
    return {
      ok: false,
      message: "Schedule could not be verified.",
      code: "SCHEDULE_INTENT_INVALID",
    };
  }
  if (String(payload.tid) !== String(teacherId)) {
    return {
      ok: false,
      message: "Schedule could not be verified.",
      code: "SCHEDULE_INTENT_MISMATCH",
    };
  }

  const startMs = new Date(startDate).getTime();
  const deadlineMs = new Date(deadline).getTime();
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(deadlineMs) ||
    payload.startMs !== startMs ||
    payload.deadlineMs !== deadlineMs
  ) {
    return {
      ok: false,
      message:
        "Schedule changed. Try again.",
      code: "SCHEDULE_INTENT_MISMATCH",
    };
  }

  return { ok: true, payload };
}

module.exports = {
  INTENT_PURPOSE,
  INTENT_EXPIRES_IN,
  issueScheduleIntent,
  verifyScheduleIntent,
};
