import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseWorksheet } from "./spreadsheetRender";

const fixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "Midterm_Datesheet_UG_CS_SE_Ver02.xlsx"
);

describe("Midterm datesheet XLSX parse fidelity", () => {
  it("preserves merges, widths, heights, wrap and hidden column A", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(readFileSync(fixture));
    const ws = workbook.worksheets[0];
    const model = parseWorksheet(ws);

    expect(model.name).toMatch(/Midterm/i);
    expect(model.colMeta[0].hidden).toBe(true);
    expect(model.colMeta[3].widthPx).toBeGreaterThan(model.colMeta[1].widthPx);

    const title = model.rows[0].cells[1];
    expect(title.skip).toBe(false);
    expect(title.rowSpan).toBe(3);
    expect(title.colSpan).toBe(6);
    expect(title.text).toMatch(/COMSATS University Islamabad/);
    expect(title.style.fontSize).toBe("24pt");
    expect(title.style.fontWeight).toBe(700);
    expect(title.style.whiteSpace).toBe("pre-wrap");
    expect(title.mergeHeightPx).toBeGreaterThan(title.style.fontSize ? 40 : 0);

    // Slave cell under title merge is skipped
    expect(model.rows[0].cells[2].skip).toBe(true);
    expect(model.rows[1].cells[1].skip).toBe(true);

    const day = model.rows[6].cells[1];
    expect(day.text).toMatch(/Tuesday/);
    expect(day.rowSpan).toBeGreaterThan(10);
    expect(day.style.fontSize).toBe("10pt");

    const course = model.rows[6].cells[3];
    expect(course.text).toMatch(/Artificial Intelligence/);
    expect(course.style.whiteSpace).toBe("pre-wrap");
    expect(course.text.includes("\n")).toBe(true);

    // Row height for content rows must stay large (not collapsed)
    expect(model.rows[6].heightPx).toBeGreaterThan(100);
  });
});
