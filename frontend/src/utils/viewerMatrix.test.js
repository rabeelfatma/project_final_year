import { describe, expect, it } from "vitest";
import { ALLOWLIST_EXTS, VIEWER_BY_EXT, viewerForExt } from "./viewerMatrix";

/** Exact backend allowlist (must match uploadAllowlist.js). */
const BACKEND_ACADEMIC = [
  "pdf", "doc", "docx", "txt", "md", "rtf", "csv", "tsv", "json", "xml", "yaml", "yml",
  "xlsx", "xls", "ods", "pptx", "ppt", "odp", "zip", "rar", "7z", "tar", "gz",
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic", "heif", "tif", "tiff",
  "mp3", "wav", "ogg", "aac", "flac", "m4a",
  "py", "ipynb", "js", "jsx", "ts", "tsx", "cpp", "c", "h", "hpp", "java", "php", "cs",
  "swift", "go", "rs", "kt", "kts", "sql", "html", "htm", "css", "scss", "sass", "less",
  "vue", "svelte", "sh", "bat", "ps1", "rb", "r", "m", "mm", "dart", "lua", "pl",
];

describe("viewerMatrix covers exact 77 allowlist", () => {
  it("has exactly 77 extensions", () => {
    expect(ALLOWLIST_EXTS).toHaveLength(77);
    expect(BACKEND_ACADEMIC).toHaveLength(77);
  });

  it("matches backend allowlist set exactly", () => {
    expect([...ALLOWLIST_EXTS].sort()).toEqual([...BACKEND_ACADEMIC].sort());
  });

  it("assigns a viewer strategy to every extension", () => {
    for (const ext of BACKEND_ACADEMIC) {
      const entry = viewerForExt(ext);
      expect(entry, `missing viewer for .${ext}`).toBeTruthy();
      expect(entry.viewer).toBeTruthy();
      expect(VIEWER_BY_EXT[ext].notes.length).toBeGreaterThan(5);
    }
  });

  it("uses visual engines for pptx/xlsx/docx", () => {
    expect(viewerForExt("pptx").viewer).toBe("pptx-wasm");
    expect(viewerForExt("xlsx").viewer).toBe("exceljs");
    expect(viewerForExt("docx").viewer).toBe("mammoth");
  });

  it("does not falsely claim visual preview for legacy office / odp", () => {
    for (const ext of ["ppt", "doc", "xls", "odp", "ods"]) {
      expect(viewerForExt(ext).viewer).toBe("download-only");
    }
  });
});
