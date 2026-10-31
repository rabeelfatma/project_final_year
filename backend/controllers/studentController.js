
const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/multerMiddleware");
const { create: createNotification } = require("../controllers/notificationController");
const storedFiles = require("../utils/storedFiles");

// NOTE: Runtime uses backend/routes/studentRoutes.js (PUBLISHED-only visibility).
// Keep this unused module aligned so it cannot be re-mounted with a weaker gate.
const GRADED = ["PUBLISHED"];

// Dashboard stats
router.get("/dashboard-stats", protect, async (req, res) => {
  try {
    const [assignments, submissions] = await Promise.all([
      Assignment.find({ status: "active" }).select("title subject points createdAt"),
      Submission.find({ student: req.user._id }).populate("assignment", "title subject points"),
    ]);

    const submittedCount = submissions.length;
    const graded = submissions.filter(
      (s) =>
        GRADED.includes(s.status) &&
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
            graded.reduce(
              (sum, s) => sum + (score(s) / Number(s.totalMarks)) * 100,
              0
            ) / gradedCount
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
    res.status(500).json({
      message: "Error fetching dashboard stats",
      error: error.message,
    });
  }
});

// Get assignments
router.get("/assignments", protect, async (req, res) => {
  try {
    const assignments = await Assignment.find({ status: "active" })
      .sort({ createdAt: -1 })
      .lean();

    const finalAssignments = await Promise.all(
      assignments.map(async (assignment) => {
        const submission = await Submission.findOne({
          assignment: assignment._id,
          student: req.user._id,
        }).lean();

        const canShowResult = submission && GRADED.includes(submission.status);
        const studentStatus = !submission
          ? "pending"
          : canShowResult
            ? "PUBLISHED"
            : "submitted";

        return {
          ...assignment,
          status: studentStatus,
          marks: canShowResult
            ? submission.marks ?? submission.aiScore
            : null,
          totalMarks: submission?.totalMarks || assignment.points || null,
          feedback: canShowResult
            ? submission.feedback || submission.aiFeedback || ""
            : "",
          aiScore: canShowResult ? submission.aiScore : null,
          aiFeedback: canShowResult ? submission.aiFeedback || "" : "",
          checkedAt: canShowResult
            ? submission.updatedAt || submission.createdAt
            : null,
          resultStatus: canShowResult ? submission.status : "PENDING",
          submissionId: submission?._id || null,
          originalFileName: submission?.originalFileName || "",
          isSubmitted: Boolean(submission),
        };
      })
    );

    res.json(finalAssignments);
  } catch (error) {
    console.error("ASSIGNMENT ERROR:", error);
    res.status(500).json({
      message: "Error fetching assignments",
      error: error.message,
    });
  }
});

// Get student's submissions
router.get("/my-submissions", protect, async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate("assignment", "title points subject")
      .sort({ createdAt: -1 });

    res.json(submissions);
  } catch (error) {
    res.status(500).json({
      message: "Unable to load submissions",
      error: error.message,
    });
  }
});

// Policy: students cannot delete their own submissions (preserve academic history).
router.delete("/submissions/:id", protect, async (req, res) => {
  return res.status(403).json({
    message: "Students cannot delete submissions. Contact your teacher if a correction is needed.",
  });
});

// Bulk delete blocked for students (legacy route kept for clear 403).
router.post("/submissions/bulk-delete", protect, async (req, res) => {
  return res.status(403).json({
    message: "Students cannot delete submissions. Contact your teacher if a correction is needed.",
  });
});

// Submit assignment
router.post(
  "/assignments/:id/submit",
  protect,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "File upload required" });
      }

      const assignment = await Assignment.findById(req.params.id);

      if (!assignment) {
        return res.status(404).json({ message: "Assignment not found" });
      }

      if (assignment.status !== "active") {
        return res.status(400).json({
          message: "This assignment is not active.",
        });
      }

      const exists = await Submission.findOne({
        assignment: assignment._id,
        student: req.user._id,
      });

      if (exists) {
        // Remove newly uploaded file when duplicate submission is rejected.
        if (req.file?.filename) {
          await storedFiles
            .remove(`uploads/submissions/${req.file.filename}`)
            .catch(() => {});
        } else if (req.file?.path && fs.existsSync(req.file.path)) {
          await fs.promises.unlink(req.file.path).catch(() => {});
        }

        return res.status(400).json({ message: "Already submitted" });
      }

      if (!assignment.teacher) {
        return res.status(400).json({
          message: "Assignment is not linked to a teacher.",
        });
      }

      const submission = await Submission.create({
        assignment: assignment._id,
        student: req.user._id,
        teacherId: assignment.teacher,
        file: `uploads/submissions/${req.file.filename}`,
        originalFileName: req.file.originalname || req.file.filename,
        fileMimeType: req.file.mimetype || "",
        status: "submitted",
        totalMarks: assignment.points || null,
        submittedAt: new Date(),
      });

      await createNotification({
        recipient: assignment.teacher,
        title: "New assignment submission",
        message: `${req.user.name} submitted ${assignment.title}.`,
        type: "submission",
        meta: {
          assignmentId: assignment._id,
          submissionId: submission._id,
        },
        url: "/dashboard/teacher",
      });

      res.status(201).json({
        success: true,
        message: "Assignment submitted successfully",
        submission,
      });
    } catch (error) {
      console.error("SUBMISSION ERROR:", error);
      res.status(500).json({
        message: "Server error: " + error.message,
      });
    }
  }
);

module.exports = router;
