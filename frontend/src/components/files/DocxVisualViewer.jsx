import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import mammoth from "mammoth";

/**
 * Formatted DOCX document viewer via Mammoth HTML conversion in the browser.
 */
export default function DocxVisualViewer({ arrayBuffer, fileName = "document.docx" }) {
  const [status, setStatus] = useState("loading");
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStatus("loading");
      try {
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (cancelled) return;
        setHtml(result.value || "<p>(Empty document)</p>");
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Document preview failed.");
          setStatus("error");
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [arrayBuffer]);

  if (status === "loading") {
    return (
      <div className="qc-file-preview__empty">
        <Loader2 className="animate-spin" size={22} />
        <p>Rendering document…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="qc-file-preview__empty">
        <p className="qc-file-preview__title">Document preview failed</p>
        <p className="theme-muted text-sm mt-2">{error}</p>
        <p className="theme-muted text-xs mt-2">{fileName}</p>
      </div>
    );
  }

  return (
    <div className="qc-docx-viewer">
      <article
        className="qc-docx-viewer__page"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
