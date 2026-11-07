const { evaluateAssignmentWindow } = require("../utils/assignmentAvailability");
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
const {
  flushAssignmentAvailabilityNotifications,
} = require("../utils/flushAssignmentAvailabilityNotifications");
const {
  hasAnyPublishedResult,
  canShowAiResult,
  canShowTeacherMarks,
  hasValidAiScore,
  hasValidTeacherMarks,
  redactSubmissionForStudent,
} = require("../utils/publicationVisibility");

// Students only — marks/feedback shown after teacher publish.
router.use(protect, authorize("student"));

const PUBLISHED = ["PUBLISHED"];

router.get("/dashboard-stats", async (req, res) => {
  try {
    const [assignments, submissions] = await Promise.all([
      Assignment.find({ status: "active" }).select("title subject points createdAt startDate deadline"),
      Submission.find({ student: req.user._id }).populate("assignment", "title subject points"),
    ]);
    const now = Date.now();
    const visibleAssignments = assignments.filter((assignment) =>
      evaluateAssignmentWindow(assignment.startDate, assignment.deadline, now).visibleToStudent
    );
    const visibleIds = new Set(visibleAssignments.map((assignment) => String(assignment._id)));
    const submittedCount = submissions.length;
    const graded = submissions.filter((s) => {
      if (!hasAnyPublishedResult(s) || !(Number(s.totalMarks) > 0)) return false;
      const teacherOk = canShowTeacherMarks(s) && hasValidTeacherMarks(s);
      const aiOk = canShowAiResult(s) && hasValidAiScore(s);
      return teacherOk || aiOk;
    });
    const gradedCount = graded.length;
    const pendingCount = Math.max(
      visibleAssignments.length -
        submissions.filter((submission) =>
          visibleIds.has(String(submission.assignment?._id || submission.assignment))
        ).length,
      0
    );
    const score = (s) => {
      if (canShowTeacherMarks(s) && hasValidTeacherMarks(s)) return Number(s.marks);
      if (canShowAiResult(s) && hasValidAiScore(s)) return Number(s.aiScore);
      return 0;
    };
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
    // Catch up scheduled "available" notifications (idempotent; no setTimeout).
    await flushAssignmentAvailabilityNotifications({ limit: 20 });
    const now = Date.now();
    // Active assignments only. Deactive = teacher-hidden drafts/closed items.
    const assignments = await Assignment.find({ status: "active" }).sort({ createdAt: -1 }).lean();
    const finalAssignments = (
      await Promise.all(
      assignments.map(async (assignment) => {
        const windowState = evaluateAssignmentWindow(
          assignment.startDate,
          assignment.deadline,
          now
        );
        if (!windowState.visibleToStudent) return null;
        const submission = await Submission.findOne({
          assignment: assignment._id,
          student: req.user._id,
        }).lean();
        const canShowResult = Boolean(submission && hasAnyPublishedResult(submission));
        const notOpenYet = windowState.notOpenYet;
        const overdue = windowState.deadlineReached;
        const canSubmit = !submission && windowState.canSubmit;
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
        const canAccessMaterials = !notOpenYet;
        const hasFile = Boolean(assignment.file || assignment.fileUrl);
        // Never expose storage keys/URLs to students; redact materials before open time.
        const {
          file: _omitFile,
          fileUrl: _omitFileUrl,
          ...assignmentPublic
        } = assignment;
        const safeSubmission = submission ? redactSubmissionForStudent(submission) : null;
        return {
          ...assignmentPublic,
          file: undefined,
          fileUrl: undefined,
          hasFile: canAccessMaterials ? hasFile : false,
          status: studentStatus,
          // Independent fields from redaction helper — never coalesce AI into Teacher marks.
          marks: safeSubmission ? safeSubmission.marks : null,
          totalMarks: submission?.totalMarks || assignment.points || null,
          feedback: safeSubmission ? safeSubmission.feedback : "",
          aiScore: safeSubmission ? safeSubmission.aiScore : null,
          aiFeedback: safeSubmission?.aiFeedback || "",
          aiStrengths: safeSubmission?.aiStrengths || [],
          aiImprovements: safeSubmission?.aiImprovements || [],
          aiPublished: Boolean(safeSubmission?.aiPublished),
          teacherMarksPublished: Boolean(safeSubmission?.teacherMarksPublished),
          teacherFeedbackPublished: Boolean(safeSubmission?.teacherFeedbackPublished),
          checkedAt: canShowResult ? submission.updatedAt || submission.createdAt : null,
          resultStatus: canShowResult ? "PUBLISHED" : "PENDING",
          submissionId: submission?._id || null,
          originalFileName: canAccessMaterials
            ? assignment.originalFileName || ""
            : "",
          submissionOriginalFileName: submission?.originalFileName || "",
          isSubmitted: Boolean(submission),
          canSubmit,
          canAccessMaterials,
          notOpenYet: Boolean(notOpenYet),
          availabilityLabel: awaitingLabel,
        };
      })
    )
    ).filter(Boolean);
    res.json(finalAssignments);
  } catch (error) {
    console.error("ASSIGNMENT ERROR:", error);
    res.status(500).json({ message: "Error fetching assignments" });
  }
});

router.get("/my-submissions", async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate(
        "assignment",
        "title points subject startDate deadline originalFileName file fileUrl fileMimeType"
      )
      .sort({ createdAt: -1 })
      .lean();

    // Hide unpublished marks/feedback; expose a student-safe assignment summary
    // (dates + hasFile) without storage keys/URLs.
    const safe = submissions.map((s) => {
      const redacted = redactSubmissionForStudent(s);
      const assignment =
        s.assignment && typeof s.assignment === "object" ? s.assignment : null;
      const hasFile = Boolean(
        assignment &&
          (assignment.file || assignment.fileUrl || assignment.originalFileName)
      );
      const publicAssignment = assignment
        ? {
            _id: assignment._id,
            title: assignment.title || "",
            subject: assignment.subject || "",
            points: assignment.points ?? null,
            startDate: assignment.startDate || null,
            deadline: assignment.deadline || null,
            originalFileName: assignment.originalFileName || (hasFile ? "assignment" : ""),
            hasFile,
          }
        : null;
      return {
        ...redacted,
        assignment: publicAssignment,
        // Convenience mirrors used by the Student Checked Results mapper.
        startDate: publicAssignment?.startDate || null,
        deadline: publicAssignment?.deadline || null,
        assignmentOriginalFileName: publicAssignment?.originalFileName || "",
        hasFile: Boolean(publicAssignment?.hasFile),
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
    message: "Students cannot delete submissions.",
  });
});

router.post("/submissions/bulk-delete", async (req, res) => {
  return res.status(403).json({
    message: "Students cannot delete submissions.",
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

    const windowState = evaluateAssignmentWindow(
      assignment.startDate,
      assignment.deadline,
      Date.now()
    );
    if (windowState.notOpenYet) {
      return res.status(400).json({ message: "Assignment is not open yet." });
    }
    if (windowState.deadlineReached) {
      return res.status(400).json({ message: "Submission deadline has passed." });
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
        message: "Answer is too short.",
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
        message: "Upload a file or enter an answer.",
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
    res.status(500).json({ message: "Unable to submit. Please try again." });
  }
});

module.exports = router;
