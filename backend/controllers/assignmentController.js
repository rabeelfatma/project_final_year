const fs = require("fs");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const User = require("../models/User");
const { checkAssignment } = require("../services/geminiService");
const { extractText } = require("../services/plagiarismService");
const { resolveStoredUploadPath } = require("../utils/uploadsPath");

// 1. TEACHER: Create Assignment
exports.teacherCreateAssignment = async (req, res) => {
  try {
    const { title, description, startDate, deadline, points } = req.body;

    const teacherProfile = await User.findById(req.user._id);

    if (!teacherProfile) {
      return res.status(404).json({ message: "Teacher profile not found" });
    }

    const finalSubject = teacherProfile.subject || "General";

    let fileUrl = null;
    if (req.file && req.file.filename) {
      fileUrl = `uploads/assignments/${req.file.filename}`;
    }

    if (!title || !description || !startDate || !deadline) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    const newAssignment = new Assignment({
      title,
      description,
      startDate,
      deadline,
      points,
      subject: finalSubject,
      teacher: req.user._id,
      status: "active",
      fileUrl: fileUrl,
    });

    await newAssignment.save();

    res.status(201).json({ success: true, data: newAssignment });
  } catch (error) {
    console.error("CREATE ASSIGNMENT ERROR:", error);
    res
      .status(500)
      .json({ message: "Error creating assignment", error: error.message });
  }
};

exports.evaluateWithGemini = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.submissionIds) ? req.body.submissionIds.slice(0, 40) : [];
    const instructions = String(req.body.teacherInstructions || "").trim();
    if (!ids.length) return res.status(400).json({ message: "No submissions selected" });
    if (!instructions) return res.status(400).json({ message: "Teacher grading instructions are required." });

    const results = [];
    for (const id of ids) {
      try {
        const submission = await Submission.findById(id).populate("assignment", "title points");
        if (!submission) { results.push({ id, status: "Not Found" }); continue; }
        let filePath;
        try {
          filePath = resolveStoredUploadPath(submission.file);
        } catch (_) {
          results.push({ id, status: "Failed", error: "Submitted file was not found." });
          continue;
        }
        if (!fs.existsSync(filePath)) { results.push({ id, status: "Failed", error: "Submitted file was not found." }); continue; }
        const text = await extractText(filePath);
        const totalMarks = Number(submission.totalMarks || submission.assignment?.points);
        const ai = await checkAssignment(text, instructions, totalMarks);
        submission.aiScore = ai.score;
        submission.aiFeedback = ai.feedback;
        submission.totalMarks = totalMarks;
        submission.status = "AI_GRADED";
        await submission.save();
        results.push({ id, status: "Success", aiScore: ai.score, totalMarks });
      } catch (err) { results.push({ id, status: "Failed", error: err.message }); }
    }
    res.status(200).json({ success: true, results });
  } catch (error) {
    res.status(500).json({ message: "AI Grading Failed", error: error.message });
  }
};

// 3. Disabled old upload
exports.uploadAssignmentFile = async (req, res) => {
  return res.status(400).json({
    message:
      "This API is disabled. Use /assignments/:id/submit to create a submission record.",
  });
};

// 4. GET ASSIGNMENTS
exports.getAssignments = async (req, res) => {
  try {
    let assignments;

    if (req.user.role === "teacher") {
      assignments = await Assignment.find({ teacher: req.user._id });
    } else if (req.user.role === "student") {
      const query = { status: "active" };
      if (req.user.subject) query.subject = req.user.subject;
      assignments = await Assignment.find(query).sort({ createdAt: -1 });
    } else {
      assignments = await Assignment.find({ status: "active" });
    }

    res.status(200).json(assignments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching assignments" });
  }
};

// 5. TEACHER: Manual Evaluate
// ✅ FIX: This route is called by frontend teacherService.updateFinalGrade()
// Frontend calls: PUT /api/assignments/evaluate/:id
// With body: { marks, feedback, status }
exports.evaluateAssignment = async (req, res) => {
  try {
    const { marks, feedback, status } = req.body;

    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // ✅ FIX: Update both mark keys for consistency with frontend
    submission.marks = marks;
    submission.aiScore = marks;
    submission.feedback = feedback || "";
    submission.aiFeedback = feedback || "";
    // ✅ FIX: Accept status from frontend (PUBLISHED or graded)
    submission.status = status || "graded";

    await submission.save();

    res.status(200).json({ success: true, data: submission });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Grading failed", error: error.message });
  }
};

// 6. TEACHER STATS
exports.getTeacherStats = async (req, res) => {
  try {
    const total = await Assignment.countDocuments({ teacher: req.user._id });

    const assignments = await Assignment.find({ teacher: req.user._id });
    const assignmentIds = assignments.map((a) => a._id);

    const submitted = await Submission.countDocuments({
      assignment: { $in: assignmentIds },
      status: "submitted",
    });

    res.status(200).json({ total, submitted });
  } catch (error) {
    res.status(500).json({ message: "Error fetching stats" });
  }
};