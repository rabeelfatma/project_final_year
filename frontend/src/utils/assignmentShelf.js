/**
 * Teacher assignment Active / Archived shelf helpers.
 * Active shelf shows every non-archived row (active + legacy deactive).
 * Archived shelf shows status === "archived" only.
 */

export function filterAssignmentsByShelf(assignments, shelf) {
  const rows = Array.isArray(assignments) ? assignments : [];
  if (shelf === "archived") {
    return rows.filter((asgn) => asgn?.status === "archived");
  }
  return rows.filter((asgn) => asgn?.status !== "archived");
}

/** After a successful restore, always show the Active shelf so the row stays visible. */
export function shelfAfterRestore() {
  return "active";
}

/** After a successful archive, show the Archived shelf so the row stays visible. */
export function shelfAfterArchive() {
  return "archived";
}
