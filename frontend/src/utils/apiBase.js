/**
 * API base URL helper.
 * - Explicit VITE_API_BASE_URL always wins.
 * - Vite DEV defaults to the page hostname on port 5000 so a phone on the same
 *   Wi-Fi (opening http://<laptop-lan-ip>:5173) talks to the laptop backend,
 *   not the phone's own localhost.
 * - Production build defaults to same-origin /api (Hostinger single-app).
 * - Separate Vercel SPA: set VITE_API_BASE_URL at build time to the backend /api.
 */

/**
 * Pure resolver for tests and getApiBaseUrl().
 * @param {{ configured?: string, isDev?: boolean, hostname?: string, protocol?: string, apiPort?: string|number }} opts
 */
export function resolveApiBaseUrl(opts = {}) {
  const configured = String(opts.configured || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (opts.isDev) {
    const host = String(opts.hostname || "").trim() || "localhost";
    const protocol =
      String(opts.protocol || "http:").toLowerCase() === "https:"
        ? "https:"
        : "http:";
    const port = String(opts.apiPort || "5000").trim() || "5000";
    return `${protocol}//${host}:${port}/api`;
  }
  return "/api";
}

export function getApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  if (configured) {
    return resolveApiBaseUrl({ configured });
  }
  if (import.meta.env.DEV) {
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
  return resolveApiBaseUrl({ isDev: false });
}

export function getApiOrigin() {
  return getApiBaseUrl().replace(/\/api\/?$/, "");
}
