/**
 * Assignment availability notifications.
 *
 * Students must not receive "New assignment posted" before startDate.
 * Immediate notify only when the assignment is already active/available.
 * Future-start assignments are claimed + notified by cron / opportunistic flush.
 *
 * Idempotency:
 * - Atomic claim via Assignment.availabilityNotifiedAt
 * - Per-student duplicate guard on Notification (type + meta.assignmentId)
 */

const { evaluateAssignmentWindow } = require("../utils/assignmentAvailability");

function assignmentIdVariants(assignmentId) {
  const raw = assignmentId?._id || assignmentId;
  if (raw == null) return [];
  const asString = String(raw);
  return asString ? [raw, asString] : [];
}

function isAssignmentAvailableNow(assignment, nowMs = Date.now()) {
  if (!assignment || assignment.status !== "active") return false;
  const windowState = evaluateAssignmentWindow(
    assignment.startDate,
    assignment.deadline,
    nowMs
  );
  return Boolean(windowState.visibleToStudent);
}

async function findExistingAvailabilityNotification(Notification, recipientId, assignmentId) {
  const variants = assignmentIdVariants(assignmentId);
  if (!variants.length) return null;
  return Notification.findOne({
    recipient: recipientId,
    type: "assignment",
    "meta.assignmentId": { $in: variants },
  });
}

async function createAvailabilityNotificationForStudent({
  createNotification,
  Notification,
  studentId,
  assignment,
}) {
  const existing = await findExistingAvailabilityNotification(
    Notification,
    studentId,
    assignment._id
  );
  if (existing) {
    return { created: false, notification: existing, reason: "duplicate" };
  }

  const notification = await createNotification({
    recipient: studentId,
    title: "New assignment posted",
    message: `${assignment.title} is available. Total marks: ${assignment.points}.`,
    type: "assignment",
    meta: { assignmentId: assignment._id },
    url: "/dashboard/student",
  });

  return { created: true, notification };
}

/**
 * Atomically claim an assignment for availability notification.
 * Returns the updated document when this caller won the claim; otherwise null.
 */
async function claimAssignmentAvailabilityNotify(Assignment, assignmentId, nowMs = Date.now()) {
  const now = new Date(nowMs);
  return Assignment.findOneAndUpdate(
    {
      _id: assignmentId,
      status: "active",
      startDate: { $lte: now },
      $or: [
        { availabilityNotifiedAt: null },
        { availabilityNotifiedAt: { $exists: false } },
      ],
    },
    { $set: { availabilityNotifiedAt: now } },
    { new: true }
  );
}

async function listEligibleStudents(User) {
  return User.find({ role: "student" }).select("_id");
}

/**
 * Notify eligible students that an assignment is available.
 * Safe to call repeatedly (claim + per-student guards).
 */
async function notifyAssignmentAvailable(assignment, deps = {}) {
  const {
    Assignment,
    User,
    Notification,
    createNotification,
    nowMs = Date.now(),
  } = deps;

  if (!assignment?._id) {
    return { notified: 0, skipped: true, reason: "missing-assignment" };
  }

  if (!isAssignmentAvailableNow(assignment, nowMs)) {
    return { notified: 0, skipped: true, reason: "not-available-yet" };
  }

  const claimed = await claimAssignmentAvailabilityNotify(
    Assignment,
    assignment._id,
    nowMs
  );
  if (!claimed) {
    return { notified: 0, skipped: true, reason: "already-claimed" };
  }

  const students = await listEligibleStudents(User);
  let notified = 0;
  let duplicates = 0;

  for (const student of students) {
    const result = await createAvailabilityNotificationForStudent({
      createNotification,
      Notification,
      studentId: student._id,
      assignment: claimed,
    });
    if (result.created) notified += 1;
    else if (result.reason === "duplicate") duplicates += 1;
  }

  return {
    notified,
    duplicates,
    skipped: false,
    assignmentId: String(claimed._id),
    notifiedAt: claimed.availabilityNotifiedAt,
  };
}

/**
 * Flush due availability notifications (cron + opportunistic student traffic).
 */
async function dispatchDueAssignmentAvailabilityNotifications(deps = {}) {
  const {
    Assignment,
    User,
    Notification,
    createNotification,
    nowMs = Date.now(),
    limit = 40,
  } = deps;

  const now = new Date(nowMs);
  const due = await Assignment.find({
    status: "active",
    startDate: { $lte: now },
    $or: [
      { availabilityNotifiedAt: null },
      { availabilityNotifiedAt: { $exists: false } },
    ],
  })
    .sort({ startDate: 1 })
    .limit(Math.max(1, Number(limit) || 40));

  const results = [];
  for (const assignment of due) {
    // Re-check window (defense in depth) then notify via claim path.
    if (!isAssignmentAvailableNow(assignment, nowMs)) continue;
    const result = await notifyAssignmentAvailable(assignment, {
      Assignment,
      User,
      Notification,
      createNotification,
      nowMs,
    });
    results.push(result);
  }

  return {
    scanned: due.length,
    results,
    notified: results.reduce((sum, row) => sum + (row.notified || 0), 0),
  };
}

module.exports = {
  isAssignmentAvailableNow,
  claimAssignmentAvailabilityNotify,
  createAvailabilityNotificationForStudent,
  notifyAssignmentAvailable,
  dispatchDueAssignmentAvailabilityNotifications,
  findExistingAvailabilityNotification,
  assignmentIdVariants,
};
