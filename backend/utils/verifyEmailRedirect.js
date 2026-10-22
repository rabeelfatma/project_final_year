/**
 * Safe post-verification redirects to the configured frontend.
 * Destinations are allowlisted from PUBLIC_APP_URL / CLIENT_ORIGIN /
 * FRONTEND_URL (plus the production frontend origin). Callers must never
 * supply an arbitrary redirect URL.
 */

const {
  resolvePublicAppUrl,
  isUsablePublicAppUrl,
  PRODUCTION_FRONTEND_ORIGIN,
} = require("./publicAppUrl");
const { parseAllowedOrigins } = require("./corsOrigins");

const ALLOWED_STATUSES = new Set([
  "success",
  "expired",
  "used",
  "invalid",
  "error",
]);

function canonicalOrigin(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/**
 * Exact frontend origins permitted as redirect targets.
 */
function listAllowedFrontendOrigins(env = process.env) {
  const allowed = new Set(parseAllowedOrigins(env).map(canonicalOrigin).filter(Boolean));
  allowed.add(canonicalOrigin(PRODUCTION_FRONTEND_ORIGIN));
  const primary = canonicalOrigin(resolvePublicAppUrl(env));
  if (primary) allowed.add(primary);
  return allowed;
}

function mapVerifyResultToStatus(result) {
  if (result && result.ok) return "success";
  const code = result && result.code;
  if (code === "TOKEN_EXPIRED") return "expired";
  if (code === "TOKEN_USED") return "used";
  if (code === "TOKEN_INVALID") return "invalid";
  return "invalid";
}

/**
 * Build an allowlisted frontend result URL. Returns "" if no safe target exists.
 * Never includes the raw verification token.
 */
function buildVerifyEmailResultRedirect(result, env = process.env) {
  const status = mapVerifyResultToStatus(result);
  if (!ALLOWED_STATUSES.has(status)) return "";

  const configured = resolvePublicAppUrl(env);
  if (!configured || !isUsablePublicAppUrl(configured, env)) return "";

  const targetOrigin = canonicalOrigin(configured);
  if (!targetOrigin) return "";

  const allowed = listAllowedFrontendOrigins(env);
  if (!allowed.has(targetOrigin)) return "";

  // Path and status only — no token, no caller-controlled redirect.
  return `${targetOrigin}/verify-email?status=${encodeURIComponent(status)}`;
}

module.exports = {
  ALLOWED_STATUSES,
  listAllowedFrontendOrigins,
  mapVerifyResultToStatus,
  buildVerifyEmailResultRedirect,
};
