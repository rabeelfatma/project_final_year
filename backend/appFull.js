const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const connectDB = require("./config/db");

// Import route files
const authRoutes = require("./routes/authRoutes");
const analyticsRoutes = require("./routes/analyticsRoutes");
const adminRoutes = require("./routes/adminRoutes");
const teacherRoutes = require("./routes/teacherRoutes");
const studentRoutes = require("./routes/studentRoutes");
const evaluationRoutes = require("./routes/evaluationRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const plagiarismRoutes = require("./routes/plagiarismRoutes");
const userRoutes = require("./routes/userRoutes");
const messageRoutes = require("./routes/messageRoutes");
const fileRoutes = require("./routes/fileRoutes");
const aiRoutes = require("./routes/aiRoutes");
const aiChatRoutes = require("./routes/aiChatRoutes");

const app = express();

const isVercel = process.env.VERCEL === "1";

/* ===============================
    Global Middleware
================================= */
// Hostinger / Vercel sit behind reverse proxies. Required so req.ip is the
// client hop Express trusts — password-reset rate limits must not read raw XFF.
app.set("trust proxy", 1);

// Separate Vercel frontend: set CLIENT_ORIGIN (or FRONTEND_URL) to the SPA origin.
// Unset keeps permissive reflection (Hostinger same-origin / local).
const allowedOrigins = String(
  process.env.CLIENT_ORIGIN || process.env.FRONTEND_URL || ""
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length
      ? (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          return callback(null, false);
        }
      : true,
    exposedHeaders: ["Content-Disposition"],
  })
);

// Vercel request body limit is ~4.5MB on Hobby; keep Hostinger's larger ceiling.
const bodyLimit = isVercel ? "4.5mb" : "100mb";
app.use(express.json({ limit: bodyLimit }));
app.use(express.urlencoded({ limit: bodyLimit, extended: true }));

/* ===============================
    MongoDB
    - Hostinger/local: connect at boot (process.exit on failure, unchanged).
    - Vercel: await on API/upload requests; never process.exit.
================================= */
if (!isVercel) {
  connectDB();
}

app.use(async (req, res, next) => {
  const p = req.path || "";
  if (p === "/health" || p === "/api/health") return next();
  if (!p.startsWith("/api") && !p.startsWith("/uploads")) return next();
  try {
    await connectDB();
    return next();
  } catch (error) {
    console.error("MongoDB unavailable for request:", error.message);
    return res.status(503).json({
      message: "Database unavailable. Check MONGO_URI and Atlas network access.",
    });
  }
});

/* ===============================
    Upload storage (not publicly browsable for academic files)
================================= */
const {
  getUploadsRoot,
  ensureUploadSubdirs,
  configureUploadStatic,
} = require("./utils/uploadsPath");

let uploadsPath = getUploadsRoot();
try {
  uploadsPath = ensureUploadSubdirs();
} catch (error) {
  console.log("⚠️ Notice: Skipping local folder creation on read-only file system:", error.message);
}

const setCustomHeaders = (res, filePath) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cross-Origin-Resource-Policy", "cross-origin");

  const ext = path.extname(filePath).toLowerCase();
  const allExtensions = [
    ".pdf", ".docx", ".doc", ".txt", ".md", ".html",
    ".py", ".js", ".cpp", ".c", ".java", ".php", ".cs", ".swift", ".go", ".sql",
    ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif",
    ".mp4", ".mov", ".avi", ".wmv", ".mpeg",
    ".mp3", ".wav", ".aac", ".flac"
  ];

  if (allExtensions.includes(ext)) {
    const inlineExtensions = [
      ".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".heif",
      ".mp3", ".wav", ".aac", ".flac", ".ogg", ".mp4", ".webm", ".mov"
    ];
    res.set(
      "Content-Disposition",
      `${inlineExtensions.includes(ext) ? "inline" : "attachment"}; filename="${path.basename(filePath)}"`
    );
  }
};

// Profile avatars only via static URL (img tags). Assignments/submissions/messages
// require authenticated /api/files/* routes — guessing /uploads/... no longer works.
configureUploadStatic(app, { setHeaders: setCustomHeaders });

/* ===============================
    Health (before SPA static fallback)
================================= */
function sendHealth(_req, res) {
  res.status(200).json({
    status: "ok",
    service: "QuickCheck Hub",
    mode: "full",
  });
}
app.get("/api/health", sendHealth);
app.get("/health", sendHealth);

/* ===============================
    API Routes
================================= */
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/teacher", teacherRoutes);
app.use("/api/student", studentRoutes);
app.use("/api/evaluation", evaluationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/plagiarism", plagiarismRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/files", fileRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/ai-chats", aiChatRoutes);

/* ===============================
    Same-origin SPA (Vite production build)
================================= */
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    return res.sendFile(path.join(frontendDist, "index.html"));
  });
}

/* ===============================
    Safe API error handler (after routes)
================================= */
app.use((err, req, res, next) => {
  if (err && err.code === "R2_NOT_CONFIGURED") {
    return res.status(503).json({
      message:
        err.message ||
        "Cloudflare R2 is required on Vercel but is not configured.",
    });
  }
  return next(err);
});

/* ===============================
    Listen (Hostinger / local). Skip on Vercel serverless.
================================= */
const PORT = process.env.PORT || 5000;
const shouldListen = process.env.VERCEL !== "1";

if (shouldListen) {
  app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📂 Upload storage root: ${uploadsPath}`);
    console.log("🔒 Academic uploads require authenticated /api/files routes.");
    if (fs.existsSync(frontendDist)) {
      console.log(`🌐 Serving frontend build from: ${frontendDist}`);
    }
  });
}

module.exports = app;
