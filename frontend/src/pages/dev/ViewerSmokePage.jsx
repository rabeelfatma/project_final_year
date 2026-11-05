import React, { useMemo, useState } from "react";
import FilePreviewModal from "../../components/files/FilePreviewModal";
import { ALLOWLIST_EXTS, viewerForExt } from "../../utils/viewerMatrix";

const SAMPLES = [
  { name: "Midterm_Datesheet_UG_CS_SE_Ver02.xlsx", url: "/viewer-samples/Midterm_Datesheet_UG_CS_SE_Ver02.xlsx" },
  { name: "sample.pptx", url: "/viewer-samples/sample.pptx" },
  { name: "sample.xlsx", url: "/viewer-samples/sample.xlsx" },
  { name: "sample.docx", url: "/viewer-samples/sample.docx" },
  { name: "sample.pdf", url: "/viewer-samples/sample.pdf" },
  { name: "sample.png", url: "/viewer-samples/sample.png" },
  { name: "sample.py", url: "/viewer-samples/sample.py" },
  { name: "sample.csv", url: "/viewer-samples/sample.csv" },
  { name: "sample.json", url: "/viewer-samples/sample.json" },
  { name: "sample.md", url: "/viewer-samples/sample.md" },
  { name: "sample.zip", url: "/viewer-samples/sample.zip" },
  { name: "sample.txt", url: "/viewer-samples/sample.txt" },
];

/**
 * DEV-only harness: opens the real FilePreviewModal against public sample bytes.
 * Not part of production LMS routing when import.meta.env.DEV is false.
 */
export default function ViewerSmokePage() {
  const [active, setActive] = useState(null);
  const matrix = useMemo(
    () => ALLOWLIST_EXTS.map((ext) => ({ ext, ...viewerForExt(ext) })),
    []
  );

  return (
    <div className="min-h-screen p-6" style={{ background: "var(--page)", color: "var(--text)" }}>
      <h1 className="text-xl font-bold mb-2">QC-77 Viewer Smoke (DEV)</h1>
      <p className="theme-muted text-sm mb-4">
        Opens production FilePreviewModal against `/viewer-samples/*`. Not LIVE LMS auth.
      </p>
      <div className="flex flex-wrap gap-2 mb-6">
        {SAMPLES.map((item) => (
          <button
            key={item.name}
            type="button"
            className="qc-btn qc-btn-secondary !min-h-8 !px-3"
            onClick={() => setActive(item)}
          >
            Open {item.name}
          </button>
        ))}
      </div>
      <details>
        <summary className="cursor-pointer font-bold mb-2">77-extension matrix ({matrix.length})</summary>
        <table className="qc-file-preview__table text-xs">
          <thead>
            <tr><th>Ext</th><th>Viewer</th><th>Fidelity</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.ext}>
                <td>.{row.ext}</td>
                <td>{row.viewer}</td>
                <td>{row.fidelity}</td>
                <td>{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {active && (
        <FilePreviewModal
          open
          previewUrl={active.url}
          downloadUrl={active.url}
          fileName={active.name}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}
