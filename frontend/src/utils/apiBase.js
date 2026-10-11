/**
 * API base URL helper.
 * - Explicit VITE_API_BASE_URL always wins.
 * - Vite DEV defaults to local Express (preserves npm run dev workflow).
 * - Production build defaults to same-origin /api (Hostinger single-app).
 */
export function getApiBaseUrl() {
  const configured = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "http://localhost:5000/api";
  }
  return "/api";
}

export function getApiOrigin() {
  return getApiBaseUrl().replace(/\/api\/?$/, "");
}
