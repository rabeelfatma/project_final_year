/**
 * Same-origin generated-artifact download paths only.
 * Legitimate backend URLs look like: /api/ai/generated/<uniqueName>
 * Never attach Authorization to external / absolute / unexpected URLs.
 */

const GENERATED_PREFIX = "/api/ai/generated/";
const GENERATED_PATH_RE = /^\/api\/ai\/generated\/[^/?#]+$/;

export function isSafeGeneratedArtifactPath(downloadUrl) {
  if (typeof downloadUrl !== "string" || !downloadUrl) return false;
  // Absolute URLs (http:, https:, data:, javascript:, ...) and protocol-relative.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(downloadUrl) || downloadUrl.startsWith("//")) {
    return false;
  }
  if (!GENERATED_PATH_RE.test(downloadUrl)) return false;
  const filePart = downloadUrl.slice(GENERATED_PREFIX.length);
  try {
    const decoded = decodeURIComponent(filePart);
    if (!decoded || decoded === "." || decoded === "..") return false;
    if (/[/\\]/.test(decoded) || decoded.includes("..")) return false;
  } catch (_) {
    return false;
  }
  return true;
}

/**
 * Build a same-origin fetch request for a generated artifact.
 * Returns null when the URL must not be fetched (no Authorization leak).
 */
export function buildArtifactDownloadRequest(downloadUrl, apiOrigin, token) {
  if (!isSafeGeneratedArtifactPath(downloadUrl)) return null;
  const origin = String(apiOrigin || "");
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return { url: `${origin}${downloadUrl}`, headers };
}
