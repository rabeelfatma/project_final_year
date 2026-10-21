/**
 * API base URL helper.
 *
 * - Explicit VITE_API_BASE_URL wins in Vite DEV (laptop and same-Wi-Fi LAN).
 * - Vite DEV with no override uses the page hostname on port 5000, so a phone
 *   opening http://<laptop-lan-ip>:5173 talks to the laptop backend.
 * - Production builds use the Vercel API project:
 *   https://quickcheck-hub-backend.vercel.app/api
 *   Loopback, private-LAN, and relative "/api" values are ignored in production
 *   so a laptop .env cannot be baked into the Vercel frontend.
 * - The frontend Vercel project is a static SPA. Do not point production at
 *   same-origin /api; that host rewrites client routes to index.html.
 */

export const PRODUCTION_API_BASE_URL =
  "https://quickcheck-hub-backend.vercel.app/api";

function isLoopbackHostname(hostname) {
  const h = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0.0.0.0";
}

function isPrivateLanHostname(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (/^10(?:\.\d{1,3}){3}$/.test(h)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(h)) return true;
  if (/^169\.254(?:\.\d{1,3}){2}$/.test(h)) return true;
  return false;
}

/**
 * Collapse duplicate /api suffixes and ensure an absolute origin includes /api once.
 * Relative values are only normalized (callers decide whether production may use them).
 * @param {string} value
 */
export function normalizeApiBaseUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (!/^https?:\/\//i.test(raw)) {
    let rel = raw.replace(/\/+$/, "");
    while (/\/api\/api$/i.test(rel)) rel = rel.replace(/\/api$/i, "");
    if (rel === "" || rel === "/") return "/api";
    return rel;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw.replace(/\/+$/, "");
  }

  let path = parsed.pathname.replace(/\/+$/, "");
  while (/\/api\/api$/i.test(path)) path = path.replace(/\/api$/i, "");
  if (path === "" || path === "/") path = "/api";
  parsed.pathname = path;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function isAcceptedProductionOverride(url) {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "https:") return false;
    if (isLoopbackHostname(hostname) || isPrivateLanHostname(hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Pure resolver for tests and getApiBaseUrl().
 * @param {{ configured?: string, isDev?: boolean, hostname?: string, protocol?: string, apiPort?: string|number }} opts
 */
export function resolveApiBaseUrl(opts = {}) {
  const configured = normalizeApiBaseUrl(opts.configured);
  if (opts.isDev) {
    if (configured) return configured;
    const host = String(opts.hostname || "").trim() || "localhost";
    const protocol =
      String(opts.protocol || "http:").toLowerCase() === "https:"
        ? "https:"
        : "http:";
    const port = String(opts.apiPort || "5000").trim() || "5000";
    return `${protocol}//${host}:${port}/api`;
  }
  if (configured && isAcceptedProductionOverride(configured)) return configured;
  return PRODUCTION_API_BASE_URL;
}

export function getApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  if (import.meta.env.DEV) {
    if (configured) return resolveApiBaseUrl({ configured, isDev: true });
    const hostname =
      typeof window !== "undefined" && window.location?.hostname
        ? window.location.hostname
        : "localhost";
    const protocol =
      typeof window !== "undefined" && window.location?.protocol
        ? window.location.protocol
        : "http:";
    return resolveApiBaseUrl({
      isDev: true,
      hostname,
      protocol,
      apiPort: import.meta.env.VITE_DEV_API_PORT || "5000",
    });
  }
  return resolveApiBaseUrl({ configured, isDev: false });
}

export function getApiOrigin() {
  return getApiBaseUrl().replace(/\/api\/?$/, "");
}
