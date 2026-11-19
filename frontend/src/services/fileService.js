import React from "react";
import { createRoot } from "react-dom/client";
import FilePreviewModal from "../components/files/FilePreviewModal";
import { getAuthHeader } from "../utils/authToken";

/** Authenticated binary fetch for in-browser visual Office viewers. */
export async function fetchProtectedArrayBuffer(url) {
  const response = await fetch(url, { headers: { ...getAuthHeader() } });
  if (!response.ok) {
    let message = "File load failed.";
    try { const data = await response.json(); message = data.message || message; } catch (_) {}
    throw new Error(message);
  }
  return response.arrayBuffer();
}

export async function downloadProtectedFile(url, fallbackName = "download") {
  const response = await fetch(url, { headers: { ...getAuthHeader() } });
  if (!response.ok) {
    let message = "File download failed.";
    try { const data = await response.json(); message = data.message || message; } catch (_) {}
    throw new Error(message);
  }
  const blob = await response.blob();
  const disposition = response.headers.get("content-disposition") || "";
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="([^"]+)"/i) || disposition.match(/filename=([^;]+)/i);
  let name = fallbackName;
  if (utfMatch?.[1]) {
    try { name = decodeURIComponent(utfMatch[1].trim()); } catch { name = utfMatch[1].trim(); }
  } else if (plainMatch?.[1]) {
    name = plainMatch[1].trim().replace(/^["']|["']$/g, "");
  }
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
}

let previewRoot = null;
let previewHost = null;

function unmountPreview() {
  if (previewRoot) {
    previewRoot.unmount();
    previewRoot = null;
  }
  if (previewHost) {
    previewHost.remove();
    previewHost = null;
  }
}

/**
 * Authenticated in-app preview. Prefer passing downloadUrl so unavailable formats
 * can still offer a secure download without leaving QuickCheck Hub.
 *
 * @param {string} previewUrl authenticated preview route
 * @param {string} fileName original filename (used for type detection + labels)
 * @param {{ downloadUrl?: string, downloadLabel?: string }} [options]
 */
export async function openProtectedPreview(previewUrl, fileName = "File preview", options = {}) {
  if (!previewUrl) throw new Error("Missing preview URL.");
  unmountPreview();
  previewHost = document.createElement("div");
  previewHost.id = "quickcheck-file-preview-root";
  document.body.appendChild(previewHost);
  previewRoot = createRoot(previewHost);
  const downloadUrl = options.downloadUrl || options.download || "";
  const downloadLabel = options.downloadLabel || "Download Original";
  previewRoot.render(
    React.createElement(FilePreviewModal, {
      open: true,
      previewUrl,
      downloadUrl,
      downloadLabel,
      fileName,
      onClose: unmountPreview,
    })
  );
}
