/**
 * Local sample files for LMS viewer smoke checks.
 * Run: node scripts/generateViewerSamples.js
 */
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const AdmZip = require("adm-zip");
const mammoth = require("mammoth");

const dir = path.join(__dirname, "..", "tmp-viewer-samples");
fs.mkdirSync(dir, { recursive: true });

async function main() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Name", "Score"],
    ["Ada", 95],
    ["Grace", 88],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Scores");
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["Second sheet"]]),
    "Notes"
  );
  XLSX.writeFile(workbook, path.join(dir, "sample.xlsx"));

  const docx = new AdmZip();
  docx.addFile(
    "[Content_Types].xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  );
  docx.addFile(
    "_rels/.rels",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  );
  docx.addFile(
    "word/document.xml",
    Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>QuickCheck Document</w:t></w:r></w:p>
    <w:p><w:r><w:t>Formatted paragraph with a table below.</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
    <w:sectPr/>
  </w:body>
</w:document>`)
  );
  docx.writeZip(path.join(dir, "sample.docx"));

  fs.writeFileSync(path.join(dir, "sample.py"), 'def hello():\n    print("QuickCheck")\n');
  fs.writeFileSync(path.join(dir, "sample.json"), JSON.stringify({ ok: true, n: 3 }, null, 2));
  fs.writeFileSync(path.join(dir, "sample.csv"), "name,score\nAda,95\nGrace,88\n");
  fs.writeFileSync(path.join(dir, "sample.md"), "# Title\n\n- item\n");
  fs.writeFileSync(path.join(dir, "sample.txt"), "plain text preview\n");
  fs.writeFileSync(
    path.join(dir, "sample.png"),
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    )
  );
  const z = new AdmZip();
  z.addFile("inside.txt", Buffer.from("archive member"));
  z.writeZip(path.join(dir, "sample.zip"));

  const html = await mammoth.convertToHtml({
    path: path.join(dir, "sample.docx"),
  });
  if (!/QuickCheck Document/i.test(html.value)) {
    throw new Error("Mammoth failed to convert sample.docx");
  }

  console.log("samples written:", fs.readdirSync(dir).join(", "));
  console.log("mammoth smoke: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
