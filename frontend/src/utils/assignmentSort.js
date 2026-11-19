/**
 * Due-date sorting for assignment lists.
 * Missing/invalid deadlines always sort after dated items.
 */

export function dueTimestamp(value) {
  if (value == null || value === "") return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * @param {Array<{ deadline?: string|Date|null }>} assignments
 * @param {"due-asc"|"due-desc"} direction
 */
export function sortAssignmentsByDueDate(assignments, direction = "due-asc") {
  const list = Array.isArray(assignments) ? [...assignments] : [];
  const descending = direction === "due-desc";
  return list.sort((a, b) => {
    const aDue = dueTimestamp(a?.deadline);
    const bDue = dueTimestamp(b?.deadline);
    if (aDue == null && bDue == null) return 0;
    if (aDue == null) return 1;
    if (bDue == null) return -1;
    return descending ? bDue - aDue : aDue - bDue;
  });
}
