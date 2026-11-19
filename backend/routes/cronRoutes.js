const express = require("express");
const router = express.Router();

const Assignment = require("../models/Assignment");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { create: createNotification } = require("../controllers/notificationController");
const {
  dispatchDueAssignmentAvailabilityNotifications,
} = require("../services/assignmentAvailabilityNotificationService");

/**
 * Authorize Vercel Cron and manual operators.
 * - Vercel sets `x-vercel-cron: 1`
 * - Optional shared secret: Authorization: Bearer <CRON_SECRET>
 */
function isCronAuthorized(req) {
  const vercelCron = String(req.get("x-vercel-cron") || "") === "1";
  if (vercelCron) return true;

  const secret = String(process.env.CRON_SECRET || "").trim();
  const auth = String(req.get("authorization") || "");
  if (secret && auth === `Bearer ${secret}`) return true;

  // Local/dev convenience only — never open in production without a secret.
  if (!secret && process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") {
    return true;
  }
  return false;
}

/**
 * GET/POST /api/cron/assignment-availability
 * Dispatches due "New assignment posted" notifications for scheduled starts.
 */
async function runAssignmentAvailabilityCron(req, res) {
  if (!isCronAuthorized(req)) {
    return res.status(401).json({ message: "Unauthorized cron request." });
  }

  try {
    const summary = await dispatchDueAssignmentAvailabilityNotifications({
      Assignment,
      User,
      Notification,
      createNotification,
      nowMs: Date.now(),
      limit: 40,
    });
    return res.json({
      ok: true,
      ...summary,
    });
  } catch (error) {
    console.error("CRON assignment-availability error:", error);
    return res.status(500).json({
      message: "Failed to dispatch assignment availability notifications.",
      error: error.message,
    });
  }
}

router.get("/assignment-availability", runAssignmentAvailabilityCron);
router.post("/assignment-availability", runAssignmentAvailabilityCron);

module.exports = router;
