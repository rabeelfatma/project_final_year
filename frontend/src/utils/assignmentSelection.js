/**
 * Normalize Mongo-style ids so checkbox selection compares reliably
 * across string / object id shapes from API payloads.
 */
export function normalizeAssignmentId(id) {
  if (id == null) return "";
  if (typeof id === "object") {
    if (typeof id.toString === "function") {
      const asString = id.toString();
      if (asString && asString !== "[object Object]") return asString;
    }
    if (id.$oid) return String(id.$oid);
    if (id._id) return normalizeAssignmentId(id._id);
  }
  return String(id);
}

export function toggleAssignmentSelection(selectedIds, id) {
  const target = normalizeAssignmentId(id);
  if (!target) return Array.isArray(selectedIds) ? [...selectedIds] : [];
  const current = (Array.isArray(selectedIds) ? selectedIds : []).map(
    normalizeAssignmentId
  );
  return current.includes(target)
    ? current.filter((value) => value !== target)
    : [...current, target];
}

export function isAssignmentSelected(selectedIds, id) {
  const target = normalizeAssignmentId(id);
  if (!target) return false;
  return (Array.isArray(selectedIds) ? selectedIds : [])
    .map(normalizeAssignmentId)
    .includes(target);
}
