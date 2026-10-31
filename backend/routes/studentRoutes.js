const express = require("express");
const fs = require("fs");
const router = express.Router();
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const { protect, authorize } = require("../middleware/authMiddleware");
const upload = require("../middleware/multerMiddleware");
const { create: createNotification } = require("../controllers/notificationController");
const storedFiles = require("../utils/storedFiles");
const path = require("path");

// Students only — marks/feedback shown after teacher publish.
router.use(protect, authorize("student"));

const PUBLISHED = ["PUBLISHED"];

router.get("/dashboard-stats", async (req, res) => {
  try {
    const [assignments, submissions] = await Promise.all([
      Assignment.find({ status: "active" }).select("title subject points createdAt"),
      Submission.find({ student: req.user._id }).populate("assignment", "title subject points"),
    ]);
    const submittedCount = submissions.length;
    const graded = submissions.filter(
      (s) =>
        PUBLISHED.includes(s.status) &&
        Number.isFinite(Number(s.marks ?? s.aiScore)) &&
        Number(s.totalMarks) > 0
    );
    const gradedCount = graded.length;
    const pendingCount = Math.max(assignments.length - submittedCount, 0);
    const score = (s) => Number(s.marks ?? s.aiScore);
    const performanceHistory = graded.slice(-12).map((s, i) => ({
      assignmentId: String(s.assignment?._id || ""),
      assignmentNumber: i + 1,
      name: s.assignment?.title || `Assignment ${i + 1}`,
      score: Math.round((score(s) / Number(s.totalMarks)) * 100),
      marks: score(s),
      totalMarks: Number(s.totalMarks),
    }));
    res.json({
      name: req.user.name,
      regNo: req.user.registrationNumber || "N/A",
      tasksCompleted: gradedCount,
      averageScore: gradedCount
        ? Math.round(
            graded.reduce((sum, s) => sum + (score(s) / Number(s.totalMarks)) * 100, 0) /
              gradedCount
          )
        : 0,
      gradeDistribution: [
        { name: "Submitted", value: submittedCount },
        { name: "Checked", value: gradedCount },
        { name: "Pending", value: pendingCount },
      ],
      subjectWise: graded.slice(-12).map((s) => ({
        subject: s.assignment?.subject || s.assignment?.title || "Assignment",
        score: Math.round((score(s) / Number(s.totalMarks)) * 100),
      })),
      performanceHistory,
    });
  } catch (error) {
    console.error("DASHBOARD ERROR:", error);
    res.status(500).json({ message: "Error fetching dashboard stats" });
  }
});

router.get("/assignments", async (req, res) => {
  try {
    const now = Date.now();
    // Active assignments only. Deactive = teacher-hidden drafts/closed items.
    const assignments = await Assignment.find({ status: "active" }).sort({ createdAt: -1 }).lean();
    const finalAssignments = await Promise.all(
      assignments.map(async (assignment) => {
        const submission = await Submission.findOne({
          assignment: assignment._id,
          student: req.user._id,
        }).lean();
        const canShowResult = submission && PUBLISHED.includes(submission.status);
        const opensAt = assignment.startDate ? new Date(assignment.startDate).getTime() : 0;
        const dueAt = assignment.deadline ? new Date(assignment.deadline).getTime() : null;
        const notOpenYet = opensAt && now < opensAt;
        const overdue = dueAt != null && now > dueAt;
        const canSubmit = !submission && !notOpenYet && !overdue;
        // Until publish, do not expose AI_GRADED/graded process status to students.
        const studentStatus = !submission
          ? "pending"
          : canShowResult
            ? "PUBLISHED"
            : "submitted";
        const awaitingLabel = !submission
          ? notOpenYet
            ? "Not open yet"
            : overdue
              ? "Closed"
              : "Open"
          : canShowResult
            ? "Published"
            : "Awaiting evaluation";
        return {
          ...assignment,
          status: studentStatus,
          marks: canShowResult ? submission.marks ?? submission.aiScore : null,
          totalMarks: submission?.totalMarks || assignment.points || null,
          feedback: canShowResult ? submission.feedback || submission.aiFeedback || "" : "",
          aiScore: canShowResult ? submission.aiScore : null,
          aiFeedback: canShowResult ? submission.aiFeedback || "" : "",
          aiStrengths: canShowResult ? submission.aiStrengths || [] : [],
          aiImprovements: canShowResult ? submission.aiImprovements || [] : [],
          checkedAt: canShowResult ? submission.updatedAt || submission.createdAt : null,
          resultStatus: canShowResult ? submission.status : "PENDING",
          submissionId: submission?._id || null,
          // Keep Teacher assignment reference name on originalFileName (from ...assignment).
          // Do not overwrite it with the student's uploaded filename.
          originalFileName: assignment.originalFileName || "",
          submissionOriginalFileName: submission?.originalFileName || "",
          isSubmitted: Boolean(submission),
          canSubmit,
          availabilityLabel: awaitingLabel,
        };
      })
    );
    res.json(finalAssignments);
  } catch (error) {
    console.error("ASSIGNMENT ERROR:", error);
    res.status(500).json({ message: "Error fetching assignments" });
  }
});

router.get("/my-submissions", async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate("assignment", "title points subject")
      .sort({ createdAt: -1 })
      .lean();

    // Hide unpublished marks/feedback from the student payload.
    const safe = submissions.map((s) => {
      if (PUBLISHED.includes(s.status)) return s;
      return {
        ...s,
        marks: null,
        aiScore: null,
        feedback: "",
        aiFeedback: "",
        aiStrengths: [],
        aiImprovements: [],
      };
    });
    res.json(safe);
  } catch (error) {
    res.status(500).json({ message: "Unable to load submissions" });
  }
});

// Policy: students cannot delete their own submissions (preserve academic history).
router.delete("/submissions/:id", async (req, res) => {
  return res.status(403).json({
    message: "Students cannot delete submissions. Contact your teacher if a correction is needed.",
  });
});

router.post("/submissions/bulk-delete", async (req, res) => {
  return res.status(403).json({
    message: "Students cannot delete submissions. Contact your teacher if a correction is needed.",
  });
});

router.post("/assignments/:id/submit", upload.single("file"), async (req, res) => {
  let createdTextStored = null;
  try {
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });
    if (assignment.status !== "active") {
      return res.status(400).json({ message: "This assignment is not active." });
    }

    const now = Date.now();
    if (assignment.startDate && now < new Date(assignment.startDate).getTime()) {
      return res.status(400).json({ message: "This assignment is not open for submissions yet." });
    }
    if (assignment.deadline && now > new Date(assignment.deadline).getTime()) {
      return res.status(400).json({ message: "The submission deadline has passed." });
    }

    // Resubmission is not supported: block duplicates before writing any new file.
    const existingSubmission = await Submission.findOne({
      assignment: assignment._id,
      student: req.user._id,
    });
    if (existingSubmission) {
      if (req.file?.filename) {
        await storedFiles.remove(`uploads/submissions/${req.file.filename}`).catch(() => {});
      } else if (req.file?.path && fs.existsSync(req.file.path)) {
        await fs.promises.unlink(req.file.path).catch(() => {});
      }
      return res.status(400).json({
        message: "You have already submitted this assignment.",
        code: "ALREADY_SUBMITTED",
      });
    }

    const answerText = String(req.body?.answerText || req.body?.text || "").trim();
    if (!req.file && answerText && answerText.length < 3) {
      return res.status(400).json({
        message: "Text answer is too short. Enter at least a few words.",
      });
    }
    let storedFile = req.file;
    if (!storedFile && answerText) {
      // Text answer path: persist as a .txt under submissions for Gemini extract + demo durability.
      const safeBase = `text-${req.user._id}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}.txt`;
      createdTextStored = `uploads/submissions/${safeBase}`;
      await storedFiles.writeBuffer(
        createdTextStored,
        Buffer.from(answerText.slice(0, 120000), "utf8"),
        "text/plain"
      );
      storedFile = {
        filename: safeBase,
        originalname: "answer.txt",
        mimetype: "text/plain",
        path: createdTextStored,
      };
    }

    const { resolveDurableUpload } = require("../utils/resolveDurableUpload");
    let durable = null;
    try {
      durable = await resolveDurableUpload(req, {
        category: "submissions",
        folder: "submissions",
      });
    } catch (uploadErr) {
      if (createdTextStored) {
        await storedFiles.remove(createdTextStored).catch(() => {});
      }
      const status = uploadErr.statusCode || 400;
      return res.status(status).json({
        message: uploadErr.message || "Submission file upload is invalid.",
        code: uploadErr.code,
      });
    }

    if (durable?.storedPath) {
      storedFile = {
        filename: durable.storedPath.split("/").pop(),
        originalname: durable.originalFileName,
        mimetype: durable.fileMimeType,
        path: durable.storedPath,
        storedPath: durable.storedPath,
      };
    }

    if (!storedFile) {
      return res.status(400).json({
        message: "Upload a supported file or provide a short text answer.",
      });
    }

    if (!assignment.teacher) {
      if (createdTextStored) {
        await storedFiles.remove(createdTextStored).catch(() => {});
      }
      return res.status(400).json({ message: "Assignment is not linked to a teacher." });
    }

    const submissionFilePath =
      storedFile.storedPath || `uploads/submissions/${storedFile.filename}`;

    const submission = await Submission.create({
      assignment: assignment._id,
      student: req.user._id,
      teacherId: assignment.teacher,
      file: submissionFilePath,
      originalFileName: storedFile.originalname || storedFile.filename,
      fileMimeType: storedFile.mimetype || "",
      answerText: answerText ? answerText.slice(0, 120000) : "",
      status: "submitted",
      totalMarks: assignment.points || null,
      submittedAt: new Date(),
    });
    await createNotification({
      recipient: assignment.teacher,
      title: "New assignment submission",
      message: `${req.user.name} submitted ${assignment.title}.`,
      type: "submission",
      meta: { assignmentId: assignment._id, submissionId: submission._id },
      url: "/dashboard/teacher",
    });
    res.status(201).json({
      success: true,
      message: "Assignment submitted successfully",
      submission,
    });
  } catch (error) {
    if (createdTextStored) {
      await storedFiles.remove(createdTextStored).catch(() => {});
    }
    if (error.code === "R2_NOT_CONFIGURED") {
      return res.status(503).json({ message: error.message });
    }
    console.error("SUBMISSION ERROR:", error);
    res.status(500).json({ message: "Server error while submitting assignment." });
  }
});

module.exports = router;
