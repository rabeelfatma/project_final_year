/**
 * Application-level active-assignment duplicate detection.
 *
 * Matching key (all must match):
 * - teacher
 * - normalized subject (trim + lowercase for compare only)
 * - normalizeTitleForComparison(title) — existing Phase 1 helper, unchanged
 * - status === "active" only (archived / deactive do not block)
 *
 * startDate and deadline are intentionally ignored for title uniqueness.
 *
 * CONCURRENCY LIMITATION: find-then-create is not race-safe. Two parallel
 * requests can both pass this check. A unique index is out of scope here.
 */

const {
  normalizeTitleForComparison,
} = require("./assignmentFieldValidation");

const ASSIGNMENT_DUPLICATE_CODE = "ASSIGNMENT_DUPLICATE";
const ASSIGNMENT_DUPLICATE_MESSAGE =
  "Assignment already exists.";

/**
 * Normalize subject for comparison only — does not change stored values.
 */
function normalizeSubjectForComparison(subject) {
  return String(subject ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isMongoDuplicateKeyError(error) {
  return Boolean(error && Number(error.code) === 11000);
}

function duplicateConflictPayload(extra = {}) {
  return {
    message: ASSIGNMENT_DUPLICATE_MESSAGE,
    code: ASSIGNMENT_DUPLICATE_CODE,
    errors: {
      title: ASSIGNMENT_DUPLICATE_MESSAGE,
    },
    ...extra,
  };
}

/**
 * Find an active assignment that collides on teacher + subject + title.
 * @param {object} opts
 * @param {import("mongoose").Model} opts.AssignmentModel
 * @param {string|object} opts.teacherId
 * @param {string} opts.subject resolved subject that will be / is stored
 * @param {string} opts.title display title (normalized for compare)
 * @param {string|object} [opts.excludeId] assignment id to ignore (update self)
 * @returns {Promise<object|null>}
 */
async function findActiveDuplicateAssignment({
  AssignmentModel,
  teacherId,
  subject,
  title,
  excludeId = null,
}) {
  if (!teacherId) return null;

  const titleKey = normalizeTitleForComparison(title);
  const subjectKey = normalizeSubjectForComparison(subject);
  if (!titleKey) return null;

  const query = {
    teacher: teacherId,
    status: "active",
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const candidates = await AssignmentModel.find(query)
    .select("_id title subject status teacher")
    .lean();

  const rows = Array.isArray(candidates) ? candidates : [];
  return (
    rows.find(
      (row) =>
        normalizeTitleForComparison(row.title) === titleKey &&
        normalizeSubjectForComparison(row.subject) === subjectKey
    ) || null
  );
}

/** Rule 2 — unarchive blocked when another Active row shares the normalized title. */
const UNARCHIVE_TITLE_CONFLICT_CODE = "UNARCHIVE_TITLE_CONFLICT";
const UNARCHIVE_TITLE_CONFLICT_MESSAGE =
  "An active assignment with this title already exists. Please rename the active assignment or change its title before restoring this assignment.";

function unarchiveTitleConflictPayload(extra = {}) {
  return {
    message: UNARCHIVE_TITLE_CONFLICT_MESSAGE,
    code: UNARCHIVE_TITLE_CONFLICT_CODE,
    errors: {
      title: UNARCHIVE_TITLE_CONFLICT_MESSAGE,
    },
    ...extra,
  };
}

/**
 * Find another Active assignment for the same teacher with the same normalized title.
 * Subject is intentionally ignored for Rule 2 unarchive checks.
 */
async function findActiveDuplicateTitleForUnarchive({
  AssignmentModel,
  teacherId,
  title,
  excludeId = null,
}) {
  if (!teacherId) return null;

  const titleKey = normalizeTitleForComparison(title);
  if (!titleKey) return null;

  const query = {
    teacher: teacherId,
    status: "active",
  };
  if (excludeId) {
    query._id = { $ne: excludeId };
  }

  const candidates = await AssignmentModel.find(query)
    .select("_id title status teacher")
    .lean();

  const rows = Array.isArray(candidates) ? candidates : [];
  return (
    rows.find((row) => normalizeTitleForComparison(row.title) === titleKey) ||
    null
  );
}

module.exports = {
  ASSIGNMENT_DUPLICATE_CODE,
  ASSIGNMENT_DUPLICATE_MESSAGE,
  UNARCHIVE_TITLE_CONFLICT_CODE,
  UNARCHIVE_TITLE_CONFLICT_MESSAGE,
  normalizeSubjectForComparison,
  isMongoDuplicateKeyError,
  duplicateConflictPayload,
  unarchiveTitleConflictPayload,
  findActiveDuplicateAssignment,
  findActiveDuplicateTitleForUnarchive,
};
