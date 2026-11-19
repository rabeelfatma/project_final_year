/**
 * Pure helpers for Teacher Plagiarism assignment/submission selection.
 * Isolated for unit tests — no network / DOM.
 */

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
