/**
 * Resolve the public frontend origin for email deep links (verify / reset).
 * Prefer PUBLIC_APP_URL; fall back to FRONTEND_URL / CLIENT_ORIGIN.
 * When choosing among fallbacks, skip loopback hosts so local CORS origins
 * do not leak into emails opened on phones.
 */

function isLoopbackHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]"
  );
}

function isLoopbackPublicUrl(url) {
  try {
    return isLoopbackHostname(new URL(String(url || "")).hostname);
  } catch {
    return /localhost|127\.0\.0\.1|\[::1\]/i.test(String(url || ""));
  }
}

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function collectPublicAppUrlCandidates(env = process.env) {
  const out = [];
  const push = (value) => {
    const normalized = normalizeOrigin(value);
    if (normalized && !out.includes(normalized)) out.push(normalized);
  };
  push(env.PUBLIC_APP_URL);
  push(env.FRONTEND_URL);
  for (const part of String(env.CLIENT_ORIGIN || "").split(",")) {
    push(part);
  }
  return out;
}

/**
 * @returns {string} Absolute frontend origin without trailing slash, or "".
 */
function resolvePublicAppUrl(env = process.env) {
  const candidates = collectPublicAppUrlCandidates(env);
  if (!candidates.length) return "";

  // Explicit PUBLIC_APP_URL always wins (including localhost for local email tests).
  const primary = normalizeOrigin(env.PUBLIC_APP_URL);
  if (primary) return primary;

  const nonLoopback = candidates.find((url) => !isLoopbackPublicUrl(url));
  return nonLoopback || candidates[0];
}

/**
 * Production must not send loopback links (phones cannot open the server's localhost).
 * Local/dev may use http://localhost:5173.
 */
function isUsablePublicAppUrl(url, env = process.env) {
  if (!url) return false;
  const isProd = String(env.NODE_ENV || "").toLowerCase() === "production";
  if (isProd && isLoopbackPublicUrl(url)) return false;
  return true;
}

module.exports = {
  isLoopbackPublicUrl,
  collectPublicAppUrlCandidates,
  resolvePublicAppUrl,
  isUsablePublicAppUrl,
};
