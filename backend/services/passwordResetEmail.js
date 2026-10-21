/**
 * Server-only password-reset email delivery via Resend HTTP API.
 * No React bundle usage. Inject `fetchImpl` for tests (no real network).
 *
 * Env (names):
 *   RESEND_API_KEY
 *   PASSWORD_RESET_FROM_EMAIL
 *   PUBLIC_APP_URL  (FRONTEND_URL / CLIENT_ORIGIN as fallback)
 */

const {
  resolvePublicAppUrl,
  isUsablePublicAppUrl,
} = require("../utils/publicAppUrl");

function getResetEmailConfig(env = process.env) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const fromEmail = String(env.PASSWORD_RESET_FROM_EMAIL || "").trim();
  const resolved = resolvePublicAppUrl(env);
  const publicAppUrl = isUsablePublicAppUrl(resolved, env) ? resolved : "";

  return {
    apiKey,
    fromEmail,
    publicAppUrl,
    configured: Boolean(apiKey && fromEmail && publicAppUrl),
  };
}

function buildResetLink(publicAppUrl, rawToken) {
  // Put the one-time token in the URL fragment so it is not sent to the server
  // in normal navigation requests / access logs (email clients open the page; JS reads the hash).
  const base = String(publicAppUrl || "").replace(/\/+$/, "");
  return `${base}/reset-password#${encodeURIComponent(rawToken)}`;
}

function buildResetEmailContent({ resetLink, expiresMinutes }) {
  const subject = "QuickCheck Hub password reset";
  const text = [
    "You requested a password reset for your QuickCheck Hub account.",
    "",
    `Open this link to set a new password (expires in ${expiresMinutes} minutes):`,
    resetLink,
    "",
    "If you did not request this, you can ignore this email.",
    "Do not share this link.",
  ].join("\n");

  const html = `
    <p>You requested a password reset for your QuickCheck Hub account.</p>
    <p><a href="${resetLink}">Set a new password</a> (expires in ${expiresMinutes} minutes).</p>
    <p>If you did not request this, you can ignore this email. Do not share this link.</p>
  `.trim();

  return { subject, text, html };
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
async function sendPasswordResetEmail(
  { to, rawToken, expiresMinutes = 15 },
  { env = process.env, fetchImpl = globalThis.fetch } = {}
) {
  const config = getResetEmailConfig(env);
  if (!config.configured) {
    return {
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Password recovery email is not configured.",
    };
  }

  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      code: "EMAIL_TRANSPORT_UNAVAILABLE",
      message: "Email transport is unavailable.",
    };
  }

  const resetLink = buildResetLink(config.publicAppUrl, rawToken);
  const content = buildResetEmailContent({
    resetLink,
    expiresMinutes,
  });

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
        subject: content.subject,
        text: content.text,
        html: content.html,
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
  getResetEmailConfig,
  buildResetLink,
  buildResetEmailContent,
  sendPasswordResetEmail,
};
