import { describe, expect, it } from "vitest";
import {
  ACADEMIC_EXTENSION_LIST,
  describeFile,
  getFileExtension,
  previewStrategyForExtension,
} from "./fileTypeMeta";

describe("fileTypeMeta", () => {
  it("covers every academic allowlist extension with a strategy", () => {
    expect(ACADEMIC_EXTENSION_LIST.length).toBeGreaterThan(60);
    for (const ext of ACADEMIC_EXTENSION_LIST) {
      const meta = describeFile(`sample.${ext}`);
      expect(meta.ext).toBe(ext);
      expect(meta.kind).toBeTruthy();
      expect(previewStrategyForExtension(ext)).toBeTruthy();
    }
  });

  it("detects common academic extensions", () => {
    expect(getFileExtension("Homework.docx")).toBe("docx");
    expect(describeFile("marks.xlsx").kind).toBe("spreadsheet");
    expect(describeFile("slides.pptx").kind).toBe("presentation");
    expect(describeFile("brief.pdf").kind).toBe("pdf");
    expect(describeFile("main.py").kind).toBe("code");
    expect(describeFile("notes.md").kind).toBe("markdown");
    expect(describeFile("pack.zip").kind).toBe("archive");
  });
});
