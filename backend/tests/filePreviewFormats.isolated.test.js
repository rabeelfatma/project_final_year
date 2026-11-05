const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const XLSX = require("xlsx");
const AdmZip = require("adm-zip");

/**
 * Isolated checks that office preview builders produce structured HTML
 * (tables / slides) instead of raw binary dumps.
 */
describe("file preview format helpers (isolated)", () => {
  it("xlsx package can emit HTML tables for workbook sheets", () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Name", "Score"],
      ["Ada", 95],
      ["Grace", 88],
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Results");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-xlsx-"));
    const filePath = path.join(dir, "results.xlsx");
    XLSX.writeFile(workbook, filePath);
    const loaded = XLSX.readFile(filePath);
    const html = XLSX.utils.sheet_to_html(loaded.Sheets.Results);
    assert.match(html, /<table/i);
    assert.match(html, /Ada/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("pptx zip entries expose slide XML for slide-based previews", () => {
    const zip = new AdmZip();
    zip.addFile(
      "ppt/slides/slide1.xml",
      Buffer.from('<p:sld><a:t>Hello slide</a:t></p:sld>', "utf8")
    );
    zip.addFile(
      "ppt/slides/slide2.xml",
      Buffer.from('<p:sld><a:t>Second</a:t></p:sld>', "utf8")
    );
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-pptx-"));
    const filePath = path.join(dir, "deck.pptx");
    zip.writeZip(filePath);
    const archive = new AdmZip(filePath);
    const slides = archive
      .getEntries()
      .filter((entry) => /ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
    assert.equal(slides.length, 2);
    assert.match(slides[0].getData().toString("utf8"), /Hello slide/);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("zip listing can enumerate member names without extracting payloads for preview", () => {
    const zip = new AdmZip();
    zip.addFile("readme.txt", Buffer.from("hello", "utf8"));
    zip.addFile("nested/data.json", Buffer.from("{}", "utf8"));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qc-zip-"));
    const filePath = path.join(dir, "bundle.zip");
    zip.writeZip(filePath);
    const archive = new AdmZip(filePath);
    const names = archive.getEntries().map((e) => e.entryName);
    assert.ok(names.includes("readme.txt"));
    assert.ok(names.includes("nested/data.json"));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("academic allowlist remains the source of truth for durable uploads", () => {
    const allowlist = require("../utils/uploadAllowlist");
    assert.ok(allowlist.ACADEMIC_EXTENSIONS.includes(".pdf"));
    assert.ok(allowlist.ACADEMIC_EXTENSIONS.includes(".docx"));
    assert.ok(allowlist.ACADEMIC_EXTENSIONS.includes(".py"));
    assert.ok(allowlist.ACADEMIC_EXTENSIONS.includes(".heic"));
    assert.equal(allowlist.isAllowedAcademicExtension("clip.mp4"), false);
  });
});
