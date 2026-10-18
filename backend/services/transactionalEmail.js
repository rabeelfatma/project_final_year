/**
 * Server-only transactional email delivery via Resend HTTP API.
 * Reuses the same env convention as password-reset mail:
 *   RESEND_API_KEY
 *   PASSWORD_RESET_FROM_EMAIL  (verified sender)
 *   PUBLIC_APP_URL  (FRONTEND_URL / first CLIENT_ORIGIN as fallback)
 */

function resolvePublicAppUrl(env = process.env) {
  const primary = String(env.PUBLIC_APP_URL || "").trim();
  const frontend = String(env.FRONTEND_URL || "").trim();
  const clientOrigin = String(env.CLIENT_ORIGIN || "")
    .split(",")[0]
    .trim();
  return (primary || frontend || clientOrigin).replace(/\/+$/, "");
}

function getEmailConfig(env = process.env) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const fromEmail = String(env.PASSWORD_RESET_FROM_EMAIL || "").trim();
  const publicAppUrl = resolvePublicAppUrl(env);

  return {
    apiKey,
    fromEmail,
    publicAppUrl,
    configured: Boolean(apiKey && fromEmail && publicAppUrl),
  };
}

function buildVerificationLink(publicAppUrl, rawToken) {
  const base = String(publicAppUrl || "").replace(/\/+$/, "");
  return `${base}/verify-email?token=${encodeURIComponent(rawToken)}`;
}

function buildAdminRegistrationsLink(publicAppUrl) {
  const base = String(publicAppUrl || "").replace(/\/+$/, "");
  return `${base}/dashboard/admin`;
}

function templateSignupVerification({ name, verifyLink, expiresHours }) {
  const subject = "Verify your QuickCheck Hub email";
  const text = [
    `Hello ${name},`,
    "",
    "Thank you for registering with QuickCheck Hub.",
    `Please verify your email address within ${expiresHours} hours:`,
    verifyLink,
    "",
    "After verification, an administrator must approve your account before you can log in.",
    "If you did not create this account, you can ignore this email.",
  ].join("\n");
  const html = `
    <p>Hello ${escapeHtml(name)},</p>
    <p>Thank you for registering with <strong>QuickCheck Hub</strong>.</p>
    <p><a href="${verifyLink}">Verify your email address</a> (expires in ${expiresHours} hours).</p>
    <p>After verification, an administrator must approve your account before you can log in.</p>
    <p>If you did not create this account, you can ignore this email.</p>
  `.trim();
  return { subject, text, html };
}

function templateAdminNewRegistration({
  applicantName,
  applicantEmail,
  role,
  registeredAt,
  adminLink,
}) {
  const subject = "QuickCheck Hub: new registration awaiting approval";
  const when = registeredAt
    ? new Date(registeredAt).toUTCString()
    : "recently";
  const text = [
    "A new registration is ready for Admin review.",
    "",
    `Name: ${applicantName}`,
    `Email: ${applicantEmail}`,
    `Requested role: ${role}`,
    `Registered: ${when}`,
    "",
    `Open Admin dashboard: ${adminLink}`,
    "",
    "Approve or reject from Registration Requests. Do not reply with credentials.",
  ].join("\n");
  const html = `
    <p>A new registration is ready for Admin review.</p>
    <ul>
      <li><strong>Name:</strong> ${escapeHtml(applicantName)}</li>
      <li><strong>Email:</strong> ${escapeHtml(applicantEmail)}</li>
      <li><strong>Requested role:</strong> ${escapeHtml(role)}</li>
      <li><strong>Registered:</strong> ${escapeHtml(when)}</li>
    </ul>
    <p><a href="${adminLink}">Open Admin dashboard — Registration Requests</a></p>
  `.trim();
  return { subject, text, html };
}

function templateApplicantApproved({ name, loginLink }) {
  const subject = "QuickCheck Hub: your account was approved";
  const text = [
    `Hello ${name},`,
    "",
    "Your QuickCheck Hub registration has been approved by an administrator.",
    `You can sign in here: ${loginLink}`,
    "",
    "Welcome aboard.",
  ].join("\n");
  const html = `
    <p>Hello ${escapeHtml(name)},</p>
    <p>Your <strong>QuickCheck Hub</strong> registration has been approved.</p>
    <p><a href="${loginLink}">Sign in</a></p>
  `.trim();
  return { subject, text, html };
}

function templateApplicantRejected({ name }) {
  const subject = "QuickCheck Hub: registration update";
  const text = [
    `Hello ${name},`,
    "",
    "Your QuickCheck Hub registration request was not approved.",
    "If you believe this is a mistake, contact your institution administrator.",
  ].join("\n");
  const html = `
    <p>Hello ${escapeHtml(name)},</p>
    <p>Your QuickCheck Hub registration request was not approved.</p>
    <p>If you believe this is a mistake, contact your institution administrator.</p>
  `.trim();
  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
async function sendTransactionalEmail(
  { to, subject, text, html },
  { env = process.env, fetchImpl = globalThis.fetch } = {}
) {
  const config = getEmailConfig(env);
  if (!config.configured) {
    return {
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Transactional email is not configured.",
    };
  }
  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      code: "EMAIL_TRANSPORT_UNAVAILABLE",
      message: "Email transport is unavailable.",
    };
  }

  try {
    const response = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: config.fromEmail,
        to: [to],
        subject,
        text,
        html,
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        code: "EMAIL_PROVIDER_ERROR",
        message: "Email provider rejected the message.",
      };
    }
    return { ok: true };
  } catch (_) {
    return {
      ok: false,
      code: "EMAIL_PROVIDER_ERROR",
      message: "Email provider request failed.",
    };
  }
}

module.exports = {
  getEmailConfig,
  buildVerificationLink,
  buildAdminRegistrationsLink,
  templateSignupVerification,
  templateAdminNewRegistration,
  templateApplicantApproved,
  templateApplicantRejected,
  sendTransactionalEmail,
};
