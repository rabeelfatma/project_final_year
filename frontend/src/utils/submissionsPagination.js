/**
 * Pure helpers for Teacher Submissions client-side pagination.
 */

export function submissionsTotalPages(totalCount, pageSize) {
  const size = Math.max(1, Number(pageSize) || 1);
  const total = Math.max(0, Number(totalCount) || 0);
  return Math.max(1, Math.ceil(total / size));
}

export function clampSubmissionPage(page, totalPages) {
  const pages = Math.max(1, Number(totalPages) || 1);
  const raw = Number(page);
  if (!Number.isFinite(raw)) return 1;
  return Math.min(Math.max(1, Math.trunc(raw)), pages);
}

/** Functional-update safe: clamps first, then steps back one page. */
export function goToPreviousSubmissionPage(page, totalPages) {
  const current = clampSubmissionPage(page, totalPages);
  return Math.max(1, current - 1);
}

/** Functional-update safe: clamps first, then steps forward one page. */
export function goToNextSubmissionPage(page, totalPages) {
  const pages = Math.max(1, Number(totalPages) || 1);
  const current = clampSubmissionPage(page, pages);
  return Math.min(pages, current + 1);
}

export function submissionPageMeta(page, pageSize, totalCount) {
  const total = Math.max(0, Number(totalCount) || 0);
  const size = Math.max(1, Number(pageSize) || 1);
  const totalPages = submissionsTotalPages(total, size);
  const current = clampSubmissionPage(page, totalPages);
  if (total === 0) {
    return { page: 1, totalPages: 1, from: 0, to: 0, total: 0 };
  }
  return {
    page: current,
    totalPages,
    from: (current - 1) * size + 1,
    to: Math.min(current * size, total),
    total,
  };
}
