/**
 * ExcelJS → CSS helpers for high-fidelity spreadsheet preview.
 * Column widths use Excel character units; row heights / fonts use points.
 */

export function argbToCss(argb) {
  if (!argb) return "";
  const raw = String(argb).trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(raw)) return raw;
  if (/^#[0-9A-Fa-f]{8}$/.test(raw)) return `#${raw.slice(3)}`;
  if (/^[0-9A-Fa-f]{8}$/i.test(raw)) return `#${raw.slice(2)}`;
  if (/^[0-9A-Fa-f]{6}$/i.test(raw)) return `#${raw}`;
  return "";
}

/** Excel column width (characters) → CSS pixels (Calibri/Arial approx). */
export function excelWidthToPx(width) {
  if (width == null || !Number.isFinite(Number(width))) return 64;
  const w = Number(width);
  return Math.max(12, Math.floor(w * 7 + 5));
}

/** Excel row height (points) → CSS pixels at 96dpi. */
export function excelHeightToPx(height) {
  if (height == null || !Number.isFinite(Number(height))) return 20;
  return Math.max(4, Number(height) * (96 / 72));
}

const BORDER_WIDTH = {
  hair: "1px",
  thin: "1px",
  dotted: "1px",
  dashDotDot: "1px",
  dashDot: "1px",
  dashed: "1px",
  medium: "2px",
  mediumDashed: "2px",
  mediumDashDot: "2px",
  mediumDashDotDot: "2px",
  slantDashDot: "1px",
  thick: "3px",
  double: "3px",
};

function borderCss(side) {
  if (!side?.style) return "";
  const width = BORDER_WIDTH[side.style] || "1px";
  const color = argbToCss(side.color?.argb) || "#000000";
  const style =
    side.style === "double" ? "double"
      : /dash|dot/i.test(side.style) ? "dashed"
        : "solid";
  return `${width} ${style} ${color}`;
}

export function displayValue(cell) {
  if (cell == null || cell.value == null || cell.value === "") return "";
  const v = cell.value;
  if (typeof v === "object") {
    if (v.richText) return v.richText.map((p) => p.text).join("");
    if (v.text != null && v.hyperlink) return String(v.text);
    if (v.text != null) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v.formula != null) return String(v.result ?? `=${v.formula}`);
    if (v instanceof Date) return v.toLocaleString();
    if (v.error) return String(v.error);
  }
  return String(v);
}

export function cellStyle(cell) {
  const style = {};
  const fill = cell.fill;
  if (fill?.type === "pattern" && fill.pattern && fill.pattern !== "none") {
    const fg = argbToCss(fill.fgColor?.argb);
    if (fg) style.backgroundColor = fg;
  }

  const font = cell.font || {};
  if (font.name) style.fontFamily = `"${font.name}", Arial, sans-serif`;
  if (font.size != null && Number.isFinite(Number(font.size))) {
    // Exact Excel point size — never floor-up to 11px.
    style.fontSize = `${Number(font.size)}pt`;
  }
  if (font.bold) style.fontWeight = 700;
  if (font.italic) style.fontStyle = "italic";
  if (font.underline) style.textDecoration = "underline";
  if (font.strike) {
    style.textDecoration = style.textDecoration
      ? `${style.textDecoration} line-through`
      : "line-through";
  }
  const fontColor = argbToCss(font.color?.argb);
  if (fontColor) style.color = fontColor;

  const align = cell.alignment || {};
  if (align.horizontal === "center" || align.horizontal === "centerContinuous") {
    style.textAlign = "center";
  } else if (align.horizontal === "right") {
    style.textAlign = "right";
  } else if (align.horizontal === "justify" || align.horizontal === "distributed") {
    style.textAlign = "justify";
  } else if (align.horizontal === "left" || align.horizontal === "general") {
    style.textAlign = "left";
  }

  if (align.vertical === "top") style.verticalAlign = "top";
  else if (align.vertical === "bottom") style.verticalAlign = "bottom";
  else if (align.vertical === "middle" || align.vertical === "center") style.verticalAlign = "middle";

  if (align.wrapText) {
    style.whiteSpace = "pre-wrap";
    style.overflowWrap = "break-word";
    style.wordBreak = "break-word";
  } else if (align.shrinkToFit) {
    style.whiteSpace = "nowrap";
  } else {
    style.whiteSpace = "pre";
  }

  if (align.textRotation != null && Number(align.textRotation) !== 0) {
    const rot = Number(align.textRotation);
    if (rot === 255) {
      style.writingMode = "vertical-rl";
    } else if (Number.isFinite(rot)) {
      style.transform = `rotate(${-rot}deg)`;
    }
  }

  const border = cell.border || {};
  const top = borderCss(border.top);
  const left = borderCss(border.left);
  const bottom = borderCss(border.bottom);
  const right = borderCss(border.right);
  if (top) style.borderTop = top;
  if (left) style.borderLeft = left;
  if (bottom) style.borderBottom = bottom;
  if (right) style.borderRight = right;

  return style;
}

export function colLabel(indexZeroBased) {
  let n = indexZeroBased;
  let label = "";
  while (n >= 0) {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/**
 * Build merge skip/span maps from ExcelJS worksheet._merges.
 * @returns {{ skip: Set<string>, span: Map<string, { rowSpan: number, colSpan: number }> }}
 */
export function buildMergeMaps(worksheet) {
  const skip = new Set();
  const span = new Map();
  const merges = worksheet?._merges || {};
  Object.keys(merges).forEach((key) => {
    const entry = merges[key];
    const model = entry?.model || entry;
    if (!model) return;
    const top = Number(model.top);
    const left = Number(model.left);
    const bottom = Number(model.bottom);
    const right = Number(model.right);
    if (![top, left, bottom, right].every(Number.isFinite)) return;
    span.set(`${top},${left}`, {
      rowSpan: bottom - top + 1,
      colSpan: right - left + 1,
    });
    for (let r = top; r <= bottom; r += 1) {
      for (let c = left; c <= right; c += 1) {
        if (r === top && c === left) continue;
        skip.add(`${r},${c}`);
      }
    }
  });
  return { skip, span };
}

export function parseFreeze(worksheet) {
  const view = Array.isArray(worksheet?.views) ? worksheet.views[0] : null;
  if (!view || view.state !== "frozen") {
    return { freezeRows: 0, freezeCols: 0 };
  }
  return {
    freezeRows: Number(view.ySplit) || 0,
    freezeCols: Number(view.xSplit) || 0,
  };
}

/**
 * Parse one ExcelJS worksheet into a render model.
 */
export function parseWorksheet(ws, options = {}) {
  const maxRows = options.maxRows ?? 500;
  const maxCols = options.maxCols ?? 100;
  const { skip, span } = buildMergeMaps(ws);
  const { freezeRows, freezeCols } = parseFreeze(ws);

  const actualRows = Math.min(Math.max(ws.rowCount || 0, 1), maxRows);
  const actualCols = Math.min(Math.max(ws.columnCount || 0, 1), maxCols);

  const colMeta = [];
  for (let c = 1; c <= actualCols; c += 1) {
    const col = ws.getColumn(c);
    colMeta.push({
      index: c,
      widthPx: excelWidthToPx(col.width),
      hidden: Boolean(col.hidden),
      label: colLabel(c - 1),
    });
  }

  const rowHeightsPx = [];
  for (let r = 1; r <= actualRows; r += 1) {
    rowHeightsPx[r] = excelHeightToPx(ws.getRow(r).height);
  }

  const rows = [];
  for (let r = 1; r <= actualRows; r += 1) {
    const row = ws.getRow(r);
    const cells = [];
    for (let c = 1; c <= actualCols; c += 1) {
      const key = `${r},${c}`;
      if (skip.has(key)) {
        cells.push({ skip: true });
        continue;
      }
      const cell = row.getCell(c);
      const merge = span.get(key);
      const rowSpan = merge?.rowSpan || 1;
      const colSpan = merge?.colSpan || 1;
      let mergeHeightPx = rowHeightsPx[r];
      if (rowSpan > 1) {
        mergeHeightPx = 0;
        for (let rr = r; rr < r + rowSpan && rr <= actualRows; rr += 1) {
          mergeHeightPx += rowHeightsPx[rr] || 20;
        }
      }
      cells.push({
        skip: false,
        text: displayValue(cell),
        style: cellStyle(cell),
        rowSpan,
        colSpan,
        mergeHeightPx,
      });
    }
    rows.push({
      index: r,
      heightPx: rowHeightsPx[r],
      hidden: Boolean(row.hidden),
      cells,
    });
  }

  return {
    name: ws.name || "Sheet",
    rows,
    colMeta,
    freezeRows,
    freezeCols,
    showGridLines: ws.views?.[0]?.showGridLines !== false,
  };
}
