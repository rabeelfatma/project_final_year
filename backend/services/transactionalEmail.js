/**
 * Server-only transactional email delivery via Resend HTTP API.
 * Reuses the same env convention as password-reset mail:
 *   RESEND_API_KEY
 *   PASSWORD_RESET_FROM_EMAIL  (verified sender)
 *   PUBLIC_APP_URL  (FRONTEND_URL / CLIENT_ORIGIN as fallback)
 */

const {
  resolvePublicAppUrl,
  isUsablePublicAppUrl,
} = require("../utils/publicAppUrl");
const {
  resolvePublicApiUrl,
  resolvePublicApiRoot,
} = require("../utils/publicApiUrl");

function getEmailConfig(env = process.env) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const fromEmail = String(env.PASSWORD_RESET_FROM_EMAIL || "").trim();
  const resolved = resolvePublicAppUrl(env);
  const publicAppUrl = isUsablePublicAppUrl(resolved, env) ? resolved : "";
  const publicApiUrl = resolvePublicApiUrl(env);

  return {
    apiKey,
    fromEmail,
    publicAppUrl,
    publicApiUrl,
    configured: Boolean(apiKey && fromEmail && publicAppUrl && publicApiUrl),
  };
}

/**
 * Email verification links hit the API (server-owned). The handler validates the
 * token and redirects to the allowlisted frontend with a non-sensitive status.
 * @param {string} publicApiUrlOrRoot API origin or .../api root
 * @param {string} rawToken
 */
function buildVerificationLink(publicApiUrlOrRoot, rawToken) {
  const raw = String(publicApiUrlOrRoot || "").replace(/\/+$/, "");
  const apiRoot = /\/api$/i.test(raw) ? raw : `${raw}/api`;
  return `${apiRoot}/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
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
 * Sanitize recipient to domain-only for operator logs (never log full address).
 * @param {string} address
 */
function recipientDomain(address) {
  const raw = String(address || "").trim().toLowerCase();
  const at = raw.lastIndexOf("@");
  if (at < 0 || at === raw.length - 1) return null;
  return raw.slice(at + 1).replace(/[>\s].*$/, "") || null;
}

/**
 * Map provider/network outcomes to a non-sensitive error category for logs.
 * @param {{ networkError?: boolean, status?: number|null }} info
 */
function categorizeEmailProviderFailure({ networkError = false, status = null } = {}) {
  if (networkError) return "network_failure";
  const code = Number(status);
  if (!Number.isFinite(code) || code <= 0) return "unknown";
  if (code === 401 || code === 403) return "auth_rejected";
  if (code === 422) return "validation_rejected";
  if (code === 429) return "rate_limited";
  if (code >= 500) return "provider_unavailable";
  if (code >= 400) return "http_rejected";
  return "unknown";
}

/**
 * Safe diagnostic log — never includes API keys, tokens, full addresses, or provider bodies.
 */
function logTransactionalEmailFailure({
  code,
  category,
  providerStatus = null,
  toDomain = null,
}) {
  console.error(
    "TRANSACTIONAL_EMAIL_FAILED",
    JSON.stringify({
      code: code || "EMAIL_PROVIDER_ERROR",
      category: category || "unknown",
      providerStatus:
        Number.isFinite(Number(providerStatus)) && Number(providerStatus) > 0
          ? Number(providerStatus)
          : null,
      toDomain: toDomain || null,
    })
  );
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string, category?: string, providerStatus?: number|null }}
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
      category: "not_configured",
      providerStatus: null,
    };
  }
  if (typeof fetchImpl !== "function") {
    logTransactionalEmailFailure({
      code: "EMAIL_TRANSPORT_UNAVAILABLE",
      category: "transport_unavailable",
      toDomain: recipientDomain(to),
    });
    return {
      ok: false,
      code: "EMAIL_TRANSPORT_UNAVAILABLE",
      message: "Email transport is unavailable.",
      category: "transport_unavailable",
      providerStatus: null,
    };
  }

  const toDomain = recipientDomain(to);

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
      const providerStatus = Number(response.status) || null;
      const category = categorizeEmailProviderFailure({ status: providerStatus });
      logTransactionalEmailFailure({
        code: "EMAIL_PROVIDER_ERROR",
        category,
        providerStatus,
        toDomain,
      });
      return {
        ok: false,
        code: "EMAIL_PROVIDER_ERROR",
        message: "Email provider rejected the message.",
        category,
        providerStatus,
      };
    }
    return { ok: true };
  } catch (_) {
    const category = categorizeEmailProviderFailure({ networkError: true });
    logTransactionalEmailFailure({
      code: "EMAIL_PROVIDER_ERROR",
      category,
      providerStatus: null,
      toDomain,
    });
    return {
      ok: false,
      code: "EMAIL_PROVIDER_ERROR",
      message: "Email provider request failed.",
      category,
      providerStatus: null,
    };
  }
}

module.exports = {
  getEmailConfig,
  resolvePublicAppUrl,
  resolvePublicApiUrl,
  resolvePublicApiRoot,
  buildVerificationLink,
  buildAdminRegistrationsLink,
  templateSignupVerification,
  templateAdminNewRegistration,
  templateApplicantApproved,
  templateApplicantRejected,
  sendTransactionalEmail,
  recipientDomain,
  categorizeEmailProviderFailure,
  logTransactionalEmailFailure,
};
