
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");

const TEXT_EXTENSIONS = [
  ".txt", ".md", ".rtf", ".py", ".ipynb", ".js", ".jsx", ".ts", ".tsx",
  ".java", ".cpp", ".c", ".h", ".hpp", ".cs", ".php", ".go", ".rs",
  ".swift", ".kt", ".kts", ".sql", ".html", ".htm", ".css", ".scss",
  ".sass", ".less", ".vue", ".svelte", ".sh", ".bat", ".ps1", ".rb",
  ".r", ".m", ".mm", ".dart", ".lua", ".pl", ".json", ".xml", ".yaml",
  ".yml", ".csv", ".tsv", ".svg", ".log", ".ini", ".toml", ".env",
];

function decodeXml(value) {
  return String(value || "")
    .replace(/<a:tab\/>/g, " ")
    .replace(/<\/a:p>/g, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

async function extractText(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }

  if (TEXT_EXTENSIONS.includes(extension)) {
    const raw = fs.readFileSync(filePath, "utf8");
    // RTF contains control words; strip them while preserving the readable text.
    if (extension === ".rtf") {
      return raw.replace(/\\'[0-9a-f]{2}/gi, " ")
        .replace(/\\[a-z]+-?\d* ?/gi, " ")
        .replace(/[{}]/g, " ")
        .replace(/\s+/g, " ").trim();
    }
    return raw;
  }

  if ([".xlsx", ".xls", ".ods"].includes(extension)) {
    const XLSX = require("xlsx");
    const workbook = XLSX.readFile(filePath, { cellText: true, cellDates: true });
    return workbook.SheetNames.map((name) => {
      const sheet = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
      return `SHEET: ${name}\n${sheet}`;
    }).join("\n\n").slice(0, 120000);
  }

  if ([".pptx", ".odp"].includes(extension)) {
    const AdmZip = require("adm-zip");
    const archive = new AdmZip(filePath);
    const slides = archive.getEntries()
      .filter((entry) => /(?:ppt\/slides\/slide\d+\.xml|content\.xml)$/i.test(entry.entryName))
      .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
    return slides.map((entry) => `${entry.entryName}\n${decodeXml(entry.getData().toString("utf8"))}`)
      .join("\n\n").slice(0, 120000);
  }

  if (extension === ".zip") {
    const AdmZip = require("adm-zip");
    const archive = new AdmZip(filePath);
    const supported = new Set(TEXT_EXTENSIONS.concat([
      ".docx", ".xlsx", ".xls", ".ods", ".pptx", ".odp", ".pdf"
    ]));
    const pieces = [];
    for (const entry of archive.getEntries()) {
      if (entry.isDirectory || pieces.length >= 30 || entry.header.size > 2 * 1024 * 1024) continue;
      if (!supported.has(path.extname(entry.entryName).toLowerCase())) continue;
      try {
        const ext = path.extname(entry.entryName).toLowerCase();
        const buffer = entry.getData();
        if (TEXT_EXTENSIONS.includes(ext)) pieces.push(`FILE: ${entry.entryName}\n${buffer.toString("utf8").slice(0, 12000)}`);
        else if (ext === ".docx") {
          const tempPath = path.join(require("os").tmpdir(), `qc-${Date.now()}-${Math.random().toString(16).slice(2)}.docx`);
          fs.writeFileSync(tempPath, buffer);
          try { pieces.push(`FILE: ${entry.entryName}\n${(await mammoth.extractRawText({ path: tempPath })).value}`); }
          finally { try { fs.unlinkSync(tempPath); } catch (_) {} }
        }
      } catch (_) {}
    }
    return pieces.join("\n\n").slice(0, 120000);
  }

  if (extension === ".pdf") {
    try {
      const pdfModule = require("pdf-parse");
      const buffer = fs.readFileSync(filePath);
      if (typeof pdfModule === "function") {
        const result = await pdfModule(buffer);
        return result.text || "";
      }
      if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        try {
          const result = await parser.getText();
          return result.text || "";
        } finally {
          if (typeof parser.destroy === "function") await parser.destroy();
        }
      }
    } catch (error) {
      console.warn("PDF text extraction failed:", error.message);
    }
  }

  // Media such as images/audio/video is attached directly to Gemini by the grading controller.
  return "";
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9_\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function shingles(tokens, size = 5) {
  const result = new Set();

  for (let index = 0; index <= tokens.length - size; index += 1) {
    result.add(tokens.slice(index, index + size).join(" "));
  }

  return result;
}

function compareTexts(firstText, secondText) {
  const first = shingles(tokenize(firstText));
  const second = shingles(tokenize(secondText));

  if (!first.size || !second.size) return 0;

  let intersection = 0;

  for (const item of first) {
    if (second.has(item)) {
      intersection += 1;
    }
  }

  return (
    Math.round(
      (intersection / (first.size + second.size - intersection)) * 10000
    ) / 100
  );
}

async function extractText(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  // Extract text from DOCX files
  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }

  // Read supported text and code files
  if (TEXT_EXTENSIONS.includes(extension)) {
    return fs.readFileSync(filePath, "utf8");
  }

  // Extract text from PDF files
  if (extension === ".pdf") {
    try {
      const pdfModule = require("pdf-parse");
      const buffer = fs.readFileSync(filePath);

      // Compatibility with older pdf-parse versions
      if (typeof pdfModule === "function") {
        const result = await pdfModule(buffer);
        return result.text || "";
      }

      // Compatibility with newer pdf-parse versions
      if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });

        try {
          const result = await parser.getText();
          return result.text || "";
        } finally {
          if (typeof parser.destroy === "function") {
            await parser.destroy();
          }
        }
      }

      return "";
    } catch (error) {
      console.warn("PDF text extraction failed:", error.message);
      return "";
    }
  }

  return "";
}

exports.extractText = extractText;
exports.compareTexts = compareTexts;
