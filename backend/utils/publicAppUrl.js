/**
 * Resolve the public frontend origin for email deep links (verify / reset).
 * Prefer PUBLIC_APP_URL; fall back to FRONTEND_URL / CLIENT_ORIGIN.
 * When choosing among fallbacks, skip loopback hosts so local CORS origins
 * do not leak into emails opened on phones.
 *
 * Production with no configured origin uses the Vercel frontend:
 *   https://quick-check-hub-frontend.vercel.app
 * This value is not taken from request Host / X-Forwarded-Host headers.
 *
 * Fail closed when the configured origin is the backend API host, the retired
 * duke.com.pk host, or (in production) loopback, private LAN, or non-HTTPS.
 * An invalid explicit value is not replaced with the Vercel default.
 * Development may use localhost or a same-Wi-Fi LAN origin for mobile testing.
 */

const PRODUCTION_FRONTEND_ORIGIN = "https://quick-check-hub-frontend.vercel.app";
const DISALLOWED_PUBLIC_APP_HOSTS = new Set([
  "quickcheck-hub-backend.vercel.app",
  "duke.com.pk",
  "www.duke.com.pk",
]);

function isLoopbackHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]"
  );
}

/** RFC1918 + link-local — reachable on LAN, never a public production origin. */
function isPrivateLanHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (/^10(?:\.\d{1,3}){3}$/.test(h)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(h)) return true;
  if (/^169\.254(?:\.\d{1,3}){2}$/.test(h)) return true;
  return false;
}

function hostnameFromUrl(url) {
  try {
    return new URL(String(url || "")).hostname;
  } catch {
    return "";
  }
}

function isLoopbackPublicUrl(url) {
  const host = hostnameFromUrl(url);
  if (host) return isLoopbackHostname(host);
  return /localhost|127\.0\.0\.1|\[::1\]/i.test(String(url || ""));
}

function isPrivateLanPublicUrl(url) {
  const host = hostnameFromUrl(url);
  if (host) return isPrivateLanHostname(host);
  return false;
}

function isDisallowedPublicAppHost(url) {
  const host = hostnameFromUrl(url).replace(/\.$/, "").toLowerCase();
  return DISALLOWED_PUBLIC_APP_HOSTS.has(host);
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
  if (!candidates.length) return productionFrontendDefault(env);

  // Explicit PUBLIC_APP_URL always wins (including localhost / LAN for local email tests).
  const primary = normalizeOrigin(env.PUBLIC_APP_URL);
  if (primary) return primary;

  // Prefer public HTTPS origins over loopback; among remaining, prefer LAN over loopback
  // so phone verification emails work when CLIENT_ORIGIN lists both.
  const nonLoopback = candidates.find((url) => !isLoopbackPublicUrl(url));
  return nonLoopback || candidates[0];
}

function productionFrontendDefault(env = process.env) {
  if (String(env.NODE_ENV || "").toLowerCase() !== "production") return "";
  return PRODUCTION_FRONTEND_ORIGIN;
}

/**
 * Production must not send loopback or private-LAN links.
 * Local/dev may use http://localhost:5173 or http://192.168.x.x:5173.
 */
function isUsablePublicAppUrl(url, env = process.env) {
  if (!url) return false;
  if (isDisallowedPublicAppHost(url)) return false;
  const isProd = String(env.NODE_ENV || "").toLowerCase() === "production";
  if (!isProd) return true;
  if (isLoopbackPublicUrl(url)) return false;
  if (isPrivateLanPublicUrl(url)) return false;
  try {
    if (new URL(String(url)).protocol !== "https:") return false;
  } catch {
    return false;
  }
  return true;
}

module.exports = {
  PRODUCTION_FRONTEND_ORIGIN,
  isLoopbackHostname,
  isPrivateLanHostname,
  isLoopbackPublicUrl,
  isPrivateLanPublicUrl,
  isDisallowedPublicAppHost,
  collectPublicAppUrlCandidates,
  resolvePublicAppUrl,
  isUsablePublicAppUrl,
};
