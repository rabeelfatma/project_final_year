/**
 * Pure helpers for Teacher Plagiarism assignment selection, filters, and modes.
 * Isolated for unit tests — no network / DOM.
 */

export const PLAGIARISM_MODES = Object.freeze({
  EXTERNAL_SOURCES: "external_sources",
  STUDENT_PAPER_REPOSITORY: "student_paper_repository",
});

export const ASSIGNMENT_CHECK_STATUS = Object.freeze({
  NOT_CHECKED: "not_checked",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
  PROVIDER_NOT_CONNECTED: "provider_not_connected",
});

export function filterSubmissionsForAssignment(submissions, assignmentId) {
  const target = String(assignmentId || "").trim();
  if (!target) return [];
  const rows = Array.isArray(submissions) ? submissions : [];
  return rows.filter(
    (sub) => String(sub?.assignment?._id || sub?.assignment || "") === target
  );
}

export function toggleSubmissionSelection(selectedIds, submissionId) {
  const id = String(submissionId || "");
  const current = Array.isArray(selectedIds) ? selectedIds.map(String) : [];
  if (!id) return current;
  return current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id];
}

export function selectAllSubmissionIds(submissions) {
  return (Array.isArray(submissions) ? submissions : [])
    .map((sub) => sub?._id)
    .filter(Boolean)
    .map(String);
}

export function clearSelectionOnAssignmentChange(nextAssignmentId) {
  return {
    assignmentId: String(nextAssignmentId || ""),
    selectedIds: [],
  };
}

export function fileTypeFromSubmission(sub) {
  const mime = String(sub?.fileMimeType || "").trim();
  if (mime) {
    const subtype = mime.split("/").pop();
    if (subtype) return subtype.toUpperCase();
  }
  const name = String(sub?.originalFileName || "");
  const dot = name.lastIndexOf(".");
  if (dot >= 0 && dot < name.length - 1) {
    return name.slice(dot + 1).toUpperCase();
  }
  return "FILE";
}

export function describeNetworkOrApiError(err, fallback = "Request failed.") {
  if (!err) return fallback;
  if (!err.response) {
    const msg = String(err.message || "");
    if (/network error/i.test(msg) || err.code === "ERR_NETWORK") {
      return "Network Error: the API server is unreachable. Start the local backend with APP_RUNTIME_MODE=full (npm run dev in backend) or check VITE_API_BASE_URL.";
    }
    return msg || fallback;
  }
  return err.response?.data?.message || err.message || fallback;
}

export function normalizePlagiarismAssignmentId(value) {
  if (value == null) return "";
  if (typeof value === "object" && value._id != null) return String(value._id);
  return String(value || "").trim();
}

export function toggleIdSelection(selectedIds, id) {
  return toggleSubmissionSelection(selectedIds, id);
}

export function selectAllAssignmentIds(assignments) {
  return (Array.isArray(assignments) ? assignments : [])
    .map((row) => normalizePlagiarismAssignmentId(row?._id))
    .filter(Boolean);
}

export function isIdSelected(selectedIds, id) {
  const target = normalizePlagiarismAssignmentId(id);
  if (!target) return false;
  return (Array.isArray(selectedIds) ? selectedIds : [])
    .map(String)
    .includes(target);
}

/**
 * Derive assignment-level plagiarism status from real SimilarityCheck rows only.
 * Never invents completed. In-progress wins if any queued/processing exist.
 */
export function deriveAssignmentPlagiarismStatus(assignmentId, checks) {
  const target = normalizePlagiarismAssignmentId(assignmentId);
  if (!target) return ASSIGNMENT_CHECK_STATUS.NOT_CHECKED;
  const rows = (Array.isArray(checks) ? checks : [])
    .filter(
      (row) =>
        normalizePlagiarismAssignmentId(row?.assignment) === target ||
        normalizePlagiarismAssignmentId(row?.assignmentId) === target
    )
    .slice()
    .sort((a, b) => {
      const aMs = new Date(a?.requestedAt || a?.createdAt || 0).getTime();
      const bMs = new Date(b?.requestedAt || b?.createdAt || 0).getTime();
      return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
    });

  if (!rows.length) return ASSIGNMENT_CHECK_STATUS.NOT_CHECKED;

  const hasInProgress = rows.some(
    (row) => row?.status === "queued" || row?.status === "processing"
  );
  if (hasInProgress) return ASSIGNMENT_CHECK_STATUS.IN_PROGRESS;

  const latest = rows[0]?.status;
  if (latest === "completed") return ASSIGNMENT_CHECK_STATUS.COMPLETED;
  if (latest === "failed") return ASSIGNMENT_CHECK_STATUS.FAILED;
  if (latest === "provider_not_connected") {
    return ASSIGNMENT_CHECK_STATUS.PROVIDER_NOT_CONNECTED;
  }
  if (latest === "queued" || latest === "processing") {
    return ASSIGNMENT_CHECK_STATUS.IN_PROGRESS;
  }
  return ASSIGNMENT_CHECK_STATUS.NOT_CHECKED;
}

export function assignmentPlagiarismStatusLabel(status) {
  switch (status) {
    case ASSIGNMENT_CHECK_STATUS.NOT_CHECKED:
      return "Not Checked";
    case ASSIGNMENT_CHECK_STATUS.IN_PROGRESS:
      return "In Progress";
    case ASSIGNMENT_CHECK_STATUS.COMPLETED:
      return "Completed";
    case ASSIGNMENT_CHECK_STATUS.FAILED:
      return "Failed";
    case ASSIGNMENT_CHECK_STATUS.PROVIDER_NOT_CONNECTED:
      return "Provider Not Connected";
    default:
      return "Not Checked";
  }
}

export function filterPlagiarismAssignments({
  assignments,
  search = "",
  assignmentFilter = "all",
  statusFilter = "all",
  checks = [],
} = {}) {
  const rows = Array.isArray(assignments) ? assignments : [];
  const q = String(search || "").trim().toLowerCase();
  const filterId = String(assignmentFilter || "all");
  const status = String(statusFilter || "all");

  return rows.filter((asgn) => {
    const id = normalizePlagiarismAssignmentId(asgn?._id);
    if (!id) return false;
    if (filterId !== "all" && id !== filterId) return false;
    if (q) {
      const title = String(asgn?.title || "").toLowerCase();
      if (!title.includes(q)) return false;
    }
    if (status !== "all") {
      const derived = deriveAssignmentPlagiarismStatus(id, checks);
      if (derived !== status) return false;
    }
    return true;
  });
}

export function toggleComparisonMode(modes, modeKey) {
  const key = String(modeKey || "");
  const current = modes && typeof modes === "object" ? { ...modes } : {};
  if (
    key !== PLAGIARISM_MODES.EXTERNAL_SOURCES &&
    key !== PLAGIARISM_MODES.STUDENT_PAPER_REPOSITORY
  ) {
    return current;
  }
  return { ...current, [key]: !Boolean(current[key]) };
}

export function selectedComparisonModes(modes) {
  const current = modes && typeof modes === "object" ? modes : {};
  return [
    PLAGIARISM_MODES.EXTERNAL_SOURCES,
    PLAGIARISM_MODES.STUDENT_PAPER_REPOSITORY,
  ].filter((key) => Boolean(current[key]));
}

export function canRunPlagiarismCheck({ assignmentIds, modes } = {}) {
  const ids = Array.isArray(assignmentIds)
    ? assignmentIds.map(String).filter(Boolean)
    : [];
  return ids.length > 0 && selectedComparisonModes(modes).length > 0;
}

/**
 * User-facing gate copy when Check Plagiarism is clicked without prerequisites.
 * Returns null when the check can proceed.
 */
export function describePlagiarismCheckRequirements({ assignmentIds, modes } = {}) {
  const hasAssignments = Array.isArray(assignmentIds)
    ? assignmentIds.map(String).filter(Boolean).length > 0
    : false;
  const hasModes = selectedComparisonModes(modes).length > 0;
  if (hasAssignments && hasModes) return null;
  if (!hasAssignments && !hasModes) {
    return "Please select at least one assignment and at least one comparison mode.";
  }
  if (!hasAssignments) return "Please select at least one assignment.";
  return "Please select at least one comparison mode.";
}
