/**
 * Canonical Student assignment ACTIVE / INACTIVE badge + summary count.
 * Based on published visibility + schedule window — NOT submission/evaluation status.
 *
 * Active when:
 * - Assignment is already visible to the student (start reached; notOpenYet !== true)
 * - Due date has not passed
 * - Not closed / unavailable by availabilityLabel
 *
 * Submitted / Awaiting Evaluation assignments remain Active until the due instant.
 */

export function studentActivityState(asgn, nowMs = Date.now()) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const startMs = asgn?.startDate ? new Date(asgn.startDate).getTime() : null;
  const dueMs = asgn?.deadline ? new Date(asgn.deadline).getTime() : null;

  if (asgn?.notOpenYet || (Number.isFinite(startMs) && now < startMs)) {
    return { label: "INACTIVE", tone: "inactive", showDot: true, active: false };
  }
  if (Number.isFinite(dueMs) && now >= dueMs) {
    return { label: "INACTIVE", tone: "inactive", showDot: true, active: false };
  }
  if (/^closed$/i.test(String(asgn?.availabilityLabel || "").trim())) {
    return { label: "INACTIVE", tone: "inactive", showDot: true, active: false };
  }
  return { label: "ACTIVE", tone: "active", showDot: true, active: true };
}

export function isStudentAssignmentActive(asgn, nowMs = Date.now()) {
  return studentActivityState(asgn, nowMs).active === true;
}

export function countActiveStudentAssignments(assignments, nowMs = Date.now()) {
  if (!Array.isArray(assignments)) return 0;
  return assignments.filter((item) => isStudentAssignmentActive(item, nowMs)).length;
}
