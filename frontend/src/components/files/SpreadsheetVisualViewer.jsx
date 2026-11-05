import React, { useEffect, useMemo, useState } from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import ExcelJS from "exceljs";
import { parseWorksheet } from "../../utils/spreadsheetRender";

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

/**
 * High-fidelity XLSX spreadsheet viewer (ExcelJS).
 * Preserves column widths, row heights, merges, fonts (pt), wraps, fills, borders.
 * Zoom is CSS-only and does not mutate workbook bytes.
 */
export default function SpreadsheetVisualViewer({ arrayBuffer, fileName = "workbook.xlsx" }) {
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [sheets, setSheets] = useState([]);
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setStatus("loading");
      setError("");
      setZoom(1);
      try {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        if (cancelled) return;
        const parsed = workbook.worksheets.map((ws) => parseWorksheet(ws));
        setSheets(parsed.length ? parsed : [{
          name: "Sheet1",
          rows: [],
          colMeta: [],
          freezeRows: 0,
          freezeCols: 0,
          showGridLines: true,
        }]);
        setActive(0);
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Spreadsheet visual preview failed.");
          setStatus("error");
        }
      }
    };
    load();
    return () => { cancelled = true; };
  }, [arrayBuffer]);

  const sheet = sheets[active] || sheets[0];

  const visibleCols = useMemo(
    () => (sheet?.colMeta || []).filter((c) => !c.hidden),
    [sheet]
  );

  const bumpZoom = (delta) => {
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));
  };

  if (status === "loading") {
    return (
      <div className="qc-file-preview__empty">
        <Loader2 className="animate-spin" size={22} />
        <p>Rendering spreadsheet…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="qc-file-preview__empty">
        <p className="qc-file-preview__title">Spreadsheet preview failed</p>
        <p className="theme-muted text-sm mt-2">{error}</p>
        <p className="theme-muted text-xs mt-2">{fileName}</p>
      </div>
    );
  }

  const freezeRows = sheet?.freezeRows || 0;
  const freezeCols = sheet?.freezeCols || 0;
  const gridClass = sheet?.showGridLines === false
    ? "qc-sheet-viewer__grid qc-sheet-viewer__grid--nogrid"
    : "qc-sheet-viewer__grid";

  return (
    <div className="qc-sheet-viewer">
      <div className="qc-sheet-viewer__toolbar">
        <div className="qc-sheet-viewer__tabs" role="tablist" aria-label="Worksheets">
          {sheets.map((item, index) => (
            <button
              key={`${item.name}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === active}
              className={`qc-sheet-viewer__tab ${index === active ? "is-active" : ""}`}
              onClick={() => setActive(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="qc-sheet-viewer__zoom" aria-label="Zoom">
          <button type="button" className="qc-icon-btn" onClick={() => bumpZoom(-ZOOM_STEP)} title="Zoom out" aria-label="Zoom out">
            <ZoomOut size={16} />
          </button>
          <span className="qc-sheet-viewer__zoom-label">{Math.round(zoom * 100)}%</span>
          <button type="button" className="qc-icon-btn" onClick={() => bumpZoom(ZOOM_STEP)} title="Zoom in" aria-label="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button type="button" className="qc-btn qc-btn-ghost !min-h-7 !px-2 !text-xs" onClick={() => setZoom(1)}>
            Reset
          </button>
        </div>
      </div>

      <div className="qc-sheet-viewer__grid-wrap">
        <div
          className="qc-sheet-viewer__scale"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            width: `${100 / zoom}%`,
          }}
        >
          <table className={gridClass}>
            <colgroup>
              <col style={{ width: 40 }} />
              {visibleCols.map((col) => (
                <col key={`col-${col.index}`} style={{ width: col.widthPx }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="qc-sheet-viewer__corner" />
                {visibleCols.map((col, visIdx) => (
                  <th
                    key={`h-${col.index}`}
                    className="qc-sheet-viewer__colhead"
                    style={{
                      width: col.widthPx,
                      minWidth: col.widthPx,
                      maxWidth: col.widthPx,
                      // Sticky column headers only when the workbook freezes panes.
                      position: freezeRows > 0 || (freezeCols > 0 && visIdx < freezeCols) ? "sticky" : "static",
                      top: freezeRows > 0 ? 0 : undefined,
                      left: freezeCols && visIdx < freezeCols
                        ? 40 + visibleCols.slice(0, visIdx).reduce((s, c) => s + c.widthPx, 0)
                        : undefined,
                      zIndex: freezeCols && visIdx < freezeCols ? 4 : freezeRows > 0 ? 3 : undefined,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(sheet.rows || []).map((row) => {
                if (row.hidden) return null;
                return (
                  <tr key={`r-${row.index}`} style={{ minHeight: row.heightPx }}>
                    <th
                      className="qc-sheet-viewer__rowhead"
                      style={{
                        minHeight: row.heightPx,
                        height: row.heightPx,
                        top: freezeRows && row.index <= freezeRows ? 24 : undefined,
                        position: freezeRows && row.index <= freezeRows ? "sticky" : "sticky",
                        zIndex: freezeRows && row.index <= freezeRows ? 3 : 2,
                      }}
                    >
                      {row.index}
                    </th>
                    {row.cells.map((cell, cIdx) => {
                      const col = sheet.colMeta[cIdx];
                      if (!col || col.hidden) return null;
                      if (cell.skip) return null;
                      const visIdx = visibleCols.findIndex((c) => c.index === col.index);
                      const stickyCol = freezeCols && visIdx >= 0 && visIdx < freezeCols;
                      const stickyRow = freezeRows && row.index <= freezeRows;
                      return (
                        <td
                          key={`c-${row.index}-${col.index}`}
                          rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                          colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                          style={{
                            ...cell.style,
                            width: cell.colSpan > 1
                              ? visibleCols
                                .slice(Math.max(0, visIdx), Math.max(0, visIdx) + cell.colSpan)
                                .reduce((s, c) => s + c.widthPx, 0)
                              : col.widthPx,
                            minWidth: col.widthPx,
                            // Prefer workbook height; for wrapped text use minHeight so content is not clipped.
                            minHeight: cell.mergeHeightPx || row.heightPx,
                            height: cell.style?.whiteSpace === "pre-wrap"
                              ? undefined
                              : (cell.mergeHeightPx || row.heightPx),
                            left: stickyCol
                              ? 40 + visibleCols.slice(0, visIdx).reduce((s, c) => s + c.widthPx, 0)
                              : undefined,
                            top: stickyRow ? 24 : undefined,
                            position: stickyCol || stickyRow ? "sticky" : undefined,
                            zIndex: stickyCol && stickyRow ? 5 : stickyCol || stickyRow ? 2 : undefined,
                          }}
                        >
                          {cell.text}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!sheet.rows?.length && <p className="theme-muted p-4">This sheet has no cells to display.</p>}
        </div>
      </div>
    </div>
  );
}
