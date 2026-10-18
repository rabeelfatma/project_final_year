/**
 * Same-origin generated-artifact download paths only.
 * Legitimate backend URLs look like: /api/ai/generated/<uniqueName>
 */

const GENERATED_PREFIX = "/api/ai/generated/";
const GENERATED_PATH_RE = /^\/api\/ai\/generated\/[^/?#]+$/;

function isSafeGeneratedArtifactPath(downloadUrl) {
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

function sanitizeDownloadUrl(downloadUrl) {
  return isSafeGeneratedArtifactPath(downloadUrl) ? downloadUrl : null;
}

function sanitizeArtifact(artifact) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return null;
  const name = String(artifact.name || "generated-file").slice(0, 255);
  const downloadUrl = sanitizeDownloadUrl(artifact.downloadUrl);
  const out = { name };
  if (artifact.type != null) out.type = String(artifact.type).slice(0, 40);
  if (downloadUrl) out.downloadUrl = downloadUrl;
  return out;
}

function sanitizeArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) return [];
  return artifacts
    .slice(0, 20)
    .map(sanitizeArtifact)
    .filter(Boolean);
}

module.exports = {
  GENERATED_PREFIX,
  isSafeGeneratedArtifactPath,
  sanitizeDownloadUrl,
  sanitizeArtifact,
  sanitizeArtifacts,
};
