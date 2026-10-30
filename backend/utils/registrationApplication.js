/**
 * Public registration reapplication helpers (QC-23).
 * Keeps applicant-visible fields separate from Admin-only review data.
 * Never includes password or password hashes.
 */

const MAX_REJECTION_REASON_LENGTH = 500;

function sanitizeRejectionReason(reason) {
  if (reason == null) return null;
  if (typeof reason !== "string") return null;
  const trimmed = reason.trim().slice(0, MAX_REJECTION_REASON_LENGTH);
  return trimmed.length ? trimmed : null;
}

function currentAttempt(user) {
  const n = Number(user?.applicationAttempt);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

function submittedAtFor(user) {
  return user?.lastSubmittedAt || user?.createdAt || null;
}

function buildHistoryEntry({
  attempt,
  submittedAt,
  decision,
  rejectionReason = null,
  decidedBy = null,
  decidedAt = null,
  name = null,
  email = null,
  role = null,
  previousName = null,
  previousEmail = null,
  previousRole = null,
}) {
  return {
    attempt: attempt || 1,
    submittedAt: submittedAt || null,
    decidedAt: decidedAt || new Date(),
    decision,
    rejectionReason: rejectionReason || null,
    decidedBy: decidedBy || null,
    name: name || null,
    email: email || null,
    role: role || null,
    previousName: previousName || null,
    previousEmail: previousEmail || null,
    previousRole: previousRole || null,
  };
}

/** Safe payload for a rejected applicant considering reapplication. */
function toPublicReapplicationInfo(user) {
  if (!user) return null;
  return {
    email: user.email,
    role: user.role,
    name: user.name || "",
    rejectionReason: user.rejectionReason || null,
    applicationAttempt: currentAttempt(user),
  };
}

function mapHistoryEntry(h) {
  return {
    attempt: h.attempt || null,
    submittedAt: h.submittedAt || null,
    decidedAt: h.decidedAt || null,
    decision: h.decision || null,
    rejectionReason: h.rejectionReason || null,
    name: h.name || null,
    email: h.email || null,
    role: h.role || null,
    previousName: h.previousName || null,
    previousEmail: h.previousEmail || null,
    previousRole: h.previousRole || null,
  };
}

/** Admin list/detail projection — never includes password or internal secrets. */
function toAdminRegistrationRequest(user) {
  const attempt = currentAttempt(user);
  const history = Array.isArray(user.applicationHistory)
    ? user.applicationHistory.map(mapHistoryEntry)
    : [];

  const priorRejections = history.filter((h) => h.decision === "rejected");
  const previousRejectionReason =
    user.rejectionReason ||
    (priorRejections.length
      ? priorRejections[priorRejections.length - 1].rejectionReason
      : null);

  const displayEmail = user.pendingEmail || user.email;

  return {
    id: String(user._id),
    name: user.name,
    email: displayEmail,
    currentEmail: user.email,
    pendingEmail: user.pendingEmail || null,
    role: user.role,
    approvalStatus: user.approvalStatus || "approved",
    emailVerified: user.emailVerified === true,
    emailVerifiedAt: user.emailVerifiedAt || null,
    createdAt: user.createdAt,
    approvedAt: user.approvedAt || null,
    rejectedAt: user.rejectedAt || null,
    rejectionReason: user.rejectionReason || null,
    previousRejectionReason,
    reapplicationDisabled: user.reapplicationDisabled === true,
    applicationAttempt: attempt,
    lastSubmittedAt: user.lastSubmittedAt || null,
    reapplied: attempt > 1,
    previousName: user.previousName || null,
    previousEmail: user.previousEmail || null,
    previousRole: user.previousRole || null,
    applicationHistory: history,
  };
}

module.exports = {
  MAX_REJECTION_REASON_LENGTH,
  sanitizeRejectionReason,
  currentAttempt,
  submittedAtFor,
  buildHistoryEntry,
  toPublicReapplicationInfo,
  toAdminRegistrationRequest,
};
