/**
 * Independent AI / Teacher publication visibility helpers.
 *
 * Granular flags (aiPublished / teacherMarksPublished / teacherFeedbackPublished)
 * are authoritative when present.
 *
 * Legacy rows: status === PUBLISHED with all flags false/undefined.
 * For those, AI is shown from aiScore, but Teacher Marks are NOT inferred from AI.
 * Teacher Marks show only when an independent marks value exists that is not merely
 * an AI mirror with empty teacher feedback (common AI-only publish artifact).
 */

const AI_FEEDBACK_PLACEHOLDER = /^no ai feedback available yet$/i;

function flagTrue(value) {
  return value === true;
}

function anyGranularFlag(submission) {
  return (
    flagTrue(submission?.aiPublished) ||
    flagTrue(submission?.teacherMarksPublished) ||
    flagTrue(submission?.teacherFeedbackPublished)
  );
}

function isLegacyFullyPublished(submission) {
  if (!submission || String(submission.status || "") !== "PUBLISHED") return false;
  return !anyGranularFlag(submission);
}

function hasValidAiScore(submission) {
  return (
    submission?.aiScore !== null &&
    submission?.aiScore !== undefined &&
    Number.isFinite(Number(submission.aiScore)) &&
    Number(submission.aiScore) >= 0
  );
}

function hasValidTeacherMarks(submission) {
  return (
    submission?.marks !== null &&
    submission?.marks !== undefined &&
    Number.isFinite(Number(submission.marks)) &&
    Number(submission.marks) >= 0
  );
}

function hasTeacherFeedbackContent(feedback) {
  return String(feedback || "").trim().length > 0;
}

function normalizeAiFeedback(text) {
  const value = String(text || "").trim();
  if (!value || AI_FEEDBACK_PLACEHOLDER.test(value)) return "";
  return value;
}

/** True when marks look like an unpublished/copied AI score rather than a teacher grade. */
function marksLookLikeAiMirror(submission) {
  if (!hasValidTeacherMarks(submission) || !hasValidAiScore(submission)) return false;
  if (hasTeacherFeedbackContent(submission.feedback)) return false;
  return Number(submission.marks) === Number(submission.aiScore);
}

function canShowAiResult(submission) {
  if (!submission) return false;
  if (flagTrue(submission.aiPublished)) return true;
  // Legacy PUBLISHED with no flags: AI was historically published via status alone.
  return isLegacyFullyPublished(submission) && hasValidAiScore(submission);
}

function canShowTeacherMarks(submission) {
  if (!submission) return false;
  if (flagTrue(submission.teacherMarksPublished)) {
    return hasValidTeacherMarks(submission);
  }
  // Never treat AI publication as Teacher Marks publication.
  if (flagTrue(submission.aiPublished) && !flagTrue(submission.teacherMarksPublished)) {
    return false;
  }
  // Legacy: only show Teacher Marks when an independent teacher value exists
  // (not an AI score mirrored into marks with no teacher feedback).
  if (isLegacyFullyPublished(submission) && hasValidTeacherMarks(submission)) {
    if (marksLookLikeAiMirror(submission)) return false;
    return true;
  }
  return false;
}

function canShowTeacherFeedback(submission) {
  if (!submission) return false;
  if (flagTrue(submission.teacherFeedbackPublished)) {
    return true;
  }
  if (flagTrue(submission.aiPublished) && !flagTrue(submission.teacherFeedbackPublished)) {
    return false;
  }
  if (isLegacyFullyPublished(submission)) {
    return hasTeacherFeedbackContent(submission.feedback);
  }
  return false;
}

function hasAnyPublishedResult(submission) {
  return (
    canShowAiResult(submission) ||
    canShowTeacherMarks(submission) ||
    canShowTeacherFeedback(submission)
  );
}

/**
 * Redact unpublished grade fields for student-facing payloads.
 * Never coalesce AI marks into teacher marks.
 */
function redactSubmissionForStudent(submission) {
  if (!submission) return submission;
  const showAi = canShowAiResult(submission);
  const showMarks = canShowTeacherMarks(submission);
  const showFeedback = canShowTeacherFeedback(submission);
  const any = showAi || showMarks || showFeedback;

  const aiFeedback = showAi ? normalizeAiFeedback(submission.aiFeedback) : "";
  const aiStrengths = showAi && Array.isArray(submission.aiStrengths) ? submission.aiStrengths : [];
  const aiImprovements =
    showAi && Array.isArray(submission.aiImprovements) ? submission.aiImprovements : [];

  return {
    ...submission,
    marks: showMarks && hasValidTeacherMarks(submission) ? Number(submission.marks) : null,
    aiScore: showAi && hasValidAiScore(submission) ? Number(submission.aiScore) : null,
    feedback: showFeedback ? String(submission.feedback || "") : "",
    aiFeedback,
    aiStrengths: showAi ? aiStrengths : [],
    aiImprovements: showAi ? aiImprovements : [],
    // Effective visibility flags for clients (never imply Teacher from AI alone).
    aiPublished: showAi,
    teacherMarksPublished: showMarks,
    teacherFeedbackPublished: showFeedback,
    resultStatus: any ? "PUBLISHED" : "PENDING",
  };
}

function applyAiPublication(submission, at = new Date()) {
  submission.aiPublished = true;
  submission.aiPublishedAt = at;
  submission.status = "PUBLISHED";
}

function applyTeacherMarksPublication(submission, at = new Date()) {
  submission.teacherMarksPublished = true;
  submission.teacherMarksPublishedAt = at;
  submission.status = "PUBLISHED";
}

function applyTeacherFeedbackPublication(submission, at = new Date()) {
  submission.teacherFeedbackPublished = true;
  submission.teacherFeedbackPublishedAt = at;
  submission.status = "PUBLISHED";
}

module.exports = {
  AI_FEEDBACK_PLACEHOLDER,
  isLegacyFullyPublished,
  hasValidAiScore,
  hasValidTeacherMarks,
  hasTeacherFeedbackContent,
  normalizeAiFeedback,
  marksLookLikeAiMirror,
  canShowAiResult,
  canShowTeacherMarks,
  canShowTeacherFeedback,
  hasAnyPublishedResult,
  redactSubmissionForStudent,
  applyAiPublication,
  applyTeacherMarksPublication,
  applyTeacherFeedbackPublication,
};
