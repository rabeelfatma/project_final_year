const path = require("path");
const fs = require("fs");
const mammoth = require("mammoth");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Message = require("../models/Message");
const storedFiles = require("../utils/storedFiles");

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

async function sendFile(res, stored, originalName, mimeType, inline = false) {
  let download;
  try {
    download = await storedFiles.openDownloadStream(stored);
  } catch (error) {
    if (error.message === "Invalid file path.") {
      return res.status(400).json({ message: "Invalid stored file path." });
    }
    if (error.code === "R2_NOT_CONFIGURED") {
      return res.status(503).json({ message: error.message });
    }
    if (error.code === "ENOENT" || error?.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ message: "File not found on server." });
    }
    console.error("sendFile error:", error.message);
    return res.status(500).json({ message: "Unable to download file." });
  }

  const name = String(originalName || path.basename(String(stored))).replace(/["\r\n]/g, "_");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${name}"`);
  if (mimeType) res.setHeader("Content-Type", mimeType);
  else if (download.contentType) res.setHeader("Content-Type", download.contentType);
  if (download.contentLength != null) res.setHeader("Content-Length", String(download.contentLength));

  if (download.localPath) {
    return res.sendFile(download.localPath);
  }

  download.stream.on("error", (err) => {
    console.error("download stream error:", err.message);
    if (!res.headersSent) res.status(500).end();
    else res.end();
  });
  return download.stream.pipe(res);
}

function htmlPage(title, body, pre = true, extraHead = "") {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  body{margin:0;padding:24px;background:#0d1117;color:#e6edf3;font:15px/1.6 Arial,sans-serif}
  main{max-width:1100px;margin:0 auto}h1{font-size:22px;border-bottom:1px solid #30363d;padding-bottom:12px}
  pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.55 ui-monospace,monospace}
  table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border:1px solid #48515c;padding:7px;text-align:left;vertical-align:top}
  img{max-width:100%} .content{overflow-wrap:anywhere}
  .qc-sheet-tabs,.qc-slide-nav{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
  .qc-sheet-tabs button,.qc-slide-nav button{border:1px solid #30363d;background:#161b22;color:#e6edf3;border-radius:8px;padding:6px 12px;cursor:pointer;font:12px/1.2 Arial,sans-serif}
  .qc-sheet-tabs button.active,.qc-slide-nav button:disabled{background:#1f6feb;border-color:#1f6feb;color:#fff}
  .qc-sheet-panel{display:none}.qc-sheet-panel.active{display:block}
  .qc-slide{display:none;min-height:220px;padding:16px;border:1px solid #30363d;border-radius:12px;background:#161b22}
  .qc-slide.active{display:block}
  .qc-slide h2{margin:0 0 12px;font-size:16px;color:#58a6ff}
  .qc-slide-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
  .qc-slide-thumb{border:1px solid #30363d;background:#161b22;color:#e6edf3;border-radius:8px;padding:8px 10px;cursor:pointer;font:12px/1.2 Arial,sans-serif;min-width:72px}
  .qc-slide-thumb.active{background:#1f6feb;border-color:#1f6feb}
  </style>${extraHead}</head><body><main><h1>${escapeHtml(title)}</h1><div class="content">${pre ? `<pre>${escapeHtml(body)}</pre>` : body}</div></main></body></html>`;
}

function buildSpreadsheetPreviewHtml(filePath, originalName) {
  const XLSX = require("xlsx");
  const workbook = XLSX.readFile(filePath, { cellText: true, cellDates: true });
  const names = workbook.SheetNames || [];
  if (!names.length) {
    return htmlPage(originalName || "Workbook", "This workbook has no sheets to preview.");
  }
  const tabs = names.map((name, index) =>
    `<button type="button" class="${index === 0 ? "active" : ""}" data-sheet="${index}">${escapeHtml(name)}</button>`
  ).join("");
  const panels = names.map((name, index) => {
    const tableHtml = XLSX.utils.sheet_to_html(workbook.Sheets[name], { id: `sheet-${index}` });
    return `<div class="qc-sheet-panel ${index === 0 ? "active" : ""}" data-sheet="${index}"><h2>${escapeHtml(name)}</h2>${tableHtml}</div>`;
  }).join("");
  const script = `<script>(function(){var tabs=document.querySelectorAll('.qc-sheet-tabs button');var panels=document.querySelectorAll('.qc-sheet-panel');tabs.forEach(function(btn){btn.addEventListener('click',function(){var id=btn.getAttribute('data-sheet');tabs.forEach(function(b){b.classList.toggle('active',b===btn)});panels.forEach(function(p){p.classList.toggle('active',p.getAttribute('data-sheet')===id)});});});})();</script>`;
  return htmlPage(
    originalName || "Workbook",
    `<div class="qc-sheet-tabs">${tabs}</div>${panels}`,
    false,
    script
  );
}

function decodeSlideXml(value) {
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

function buildPresentationPreviewHtml(filePath, originalName) {
  const AdmZip = require("adm-zip");
  const archive = new AdmZip(filePath);
  let slides = archive.getEntries()
    .filter((entry) => /ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

  // ODP: single content.xml — split on draw:page when present.
  if (!slides.length) {
    const odp = archive.getEntries().find((entry) => /content\.xml$/i.test(entry.entryName));
    if (odp) {
      const xml = odp.getData().toString("utf8");
      const pages = xml.split(/<draw:page\b/i).slice(1);
      if (pages.length) {
        const thumbs = pages.map((_, index) =>
          `<button type="button" class="qc-slide-thumb ${index === 0 ? "active" : ""}" data-slide="${index}">Slide ${index + 1}</button>`
        ).join("");
        const panels = pages.map((chunk, index) => {
          const text = decodeSlideXml(`<draw:page ${chunk}`) || "(Empty slide)";
          return `<section class="qc-slide ${index === 0 ? "active" : ""}" data-slide="${index}"><h2>Slide ${index + 1} of ${pages.length}</h2><pre>${escapeHtml(text)}</pre></section>`;
        }).join("");
        const script = `<script>(function(){var slides=Array.prototype.slice.call(document.querySelectorAll('.qc-slide'));var thumbs=Array.prototype.slice.call(document.querySelectorAll('.qc-slide-thumb'));var i=0;var label=document.getElementById('qc-slide-label');var prev=document.getElementById('qc-slide-prev');var next=document.getElementById('qc-slide-next');function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach(function(s,idx){s.classList.toggle('active',idx===i)});thumbs.forEach(function(t,idx){t.classList.toggle('active',idx===i)});if(label)label.textContent='Slide '+(i+1)+' of '+slides.length;if(prev)prev.disabled=i===0;if(next)next.disabled=i===slides.length-1;}thumbs.forEach(function(t){t.onclick=function(){show(Number(t.getAttribute('data-slide'))||0}});if(prev)prev.onclick=function(){show(i-1)};if(next)next.onclick=function(){show(i+1)};show(0);})();</script>`;
        const nav = `<div class="qc-slide-nav"><button type="button" id="qc-slide-prev">Previous</button><span id="qc-slide-label">Slide 1 of ${pages.length}</span><button type="button" id="qc-slide-next">Next</button></div><div class="qc-slide-thumbs">${thumbs}</div>`;
        return htmlPage(originalName || "Presentation", `${nav}${panels}`, false, script);
      }
      return htmlPage(originalName || "Presentation", decodeSlideXml(xml) || "No readable slides were found.");
    }
    return htmlPage(originalName || "Presentation", "No readable slides were found in this presentation.");
  }

  const thumbs = slides.map((_, index) =>
    `<button type="button" class="qc-slide-thumb ${index === 0 ? "active" : ""}" data-slide="${index}">Slide ${index + 1}</button>`
  ).join("");
  const panels = slides.map((entry, index) => {
    const text = decodeSlideXml(entry.getData().toString("utf8")) || "(Empty slide)";
    return `<section class="qc-slide ${index === 0 ? "active" : ""}" data-slide="${index}"><h2>Slide ${index + 1} of ${slides.length}</h2><pre>${escapeHtml(text)}</pre></section>`;
  }).join("");
  const script = `<script>(function(){var slides=Array.prototype.slice.call(document.querySelectorAll('.qc-slide'));var thumbs=Array.prototype.slice.call(document.querySelectorAll('.qc-slide-thumb'));var i=0;var label=document.getElementById('qc-slide-label');var prev=document.getElementById('qc-slide-prev');var next=document.getElementById('qc-slide-next');function show(n){i=Math.max(0,Math.min(slides.length-1,n));slides.forEach(function(s,idx){s.classList.toggle('active',idx===i)});thumbs.forEach(function(t,idx){t.classList.toggle('active',idx===i)});if(label)label.textContent='Slide '+(i+1)+' of '+slides.length;if(prev)prev.disabled=i===0;if(next)next.disabled=i===slides.length-1;}thumbs.forEach(function(t){t.onclick=function(){show(Number(t.getAttribute('data-slide'))||0)});if(prev)prev.onclick=function(){show(i-1)};if(next)next.onclick=function(){show(i+1)};show(0);})();</script>`;
  const nav = `<div class="qc-slide-nav"><button type="button" id="qc-slide-prev">Previous</button><span id="qc-slide-label">Slide 1 of ${slides.length}</span><button type="button" id="qc-slide-next">Next</button></div><div class="qc-slide-thumbs">${thumbs}</div>`;
  return htmlPage(originalName || "Presentation", `${nav}${panels}`, false, script);
}

function buildZipListingHtml(filePath, originalName) {
  const AdmZip = require("adm-zip");
  const archive = new AdmZip(filePath);
  const entries = archive.getEntries().slice(0, 500);
  if (!entries.length) {
    return htmlPage(originalName || "Archive", "This ZIP archive appears empty.");
  }
  const rows = entries.map((entry) => {
    const size = entry.isDirectory ? "—" : String(entry.header?.size ?? entry.getData?.()?.length ?? "—");
    return `<tr><td>${escapeHtml(entry.entryName)}</td><td>${entry.isDirectory ? "folder" : "file"}</td><td>${escapeHtml(size)}</td></tr>`;
  }).join("");
  return htmlPage(
    originalName || "Archive",
    `<p>Secure listing only — archive members are not extracted or executed.</p>
     <table class="qc-zip-list"><thead><tr><th>Path</th><th>Type</th><th>Size</th></tr></thead><tbody>${rows}</tbody></table>`,
    false
  );
}

async function previewFile(res, stored, originalName, mimeType) {
  let materialized;
  try {
    if (!(await storedFiles.exists(stored))) {
      return res.status(404).send("File not found.");
    }
    materialized = await storedFiles.materialize(stored);
  } catch (error) {
    if (error.message === "Invalid file path.") {
      return res.status(400).send("Invalid stored file path.");
    }
    if (error.code === "R2_NOT_CONFIGURED") {
      return res.status(503).send(error.message);
    }
    return res.status(404).send("File not found.");
  }

  const filePath = materialized.path;
  const ext = path.extname(originalName || filePath).toLowerCase();

  try {
    // Serve PDFs unchanged so the browser's native viewer preserves page layout, colors and size.
    if (ext === ".pdf") {
      await materialized.cleanup();
      return sendFile(res, stored, originalName, mimeType || "application/pdf", true);
    }

    if (ext === ".docx") {
      try {
        const { value } = await mammoth.convertToHtml({ path: filePath });
        return res.type("html").send(htmlPage(originalName || "Document", value, false));
      } catch (error) {
        console.warn("DOCX preview failed:", error.message);
      }
    }

    if ([".xlsx", ".xls", ".xlsm", ".ods"].includes(ext)) {
      try {
        return res.type("html").send(buildSpreadsheetPreviewHtml(filePath, originalName));
      } catch (_error) {
        return res.status(422).type("html").send(htmlPage(originalName || "Workbook",
          "Spreadsheet preview failed. Download the original file to open it in Excel or another spreadsheet app."));
      }
    }

    if ([".pptx", ".ppt", ".odp"].includes(ext)) {
      try {
        if (ext === ".ppt") {
          return res.status(422).type("html").send(htmlPage(originalName || "Presentation",
            "Legacy .ppt binary format cannot be rendered here. Download the original file to open it in PowerPoint."));
        }
        return res.type("html").send(buildPresentationPreviewHtml(filePath, originalName));
      } catch (_error) {
        return res.status(422).type("html").send(htmlPage(originalName || "Presentation",
          "Presentation preview failed. Download the original file to open it in PowerPoint."));
      }
    }

    if (ext === ".zip") {
      try {
        return res.type("html").send(buildZipListingHtml(filePath, originalName));
      } catch (_error) {
        return res.status(422).type("html").send(htmlPage(originalName || "Archive",
          "ZIP listing failed. Download the original file to inspect its contents securely on your device."));
      }
    }

    if ([".rar", ".7z", ".tar", ".gz"].includes(ext)) {
      return res.status(422).type("html").send(htmlPage(originalName || "Archive",
        "This archive format cannot be listed safely in the browser. Download the original file to inspect its contents on your device."));
    }

    if (ext === ".doc") {
      return res.status(422).type("html").send(htmlPage(originalName || "Document",
        "Legacy .doc binary format cannot be rendered here. Download the original file to open it in Microsoft Word or a compatible application."));
    }

    // Serve text/code/data as charset text so the LMS React viewer can apply
    // syntax highlighting, tables, markdown and notebook rendering.
    const textType = contentTypeFromExt(ext);
    const plainTextExts = [
      ".txt", ".md", ".rtf", ".csv", ".tsv", ".json", ".xml", ".yaml", ".yml", ".ipynb",
      ".py", ".js", ".jsx", ".ts", ".tsx", ".cpp", ".c", ".h", ".hpp", ".java", ".php",
      ".cs", ".swift", ".go", ".rs", ".kt", ".kts", ".sql", ".html", ".htm", ".css",
      ".scss", ".sass", ".less", ".vue", ".svelte", ".sh", ".bat", ".ps1", ".rb", ".r",
      ".m", ".mm", ".dart", ".lua", ".pl",
    ];
    if (textType || plainTextExts.includes(ext)) {
      let raw = fs.readFileSync(filePath, "utf8");
      if (ext === ".rtf") {
        raw = raw.replace(/\\'[0-9a-f]{2}/gi, " ")
          .replace(/\\[a-z]+-?\d* ?/gi, " ")
          .replace(/[{}]/g, " ")
          .replace(/\s+/g, " ").trim();
      }
      const ctype =
        ext === ".json" || ext === ".ipynb" ? "application/json; charset=utf-8" :
        ext === ".xml" ? "application/xml; charset=utf-8" :
        ext === ".csv" ? "text/csv; charset=utf-8" :
        ext === ".tsv" ? "text/tab-separated-values; charset=utf-8" :
        textType || "text/plain; charset=utf-8";
      res.setHeader("Content-Type", ctype);
      res.setHeader("Content-Disposition", `inline; filename="${String(originalName || "preview").replace(/["\r\n]/g, "_")}"`);
      return res.send(raw);
    }

    const native = [
      ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg",
      ".tif", ".tiff", ".heic", ".heif",
      ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac",
    ];
    if (native.includes(ext)) {
      await materialized.cleanup();
      return sendFile(res, stored, originalName, mimeType, true);
    }

    return res.status(422).type("html").send(htmlPage(originalName || "File",
      "Preview unavailable for this format. Download the original file to open it in a compatible application."));
  } finally {
    await materialized.cleanup();
  }
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
  // Students cannot open/download reference files before the scheduled start (server time).
  if (req.user.role === "student") {
    const { evaluateAssignmentWindow } = require("../utils/assignmentAvailability");
    const windowState = evaluateAssignmentWindow(a.startDate, a.deadline, Date.now());
    if (windowState.notOpenYet) {
      return {
        error: [403, "Assignment is not open yet."],
      };
    }
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
function normalizeVoiceMime(raw, originalName) {
  const base = String(raw || "").split(";")[0].trim().toLowerCase();
  if (base.startsWith("audio/")) return base;
  if (base === "video/webm" || base === "application/octet-stream" || !base) {
    const ext = path.extname(String(originalName || "")).toLowerCase();
    if (ext === ".ogg" || ext === ".oga") return "audio/ogg";
    if (ext === ".mp3") return "audio/mpeg";
    if (ext === ".wav") return "audio/wav";
    if (ext === ".m4a") return "audio/mp4";
    return "audio/webm";
  }
  return base;
}

exports.message = async (req, res) => {
  try {
    const m = await Message.findById(req.params.id);
    if (!m) return res.status(404).json({ message: "Message not found." });
    if (String(m.sender) !== String(req.user._id) && String(m.recipient) !== String(req.user._id)) {
      return res.status(403).json({ message: "Access denied." });
    }
    if (!m.voiceFile) {
      return res.status(404).json({ message: "Voice recording not found." });
    }
    // Serve inline with a clean audio/* Content-Type so <audio> / blob players
    // can decode MediaRecorder webm (often stored as audio/webm;codecs=opus).
    const mime = normalizeVoiceMime(m.mimeType, m.originalFileName || m.voiceFile);
    return sendFile(res, m.voiceFile, m.originalFileName || "voice-message.webm", mime, true);
  } catch (e) {
    console.error("message file error:", e.message);
    return res.status(500).json({ message: "Unable to load voice message." });
  }
};

const {
  createPresignedUpload,
  verifyPresignedUpload,
} = require("../services/presignedUploadService");

/** POST /api/files/presign — authorize a direct-to-R2 PUT (credentials stay on server). */
exports.presign = async (req, res) => {
  try {
    const { category, originalFileName, contentType, size } = req.body || {};
    const result = await createPresignedUpload({
      category,
      originalFileName,
      contentType,
      size,
      userId: req.user?._id,
    });
    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const status = error.statusCode || (error.code === "R2_NOT_CONFIGURED" ? 503 : 400);
    return res.status(status).json({
      message: error.message || "Could not authorize upload.",
      code: error.code || "UPLOAD_PRESIGN_FAILED",
    });
  }
};

/** POST /api/files/verify-upload — confirm object exists before Mongo commit (optional helper). */
exports.verifyUpload = async (req, res) => {
  try {
    const { objectKey, category, originalFileName, expectedSize } = req.body || {};
    const result = await verifyPresignedUpload({
      objectKey,
      category,
      originalFileName,
      expectedSize,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    const status = error.statusCode || (error.code === "R2_NOT_CONFIGURED" ? 503 : 400);
    return res.status(status).json({
      message: error.message || "Upload verification failed.",
      code: error.code || "UPLOAD_VERIFY_FAILED",
    });
  }
};
