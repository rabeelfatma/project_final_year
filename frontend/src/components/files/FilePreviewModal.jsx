import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Copy,
  Download,
  Loader2,
  Maximize2,
  RotateCw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { describeFile } from "../../utils/fileTypeMeta";
import { getAuthHeader } from "../../utils/authToken";
import {
  downloadProtectedFile,
  fetchProtectedArrayBuffer,
} from "../../services/fileService";
import {
  highlightCode,
  parseDelimitedTable,
  renderMarkdownLite,
} from "../../utils/syntaxHighlight";
import PptxVisualViewer from "./PptxVisualViewer";
import SpreadsheetVisualViewer from "./SpreadsheetVisualViewer";
import DocxVisualViewer from "./DocxVisualViewer";

const VISUAL_PPTX = new Set(["pptx"]);
const VISUAL_SHEET = new Set(["xlsx"]);
const VISUAL_DOC = new Set(["docx"]);
const LEGACY_OFFICE = new Set(["doc", "ppt", "xls", "rtf", "odp", "ods"]);

/**
 * Professional LMS file viewer. Uses authenticated preview/download URLs only.
 * Never executes uploaded code. PPTX/XLSX/DOCX use client-side visual engines.
 */
export default function FilePreviewModal({
  open,
  previewUrl,
  downloadUrl,
  fileName = "File preview",
  onClose,
}) {
  const meta = useMemo(() => describeFile(fileName), [fileName]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [objectUrl, setObjectUrl] = useState("");
  const [mode, setMode] = useState("unknown");
  const [textBody, setTextBody] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [tableRows, setTableRows] = useState([]);
  const [notebookCells, setNotebookCells] = useState([]);
  const [officeBuffer, setOfficeBuffer] = useState(null);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageRotate, setImageRotate] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open || !previewUrl) return undefined;
    let cancelled = false;
    let createdUrl = "";

    const load = async () => {
      setStatus("loading");
      setError("");
      setObjectUrl("");
      setTextBody("");
      setHtmlBody("");
      setTableRows([]);
      setNotebookCells([]);
      setOfficeBuffer(null);
      setImageZoom(1);
      setImageRotate(0);
      setCopied(false);

      const ext = meta.ext;
      const kind = meta.kind;
      const binaryUrl = downloadUrl || previewUrl;

      try {
        // —— Visual Office engines (original bytes, not text-extracted HTML) ——
        if (VISUAL_PPTX.has(ext)) {
          if (!binaryUrl) throw new Error("No download URL for PowerPoint preview.");
          const buffer = await fetchProtectedArrayBuffer(binaryUrl);
          if (cancelled) return;
          setOfficeBuffer(buffer);
          setMode("pptx-visual");
          setStatus("ready");
          return;
        }

        if (VISUAL_SHEET.has(ext)) {
          if (!binaryUrl) throw new Error("No download URL for spreadsheet preview.");
          const buffer = await fetchProtectedArrayBuffer(binaryUrl);
          if (cancelled) return;
          setOfficeBuffer(buffer);
          setMode("sheet-visual");
          setStatus("ready");
          return;
        }

        if (VISUAL_DOC.has(ext)) {
          if (!binaryUrl) throw new Error("No download URL for document preview.");
          const buffer = await fetchProtectedArrayBuffer(binaryUrl);
          if (cancelled) return;
          setOfficeBuffer(buffer);
          setMode("docx-visual");
          setStatus("ready");
          return;
        }

        if (LEGACY_OFFICE.has(ext)) {
          // Honest fallbacks: attempt backend HTML preview when available.
          const response = await fetch(previewUrl, {
            headers: { ...getAuthHeader() },
          });
          const type = (response.headers.get("content-type") || "").toLowerCase();
          if (response.ok && type.includes("text/html")) {
            const html = await response.blob().then((b) => b.text());
            if (cancelled) return;
            const looksUnavailable =
              /preview unavailable|cannot be previewed|cannot be rendered|download the original/i.test(html) &&
              !/<table|<section class="qc-slide"|qc-sheet-tabs|mammoth|class="content"/i.test(html);
            if (!looksUnavailable) {
              setHtmlBody(html);
              setMode("html");
              setStatus("ready");
              return;
            }
          }
          if (cancelled) return;
          const messages = {
            ppt: "Legacy .ppt cannot be visually rendered in the browser. Download the original and open it in PowerPoint or LibreOffice.",
            odp: "OpenDocument Presentation (.odp) has no reliable in-browser visual slide engine here. Download the original file.",
            doc: "Legacy .doc cannot be visually rendered in the browser. Download the original and open it in Word or LibreOffice.",
            rtf: "RTF visual fidelity is limited in-browser. Download the original for full formatting.",
            xls: "Legacy .xls visual cell rendering is not supported in-browser. Download the original, or convert to .xlsx.",
            ods: "OpenDocument Spreadsheet (.ods) visual preview is not supported in-browser. Download the original file.",
          };
          setError(messages[ext] || "Preview unavailable for this format.");
          setMode("unavailable");
          setStatus("unavailable");
          return;
        }

        const response = await fetch(previewUrl, {
          headers: { ...getAuthHeader() },
        });
        const type = (response.headers.get("content-type") || "").toLowerCase();

        if (!response.ok) {
          let message = "Preview unavailable for this file.";
          try {
            const data = await response.json();
            message = data.message || message;
          } catch (_) {
            try { await response.text(); } catch (_e) { /* ignore */ }
          }
          if (!cancelled) {
            setError(message);
            setMode("unavailable");
            setStatus("unavailable");
          }
          return;
        }

        const blob = await response.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);

        if (type.includes("application/pdf") || ext === "pdf") {
          setMode("pdf");
        } else if (type.startsWith("image/") || kind === "image") {
          setMode("image");
        } else if (type.startsWith("audio/") || kind === "audio") {
          setMode("audio");
        } else if (type.includes("text/html")) {
          const html = await blob.text();
          const looksUnavailable =
            /preview unavailable|cannot be previewed|cannot be rendered|download the original/i.test(html) &&
            !/<table|<section class="qc-slide"|qc-sheet-tabs|qc-zip-list|mammoth|class="content"/i.test(html);
          if (looksUnavailable) {
            setMode("unavailable");
            setError("Preview unavailable for this format.");
          } else {
            setHtmlBody(html);
            setMode("html");
          }
        } else if (kind === "table" || ext === "csv" || ext === "tsv") {
          const text = await blob.text();
          setTableRows(parseDelimitedTable(text, ext === "tsv" ? "\t" : ","));
          setMode("table");
        } else if (kind === "markdown" || ext === "md") {
          setTextBody(await blob.text());
          setMode("markdown");
        } else if (kind === "notebook" || ext === "ipynb") {
          const raw = await blob.text();
          try {
            const nb = JSON.parse(raw);
            const cells = Array.isArray(nb.cells)
              ? nb.cells.slice(0, 80).map((cell, index) => ({
                  id: index,
                  type: cell.cell_type || "code",
                  source: Array.isArray(cell.source) ? cell.source.join("") : String(cell.source || ""),
                  outputs: Array.isArray(cell.outputs)
                    ? cell.outputs.slice(0, 5).map((out) => {
                        if (out.text) return Array.isArray(out.text) ? out.text.join("") : String(out.text);
                        if (out.data?.["text/plain"]) {
                          const t = out.data["text/plain"];
                          return Array.isArray(t) ? t.join("") : String(t);
                        }
                        return "";
                      }).filter(Boolean)
                    : [],
                }))
              : [];
            setNotebookCells(cells);
            setMode(cells.length ? "notebook" : "code");
            if (!cells.length) setTextBody(raw);
          } catch (_) {
            setTextBody(raw);
            setMode("code");
          }
        } else if (kind === "json" || type.includes("json")) {
          const raw = await blob.text();
          try {
            setTextBody(JSON.stringify(JSON.parse(raw), null, 2));
          } catch (_) {
            setTextBody(raw);
          }
          setMode("code");
        } else if (kind === "xml" || kind === "yaml" || kind === "code" || kind === "text" ||
                   type.startsWith("text/") || type.includes("xml")) {
          setTextBody(await blob.text());
          setMode(kind === "text" && ext === "txt" ? "text" : "code");
        } else if (kind === "archive" || ["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
          if (type.includes("text/html")) {
            setHtmlBody(await blob.text());
            setMode("html");
          } else if (ext === "zip" || type.includes("zip")) {
            // Safe client listing only — never extract or execute members.
            const JSZip = (await import("jszip")).default;
            const zip = await JSZip.loadAsync(await blob.arrayBuffer());
            const rows = [];
            zip.forEach((relativePath, entry) => {
              rows.push({
                name: relativePath,
                size: entry._data?.uncompressedSize ?? entry.uncompressedSize ?? "",
                dir: entry.dir,
              });
            });
            const listHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
              body{font:13px/1.45 system-ui,sans-serif;background:#0b1220;color:#e2e8f0;margin:0;padding:16px}
              h1{font-size:15px;margin:0 0 12px} table{border-collapse:collapse;width:100%}
              th,td{border-bottom:1px solid #243041;padding:8px;text-align:left} th{color:#94a3b8}
              .note{color:#94a3b8;font-size:12px;margin-top:12px}
            </style></head><body>
              <h1>Archive listing (read-only)</h1>
              <table><thead><tr><th>Name</th><th>Size</th><th>Type</th></tr></thead><tbody>
              ${rows.map((r) => `<tr><td>${r.name}</td><td>${r.size || "—"}</td><td>${r.dir ? "folder" : "file"}</td></tr>`).join("")}
              </tbody></table>
              <p class="note">Members are listed only. Nothing is extracted or executed in the browser.</p>
            </body></html>`;
            setHtmlBody(listHtml);
            setMode("html");
          } else {
            setMode("unavailable");
            setError("Archive contents cannot be listed for this format. Download the original file.");
          }
        } else {
          setMode("unavailable");
          setError("Preview unavailable for this format.");
        }
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "File preview failed.");
          setMode("unavailable");
          setStatus("unavailable");
        }
      }
    };

    load();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [open, previewUrl, downloadUrl, meta.ext, meta.kind]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleDownload = async () => {
    if (!downloadUrl) return;
    try {
      await downloadProtectedFile(downloadUrl, meta.name);
    } catch (err) {
      alert(err.message || "Download failed.");
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textBody || "");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (_) {
      alert("Could not copy to clipboard.");
    }
  };

  const toggleFullscreen = () => {
    const node = document.querySelector(".qc-file-preview");
    if (!node) return;
    if (!document.fullscreenElement) node.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const highlighted = useMemo(
    () => (mode === "code" ? highlightCode(textBody, meta.language || (meta.ext === "json" ? "javascript" : meta.ext === "xml" ? "html" : "plaintext")) : ""),
    [mode, textBody, meta.language, meta.ext]
  );

  const lineCount = textBody ? textBody.split(/\r?\n/).length : 0;

  return createPortal(
    <div
      className="qc-file-preview-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="qc-file-preview" role="dialog" aria-modal="true" aria-label={`Preview ${meta.name}`}>
        <header className="qc-file-preview__header">
          <div className="min-w-0">
            <p className="qc-file-preview__title">{meta.name}</p>
            <p className="qc-file-preview__subtitle">{meta.label} · {meta.displayType}</p>
          </div>
          <div className="qc-file-preview__actions">
            {mode === "image" && (
              <>
                <button type="button" className="qc-icon-btn" onClick={() => setImageZoom((z) => Math.min(4, z + 0.25))} title="Zoom in" aria-label="Zoom in"><ZoomIn size={16} /></button>
                <button type="button" className="qc-icon-btn" onClick={() => setImageZoom((z) => Math.max(0.4, z - 0.25))} title="Zoom out" aria-label="Zoom out"><ZoomOut size={16} /></button>
                <button type="button" className="qc-icon-btn" onClick={() => setImageRotate((r) => (r + 90) % 360)} title="Rotate" aria-label="Rotate"><RotateCw size={16} /></button>
              </>
            )}
            {(mode === "pdf" || mode === "html" || mode === "image" || mode === "pptx-visual") && (
              <button type="button" className="qc-icon-btn" onClick={toggleFullscreen} title="Fullscreen" aria-label="Fullscreen"><Maximize2 size={16} /></button>
            )}
            {mode === "code" && textBody && (
              <button type="button" className="qc-btn qc-btn-ghost !min-h-8 !px-3" onClick={handleCopy}>
                <Copy size={14} /> {copied ? "Copied" : "Copy code"}
              </button>
            )}
            {downloadUrl ? (
              <button type="button" className="qc-btn qc-btn-secondary !min-h-8 !px-3" onClick={handleDownload}>
                <Download size={14} /> Download Original
              </button>
            ) : null}
            <button type="button" className="qc-icon-btn" onClick={onClose} aria-label="Close preview"><X size={18} /></button>
          </div>
        </header>

        <div className="qc-file-preview__body">
          {status === "loading" && (
            <div className="qc-file-preview__empty">
              <Loader2 className="animate-spin" size={22} />
              <p>Loading preview…</p>
            </div>
          )}

          {status !== "loading" && mode === "pptx-visual" && officeBuffer && (
            <PptxVisualViewer arrayBuffer={officeBuffer} fileName={meta.name} />
          )}

          {status !== "loading" && mode === "sheet-visual" && officeBuffer && (
            <SpreadsheetVisualViewer arrayBuffer={officeBuffer} fileName={meta.name} />
          )}

          {status !== "loading" && mode === "docx-visual" && officeBuffer && (
            <DocxVisualViewer arrayBuffer={officeBuffer} fileName={meta.name} />
          )}

          {status !== "loading" && mode === "pdf" && objectUrl && (
            <iframe title={meta.name} src={objectUrl} className="qc-file-preview__frame" />
          )}

          {status !== "loading" && mode === "image" && objectUrl && (
            <div className="qc-file-preview__image-wrap">
              <img
                src={objectUrl}
                alt={meta.name}
                className="qc-file-preview__image"
                style={{ transform: `scale(${imageZoom}) rotate(${imageRotate}deg)` }}
                onError={() => {
                  setMode("unavailable");
                  setError("This image format cannot be displayed in this browser. Download the original file.");
                }}
              />
            </div>
          )}

          {status !== "loading" && mode === "audio" && objectUrl && (
            <div className="qc-file-preview__media">
              <p className="qc-file-preview__subtitle mb-3">{meta.name}</p>
              <audio controls src={objectUrl} className="w-full" />
            </div>
          )}

          {status !== "loading" && mode === "html" && htmlBody && (
            <iframe
              title={meta.name}
              className="qc-file-preview__frame"
              srcDoc={htmlBody}
              sandbox="allow-scripts allow-same-origin"
            />
          )}

          {status !== "loading" && mode === "markdown" && (
            <div
              className="qc-file-preview__markdown"
              dangerouslySetInnerHTML={{ __html: renderMarkdownLite(textBody) }}
            />
          )}

          {status !== "loading" && mode === "table" && (
            <div className="qc-file-preview__table-wrap">
              <table className="qc-file-preview__table">
                <tbody>
                  {tableRows.map((row, rowIndex) => (
                    <tr key={`r-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        rowIndex === 0
                          ? <th key={`c-${cellIndex}`}>{cell}</th>
                          : <td key={`c-${cellIndex}`}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!tableRows.length && <p className="theme-muted p-4">No table rows found.</p>}
            </div>
          )}

          {status !== "loading" && mode === "notebook" && (
            <div className="qc-file-preview__notebook">
              {notebookCells.map((cell) => (
                <article key={cell.id} className="qc-file-preview__nb-cell">
                  <p className="qc-file-preview__subtitle">{cell.type} cell</p>
                  <pre className="qc-file-preview__text">{cell.source || "(empty)"}</pre>
                  {cell.outputs?.length > 0 && (
                    <div className="qc-file-preview__nb-out">
                      {cell.outputs.map((out, i) => (
                        <pre key={`o-${i}`} className="qc-file-preview__text theme-muted">{out}</pre>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {status !== "loading" && mode === "code" && (
            <div className="qc-code-viewer">
              <div className="qc-code-viewer__gutter" aria-hidden="true">
                {Array.from({ length: lineCount }, (_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
              <pre className="qc-code-viewer__code">
                <code dangerouslySetInnerHTML={{ __html: highlighted || " " }} />
              </pre>
            </div>
          )}

          {status !== "loading" && mode === "text" && (
            <pre className="qc-file-preview__text">{textBody}</pre>
          )}

          {status !== "loading" && mode === "unavailable" && (
            <div className="qc-file-preview__empty">
              <p className="qc-file-preview__title">Preview unavailable</p>
              <p className="qc-file-preview__subtitle mt-2">{meta.name} · {meta.label}</p>
              <p className="theme-muted text-sm mt-3 max-w-md text-center">
                {error || "This format cannot be previewed in the browser. Use Download Original to keep the exact file."}
              </p>
              {downloadUrl ? (
                <button type="button" className="qc-btn qc-btn-primary mt-4" onClick={handleDownload}>
                  <Download size={14} /> Download Original
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
