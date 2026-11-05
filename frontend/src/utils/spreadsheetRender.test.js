import { describe, expect, it } from "vitest";
import {
  argbToCss,
  buildMergeMaps,
  colLabel,
  excelHeightToPx,
  excelWidthToPx,
} from "./spreadsheetRender";

describe("spreadsheetRender helpers", () => {
  it("converts ARGB without inventing colors", () => {
    expect(argbToCss("FF2563EB")).toBe("#2563EB");
    expect(argbToCss("")).toBe("");
  });

  it("maps Excel widths to pixels without uniform forcing", () => {
    expect(excelWidthToPx(10.85546875)).toBe(Math.floor(10.85546875 * 7 + 5));
    expect(excelWidthToPx(26.85546875)).toBeGreaterThan(excelWidthToPx(10.85546875));
    expect(excelWidthToPx(null)).toBe(64);
  });

  it("maps row heights from points", () => {
    expect(excelHeightToPx(146.25)).toBeCloseTo(146.25 * (96 / 72));
    expect(excelHeightToPx(12.75)).toBeLessThan(excelHeightToPx(146.25));
  });

  it("builds merge skip/span maps for title blocks", () => {
    const fake = {
      _merges: {
        B1: { model: { top: 1, left: 2, bottom: 3, right: 7 } },
        A4: { model: { top: 4, left: 1, bottom: 4, right: 7 } },
      },
    };
    const { skip, span } = buildMergeMaps(fake);
    expect(span.get("1,2")).toEqual({ rowSpan: 3, colSpan: 6 });
    expect(skip.has("1,3")).toBe(true);
    expect(skip.has("2,2")).toBe(true);
    expect(skip.has("1,2")).toBe(false);
    expect(span.get("4,1")).toEqual({ rowSpan: 1, colSpan: 7 });
  });

  it("labels columns like Excel", () => {
    expect(colLabel(0)).toBe("A");
    expect(colLabel(25)).toBe("Z");
    expect(colLabel(26)).toBe("AA");
  });
});
