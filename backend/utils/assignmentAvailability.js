/**
 * Student visibility and submission window.
 * Derived from stored instants and server time. No scheduler.
 *
 * Before start: hidden and inaccessible.
 * At start: visible. Submission stays open until the due instant.
 * At and after the due instant: submission is closed. The assignment stays visible.
 */

function instantMs(value) {
  if (value == null || value === "") return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function evaluateAssignmentWindow(startDate, deadline, nowMs = Date.now()) {
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const opensAt = instantMs(startDate);
  const dueAt = instantMs(deadline);
  const notOpenYet = opensAt != null && now < opensAt;
  const deadlineReached = dueAt != null && now >= dueAt;
  return {
    opensAt,
    dueAt,
    notOpenYet,
    deadlineReached,
    visibleToStudent: !notOpenYet,
    canAccessMaterials: !notOpenYet,
    canSubmit: !notOpenYet && !deadlineReached,
  };
}

module.exports = {
  evaluateAssignmentWindow,
};
