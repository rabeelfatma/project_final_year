const User = require("../models/User");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const { askQuickCheckAI } = require("../services/geminiService");
const { extractText } = require("../services/plagiarismService");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const PptxGenJS = require("pptxgenjs");
const { Document, Packer, Paragraph, HeadingLevel } = require("docx");
const XLSX = require("xlsx");

const storedFiles = require("../utils/storedFiles");
const { getUploadsRoot } = require("../utils/uploadsPath");

const generatedDir = path.join(getUploadsRoot(), "generated");
try {
  if (!fs.existsSync(generatedDir)) fs.mkdirSync(generatedDir, { recursive: true });
} catch (error) {
  console.warn("Generated-files directory unavailable:", error.message);
}

function safeName(name, fallback = "generated-file.txt") {
  const cleaned = path.basename(String(name || fallback)).replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return cleaned || fallback;
}

async function readUploadBytes(file) {
  if (file?.buffer && Buffer.isBuffer(file.buffer)) return file.buffer;
  if (file?.path && fs.existsSync(file.path)) return fs.readFileSync(file.path);
  return null;
}

async function withTempFromUpload(file, fn) {
  if (file?.path && fs.existsSync(file.path)) {
    return fn(file.path);
  }
  const buf = await readUploadBytes(file);
  if (!buf) return fn(null);
  const ext = path.extname(file.originalname || "");
  const tmp = path.join(os.tmpdir(), `qc-ai-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
  fs.writeFileSync(tmp, buf);
  try {
    return await fn(tmp);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

async function prepareAttachments(files = []) {
  const parts = [];
  for (const file of files.slice(0, 40)) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const info = { name: file.originalname, mimeType: file.mimetype, size: file.size };
    try {
      if ((file.mimetype || "").startsWith("image/") && file.size <= 15 * 1024 * 1024) {
        const bytes = await readUploadBytes(file);
        if (bytes) info.inlineData = bytes.toString("base64");
      } else {
        const text = await withTempFromUpload(file, async (p) => (p ? extractText(p).catch(() => "") : ""));
        if (text && text.trim()) info.text = text.slice(0, 60000);
      }
    } catch (_) {}
    parts.push(info);
  }
  return parts;
}

const OWNER_META_SUFFIX = ".owner.json";

function ownerMetaStoredPath(uniqueName) {
  return `uploads/generated/${uniqueName}${OWNER_META_SUFFIX}`;
}

function isOwnerMetaName(name) {
  return String(name || "").toLowerCase().endsWith(OWNER_META_SUFFIX);
}

/**
 * Trusted ownership is recorded server-side only (sidecar next to the artifact).
 * AIChat artifact URLs / client filenames are never used as proof of ownership.
 */
async function writeOwnerMeta(uniqueName, ownerId) {
  const id = String(ownerId || "").trim();
  if (!id) {
    const err = new Error("Generated artifact owner is required.");
    err.code = "GENERATED_OWNER_REQUIRED";
    throw err;
  }
  const payload = Buffer.from(JSON.stringify({ ownerId: id }), "utf8");
  await storedFiles.writeBuffer(ownerMetaStoredPath(uniqueName), payload, "application/json");
}

async function readTrustedOwnerId(uniqueName) {
  const metaPath = ownerMetaStoredPath(uniqueName);
  if (!(await storedFiles.exists(metaPath))) return null;
  try {
    const raw = await storedFiles.readUtf8(metaPath);
    const parsed = JSON.parse(raw);
    const ownerId = String(parsed?.ownerId || "").trim();
    return ownerId || null;
  } catch (_) {
    return null;
  }
}

async function saveGeneratedArtifact(uniqueName, bufferOrPath, isPath = false, ownerId) {
  const stored = `uploads/generated/${uniqueName}`;
  if (storedFiles.usesObjectStorage()) {
    const buf = isPath ? fs.readFileSync(bufferOrPath) : bufferOrPath;
    await storedFiles.writeBuffer(stored, buf, "application/octet-stream");
    if (isPath) {
      try { fs.unlinkSync(bufferOrPath); } catch (_) {}
    }
  } else {
    // Resolve at write time so the artifact and owner sidecar stay colocated
    // under the same uploads root (Hostinger disk / local UPLOADS_DIR).
    const targetDir = path.join(getUploadsRoot(), "generated");
    const target = path.join(targetDir, uniqueName);
    fs.mkdirSync(targetDir, { recursive: true });
    if (isPath) {
      if (bufferOrPath !== target) {
        fs.copyFileSync(bufferOrPath, target);
        try { fs.unlinkSync(bufferOrPath); } catch (_) {}
      }
    } else {
      fs.writeFileSync(target, bufferOrPath);
    }
  }
  await writeOwnerMeta(uniqueName, ownerId);
  return { stored, downloadUrl: `/api/ai/generated/${encodeURIComponent(uniqueName)}` };
}

async function buildArtifacts(specs = [], ownerId) {
  const output = [];
  for (const spec of specs.slice(0, 8)) {
    try {
      if (spec.type === "slides" && Array.isArray(spec.slides)) {
        let name = safeName(spec.name || "presentation.pptx", "presentation.pptx");
        if (!name.toLowerCase().endsWith(".pptx")) name += ".pptx";
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
        const target = path.join(os.tmpdir(), unique);
        const pptx = new PptxGenJS();
        pptx.layout = "LAYOUT_WIDE";
        pptx.author = "QuickCheck AI";
        pptx.subject = String(spec.title || "Generated presentation");
        pptx.title = String(spec.title || "Generated presentation");
        for (const item of spec.slides.slice(0, 30)) {
          const slide = pptx.addSlide();
          slide.addText(String(item.title || "Slide"), { x: 0.7, y: 0.5, w: 12, h: 0.6, fontSize: 26, bold: true });
          const bullets = Array.isArray(item.bullets) ? item.bullets : [];
          const runs = bullets.slice(0, 10).map((b) => ({ text: String(b), options: { bullet: { indent: 18 }, breakLine: true } }));
          if (runs.length) slide.addText(runs, { x: 0.9, y: 1.45, w: 11.6, h: 5.4, fontSize: 18, breakLine: false, valign: "top", margin: 0.06 });
        }
        await pptx.writeFile({ fileName: target });
        const saved = await saveGeneratedArtifact(unique, target, true, ownerId);
        output.push({ name, downloadUrl: saved.downloadUrl });
      } else if (spec.type === "document") {
        let name = safeName(spec.name || "document.docx", "document.docx");
        if (!name.toLowerCase().endsWith(".docx")) name += ".docx";
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
        const children = [];
        if (spec.title) children.push(new Paragraph({ text: String(spec.title), heading: HeadingLevel.TITLE }));
        for (const section of (Array.isArray(spec.sections) ? spec.sections : []).slice(0, 40)) {
          if (section.heading) children.push(new Paragraph({ text: String(section.heading), heading: HeadingLevel.HEADING_1 }));
          for (const para of (Array.isArray(section.paragraphs) ? section.paragraphs : []).slice(0, 30)) {
            children.push(new Paragraph({ text: String(para) }));
          }
        }
        const doc = new Document({ sections: [{ children: children.length ? children : [new Paragraph({ text: String(spec.content || "Generated document") })] }] });
        const buf = await Packer.toBuffer(doc);
        const saved = await saveGeneratedArtifact(unique, buf, false, ownerId);
        output.push({ name, downloadUrl: saved.downloadUrl });
      } else if (spec.type === "spreadsheet") {
        let name = safeName(spec.name || "workbook.xlsx", "workbook.xlsx");
        if (!name.toLowerCase().endsWith(".xlsx")) name += ".xlsx";
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
        const target = path.join(os.tmpdir(), unique);
        const wb = XLSX.utils.book_new();
        const sheets = Array.isArray(spec.sheets) && spec.sheets.length ? spec.sheets : [{ name: "Sheet1", rows: [["Generated by QuickCheck AI"]] }];
        for (const sheet of sheets.slice(0, 20)) {
          const rows = Array.isArray(sheet.rows) ? sheet.rows.slice(0, 5000) : [];
          const ws = XLSX.utils.aoa_to_sheet(rows);
          XLSX.utils.book_append_sheet(wb, ws, String(sheet.name || "Sheet").slice(0, 31));
        }
        XLSX.writeFile(wb, target);
        const saved = await saveGeneratedArtifact(unique, target, true, ownerId);
        output.push({ name, downloadUrl: saved.downloadUrl });
      } else {
        let name = safeName(spec.name || "generated.txt");
        const content = String(spec.content || "");
        if (!content) continue;
        const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${name}`;
        const saved = await saveGeneratedArtifact(unique, Buffer.from(content, "utf8"), false, ownerId);
        output.push({ name, downloadUrl: saved.downloadUrl });
      }
    } catch (error) {
      console.error("Artifact generation failed:", error.message);
    }
  }
  return output;
}

exports.chat = async (req,res) => {
  const uploaded = Array.isArray(req.files) ? req.files : [];
  try {
    const question = String(req.body.question || "").trim();
    if (!question && uploaded.length === 0) return res.status(400).json({message:"Ask a question or attach a file first."});

    const role = req.user.role;
    let context = "";

    if (role === "student") {
      const [assignments, submissions] = await Promise.all([
        Assignment.find({status:"active"}).select("title subject points deadline teacher").populate("teacher","name"),
        Submission.find({student:req.user._id}).populate("assignment","title points subject deadline")
      ]);
      const graded = submissions.filter(s => ["graded","GRADED","PUBLISHED","AI_GRADED"].includes(s.status));
      context = JSON.stringify({
        role, student:req.user.name,
        totalAvailableAssignments: assignments.length,
        mySubmissions: submissions.length,
        pending: Math.max(assignments.length - submissions.length,0),
        graded: graded.length,
        scores: graded.map(s=>({title:s.assignment?.title,marks:s.marks ?? s.aiScore,total:s.totalMarks ?? s.assignment?.points,status:s.status})),
        assignments: assignments.map(a=>({title:a.title,subject:a.subject,points:a.points,deadline:a.deadline,teacher:a.teacher?.name}))
      });
    } else if (role === "teacher") {
      const assignments = await Assignment.find({teacher:req.user._id}).select("title subject points deadline createdAt");
      const ids = assignments.map(a=>a._id);
      const submissions = await Submission.find({assignment:{$in:ids}}).select("status marks aiScore totalMarks assignment").populate("assignment","title");
      context = JSON.stringify({
        role, teacher:req.user.name,
        assignmentsCreated:assignments.length,
        submissionsReceived:submissions.length,
        waitingForReview:submissions.filter(s=>!["graded","GRADED","PUBLISHED","AI_GRADED"].includes(s.status)).length,
        graded:submissions.filter(s=>["graded","GRADED","PUBLISHED","AI_GRADED"].includes(s.status)).length,
        assignments:assignments.map(a=>({title:a.title,subject:a.subject,points:a.points,deadline:a.deadline}))
      });
    } else {
      const [users, assignments, submissions] = await Promise.all([
        User.find().select("name role department createdAt"),
        Assignment.find().select("title subject points createdAt deadline teacher").populate("teacher","name"),
        Submission.find().select("status marks aiScore assignment createdAt").populate("assignment","title")
      ]);
      context = JSON.stringify({
        role, totalUsers:users.length,
        totalStudents:users.filter(u=>u.role==="student").length,
        totalTeachers:users.filter(u=>u.role==="teacher").length,
        totalAdmins:users.filter(u=>u.role==="admin").length,
        totalAssignments:assignments.length,
        totalSubmissions:submissions.length,
        recentAssignments:assignments.slice(-15).map(a=>({title:a.title,subject:a.subject,teacher:a.teacher?.name,createdAt:a.createdAt}))
      });
    }

    const attachments = role === "teacher" ? await prepareAttachments(uploaded) : [];
    const result = await askQuickCheckAI(role, question || "Analyze attached files", context, attachments);
    const artifacts = role === "teacher" ? await buildArtifacts(result.artifacts || [], req.user._id) : [];
    res.json({answer: result.answer || "Done.", artifacts});
  } catch(e) {
    if (e.code === "R2_NOT_CONFIGURED") {
      return res.status(503).json({ message: e.message });
    }
    res.status(500).json({message:e.message || "AI assistant failed."});
  } finally {
    for (const f of uploaded) {
      try { if (f?.path && fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch (_) {}
    }
  }
};

exports.downloadGenerated = async (req, res) => {
  const name = path.basename(req.params.name || "");
  // Same opaque 404 for missing, unauthorized, legacy, and metadata probes —
  // do not reveal whether another user's private artifact exists.
  const notFound = () => res.status(404).json({ message: "Generated file not found." });
  if (!name || isOwnerMetaName(name)) return notFound();
  const stored = `uploads/generated/${name}`;
  try {
    const ownerId = await readTrustedOwnerId(name);
    if (!ownerId || String(req.user._id) !== ownerId) {
      return notFound();
    }
    if (!(await storedFiles.exists(stored))) {
      return notFound();
    }
    const download = await storedFiles.openDownloadStream(stored);
    const downloadName = name.replace(/^\d+-[a-z0-9]+-/, "");
    res.setHeader("Content-Disposition", `attachment; filename="${downloadName}"`);
    if (download.localPath) return res.download(download.localPath, downloadName);
    download.stream.on("error", () => {
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    return download.stream.pipe(res);
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") {
      return res.status(503).json({ message: error.message });
    }
    return notFound();
  }
};
