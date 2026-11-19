/**
 * Opportunistic flush for Vercel Hobby (infrequent cron) and local/dev.
 * Idempotent — safe on every student/notification poll.
 */
async function flushAssignmentAvailabilityNotifications(options = {}) {
  const limit = options.limit == null ? 20 : options.limit;
  try {
    const Assignment = require("../models/Assignment");
    const User = require("../models/User");
    const Notification = require("../models/Notification");
    const { create: createNotification } = require("../controllers/notificationController");
    const {
      dispatchDueAssignmentAvailabilityNotifications,
    } = require("../services/assignmentAvailabilityNotificationService");

    return await dispatchDueAssignmentAvailabilityNotifications({
      Assignment,
      User,
      Notification,
      createNotification,
      nowMs: Date.now(),
      limit,
    });
  } catch (error) {
    console.error("assignment availability flush failed:", error.message || error);
    return null;
  }
}

module.exports = {
  flushAssignmentAvailabilityNotifications,
};
