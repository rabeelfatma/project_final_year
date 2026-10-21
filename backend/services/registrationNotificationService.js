const {
  getEmailConfig,
  buildAdminRegistrationsLink,
  templateAdminNewRegistration,
  templateApplicantApproved,
  templateApplicantRejected,
  sendTransactionalEmail,
} = require("./transactionalEmail");

const ADMIN_NOTIFY_EMAIL =
  String(process.env.ADMIN_NOTIFY_EMAIL || "rabeelramzan50@gmail.com")
    .trim()
    .toLowerCase() || "rabeelramzan50@gmail.com";

function createDefaultDeps() {
  return {
    User: require("../models/User"),
    Notification: require("../models/Notification"),
    createNotification: require("../controllers/notificationController").create,
    sendTransactionalEmail,
    getEmailConfig,
    env: process.env,
    now: () => new Date(),
    fetchImpl: globalThis.fetch,
  };
}

/**
 * Idempotent: after email verification, notify Admins once (dashboard + email).
 */
async function notifyAdminsOfVerifiedRegistration(user, deps = createDefaultDeps()) {
  if (!user?._id) return { notified: false, reason: "missing_user" };

  const claimed = await deps.User.findOneAndUpdate(
    {
      _id: user._id,
      emailVerified: true,
      approvalStatus: "pending",
      $or: [{ adminNotifiedAt: null }, { adminNotifiedAt: { $exists: false } }],
    },
    { $set: { adminNotifiedAt: deps.now() } },
    { new: true }
  ).select("name email role createdAt adminNotifiedAt");

  if (!claimed) {
    return { notified: false, reason: "already_notified_or_not_pending" };
  }

  const admins = await deps.User.find({ role: "admin", isAllowedLogin: { $ne: false } })
    .select("_id email name")
    .lean();

  // Use only the configured public frontend origin — never invent a host or
  // fall back to a different deployment's domain (e.g. Hostinger vs Vercel).
  const publicAppUrl = deps.getEmailConfig(deps.env).publicAppUrl || "";
  const adminLink = publicAppUrl
    ? buildAdminRegistrationsLink(publicAppUrl)
    : "";

  const title = "New registration awaiting approval";
  const message = `${claimed.name} (${claimed.email}) requested ${claimed.role} access.`;

  for (const admin of admins) {
    try {
      // Prefer controller helper (push-capable); fall back to model create.
      if (typeof deps.createNotification === "function") {
        await deps.createNotification({
          recipient: admin._id,
          title,
          message,
          type: "registration_pending",
          meta: {
            userId: String(claimed._id),
            email: claimed.email,
            role: claimed.role,
            tab: "Registration Requests",
          },
          url: "/dashboard/admin",
        });
      } else {
        await deps.Notification.create({
          recipient: admin._id,
          title,
          message,
          type: "registration_pending",
          meta: {
            userId: String(claimed._id),
            email: claimed.email,
            role: claimed.role,
          },
        });
      }
    } catch (_) {
      /* keep going — email still attempted */
    }
  }

  const config = deps.getEmailConfig(deps.env);
  let emailResult = { ok: false, code: "EMAIL_NOT_CONFIGURED" };
  if (config.configured) {
    const content = templateAdminNewRegistration({
      applicantName: claimed.name,
      applicantEmail: claimed.email,
      role: claimed.role,
      registeredAt: claimed.createdAt,
      adminLink,
    });
    emailResult = await deps.sendTransactionalEmail(
      {
        to: ADMIN_NOTIFY_EMAIL,
        subject: content.subject,
        text: content.text,
        html: content.html,
      },
      { env: deps.env, fetchImpl: deps.fetchImpl }
    );
  }

  return {
    notified: true,
    adminCount: admins.length,
    email: emailResult,
  };
}

async function sendApplicantDecisionEmail(user, decision, deps = createDefaultDeps()) {
  const config = deps.getEmailConfig(deps.env);
  if (!config.configured || !user?.email) {
    return { ok: false, code: "EMAIL_NOT_CONFIGURED" };
  }

  if (decision === "approved") {
    const loginLink = `${config.publicAppUrl}/login?role=${encodeURIComponent(user.role || "student")}`;
    const content = templateApplicantApproved({
      name: user.name || "Applicant",
      loginLink,
    });
    return deps.sendTransactionalEmail(
      {
        to: user.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      },
      { env: deps.env, fetchImpl: deps.fetchImpl }
    );
  }

  if (decision === "rejected") {
    const content = templateApplicantRejected({
      name: user.name || "Applicant",
    });
    return deps.sendTransactionalEmail(
      {
        to: user.email,
        subject: content.subject,
        text: content.text,
        html: content.html,
      },
      { env: deps.env, fetchImpl: deps.fetchImpl }
    );
  }

  return { ok: false, code: "INVALID_DECISION" };
}

module.exports = {
  ADMIN_NOTIFY_EMAIL,
  notifyAdminsOfVerifiedRegistration,
  sendApplicantDecisionEmail,
  createDefaultDeps,
};
