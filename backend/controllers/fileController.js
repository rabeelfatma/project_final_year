const path = require("path");
const fs = require("fs");
const mammoth = require("mammoth");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Message = require("../models/Message");
const { extractText } = require("../services/plagiarismService");
const { resolveStoredUploadPath } = require("../utils/uploadsPath");

function safePath(stored) {
  return resolveStoredUploadPath(stored);
}
function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function contentTypeFromExt(ext) {
  const map = {
    ".txt":"text/plain; charset=utf-8", ".md":"text/plain; charset=utf-8", ".csv":"text/plain; charset=utf-8",
    ".json":"application/json; charset=utf-8", ".xml":"text/xml; charset=utf-8", ".html":"text/plain; charset=utf-8",
    ".htm":"text/plain; charset=utf-8", ".css":"text/plain; charset=utf-8", ".js":"text/plain; charset=utf-8",
    ".jsx":"text/plain; charset=utf-8", ".ts":"text/plain; charset=utf-8", ".tsx":"text/plain; charset=utf-8",
    ".py":"text/plain; charset=utf-8", ".java":"text/plain; charset=utf-8", ".c":"text/plain; charset=utf-8",
    ".cpp":"text/plain; charset=utf-8", ".h":"text/plain; charset=utf-8", ".hpp":"text/plain; charset=utf-8",
    ".sql":"text/plain; charset=utf-8", ".sh":"text/plain; charset=utf-8", ".rb":"text/plain; charset=utf-8", ".r":"text/plain; charset=utf-8",
  };
  return map[ext] || "";
}
function sendFile(res, stored, originalName, mimeType, inline = false) {
  let filePath;
  try { filePath = safePath(stored); } catch (_) { return res.status(400).json({ message: "Invalid stored file path." }); }
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found on server." });
  const name = String(originalName || path.basename(filePath)).replace(/["\r\n]/g, "_");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${name}"`);
  if (mimeType) res.setHeader("Content-Type", mimeType);
  return res.sendFile(filePath);
}
function htmlPage(title, body, pre = true) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  body{margin:0;padding:24px;background:#0d1117;color:#e6edf3;font:15px/1.6 Arial,sans-serif}
  main{max-width:1100px;margin:0 auto}h1{font-size:22px;border-bottom:1px solid #30363d;padding-bottom:12px}
  pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.55 ui-monospace,monospace}
  table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #48515c;padding:7px;text-align:left}
  img{max-width:100%} .content{overflow-wrap:anywhere}
  </style></head><body><main><h1>${escapeHtml(title)}</h1><div class="content">${pre ? `<pre>${escapeHtml(body)}</pre>` : body}</div></main></body></html>`;
}
async function previewFile(res, stored, originalName, mimeType) {
  let filePath;
  try { filePath = safePath(stored); } catch (_) { return res.status(400).send("Invalid stored file path."); }
  if (!fs.existsSync(filePath)) return res.status(404).send("File not found.");
  const ext = path.extname(originalName || filePath).toLowerCase();

  // Serve PDFs unchanged so the browser's native viewer preserves page layout, colors and size.
  if (ext === ".pdf") return sendFile(res, stored, originalName, mimeType || "application/pdf", true);

  if (ext === ".docx") {
    try {
      const { value } = await mammoth.convertToHtml({ path: filePath });
      return res.type("html").send(htmlPage(originalName || "Document", value, false));
    } catch (error) {
      console.warn("DOCX preview failed:", error.message);
    }
  }

  // Office formats with extractable text are displayed as readable text instead of a dead-end preview.
  if ([".pptx", ".xlsx", ".xls", ".xlsm", ".ods"].includes(ext)) {
    try {
      const text = await extractText(filePath);
      if (text.trim()) return res.type("html").send(htmlPage(originalName || "File preview", text));
      if (ext === ".pdf") return sendFile(res, stored, originalName, mimeType || "application/pdf", true);
      return res.status(422).type("html").send(htmlPage(originalName || "File preview",
        "This file opened, but no readable text could be extracted. Download the original file to view its complete layout.", true));
    } catch (_error) {
      return res.status(422).type("html").send(htmlPage(originalName || "File preview",
        "Preview/text extraction failed. Download the original file to open it in a compatible application."));
    }
  }

  const textType = contentTypeFromExt(ext);
  if (textType) {
    const raw = fs.readFileSync(filePath, "utf8");
    return res.type("html").send(htmlPage(originalName || "Text file", raw));
  }

  const native = [".pdf",".png",".jpg",".jpeg",".gif",".webp",".bmp",".svg",".mp4",".webm",".mov",".mp3",".wav",".ogg",".m4a",".aac"];
  if (native.includes(ext)) return sendFile(res, stored, originalName, mimeType, true);

  return res.type("html").send(htmlPage(originalName || "File", "This format cannot be previewed directly here. Download the original file to open it in a compatible application."));
}
async function getAssignment(req) {
  const a = await Assignment.findById(req.params.id);
  if (!a) return { error: [404, "Assignment not found."] };
  const isAdmin = req.user.role === "admin";
  const isOwnerTeacher = String(a.teacher) === String(req.user._id);
  const isStudentActive =
    req.user.role === "student" && String(a.status || "active") === "active";
  if (!(isAdmin || isOwnerTeacher || isStudentActive)) {
    return { error: [403, "Access denied."] };
  }
  if (!a.file) return { error: [404, "This assignment has no attached file."] };
  return { row: a };
}
async function getSubmission(req) {
  const s = await Submission.findById(req.params.id);
  if (!s) return { error: [404, "Submission not found."] };
  const allowed =
    req.user.role === "admin" ||
    String(s.student) === String(req.user._id) ||
    String(s.teacherId) === String(req.user._id);
  if (!allowed) return { error: [403, "Access denied."] };
  return { row: s };
}
exports.assignment = async (req, res) => {
  try {
    const r = await getAssignment(req);
    if (r.error) return res.status(r.error[0]).json({ message: r.error[1] });
    return sendFile(res, r.row.file, r.row.originalFileName, r.row.fileMimeType);
  } catch (e) {
    console.error("assignment download error:", e.message);
    return res.status(500).json({ message: "Unable to download assignment file." });
  }
};
exports.assignmentPreview = async (req, res) => {
  try {
    const r = await getAssignment(req);
    if (r.error) return res.status(r.error[0]).send(r.error[1]);
    return await previewFile(res, r.row.file, r.row.originalFileName, r.row.fileMimeType);
  } catch (e) {
    console.error("assignment preview error:", e.message);
    return res.status(500).send("Unable to preview assignment file.");
  }
};
exports.submission = async (req, res) => {
  try {
    const r = await getSubmission(req);
    if (r.error) return res.status(r.error[0]).json({ message: r.error[1] });
    return sendFile(res, r.row.file, r.row.originalFileName, r.row.fileMimeType);
  } catch (e) {
    console.error("submission download error:", e.message);
    return res.status(500).json({ message: "Unable to download submission file." });
  }
};
exports.submissionPreview = async (req, res) => {
  try {
    const r = await getSubmission(req);
    if (r.error) return res.status(r.error[0]).send(r.error[1]);
    return await previewFile(res, r.row.file, r.row.originalFileName, r.row.fileMimeType);
  } catch (e) {
    console.error("submission preview error:", e.message);
    return res.status(500).send("Unable to preview submission file.");
  }
};
exports.message = async (req, res) => {
  try {
    const m = await Message.findById(req.params.id);
    if (!m) return res.status(404).json({ message: "Message not found." });
    if (String(m.sender) !== String(req.user._id) && String(m.recipient) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied." });
    }
    return sendFile(res, m.voiceFile, m.originalFileName, m.mimeType);
  } catch (e) {
    console.error("message file error:", e.message);
    return res.status(500).json({ message: "Unable to load voice message." });
  }
};
