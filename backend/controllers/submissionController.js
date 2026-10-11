const Submission = require("../models/Submission");
const Assignment = require("../models/Assignment");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 1. Dashboard data for Teachers
exports.getTeacherSubmissions = async (req, res) => {
  try {
    const submissions = await Submission.find({ teacherId: req.user._id })
      .populate('student', 'name regNo email') // already correct
      .populate('assignment', 'title totalMarks points')
      .sort({ createdAt: -1 });

    res.status(200).json(submissions);
  } catch (err) {
    res.status(500).json({ message: "Error fetching submissions: " + err.message });
  }
};

// 2. Manual evaluation endpoint kept for compatibility.
exports.evaluateAssignment = async (req, res) => {
  try {
    const { marks, feedback, status } = req.body;
    const submission = await Submission.findById(req.params.id).populate("assignment", "points");
    if (!submission) return res.status(404).json({ message: "Submission not found" });

    const totalMarks = Number(submission.totalMarks || submission.assignment?.points);
    const numericMarks = Number(marks);
    if (!Number.isFinite(numericMarks) || !Number.isFinite(totalMarks) || numericMarks < 0 || numericMarks > totalMarks) {
      return res.status(400).json({ message: `Marks must be between 0 and ${totalMarks || "the assignment total"}.` });
    }

    submission.marks = numericMarks;
    submission.totalMarks = totalMarks;
    submission.feedback = String(feedback || "");
    submission.status = status || "graded";
    await submission.save();

    res.json({ success: true, message: "Evaluation saved successfully", data: submission });
  } catch (err) {
    res.status(500).json({ message: "Error saving evaluation: " + err.message });
  }
};

// 3. Submit Assignment
exports.submitAssignment = async (req, res) => {
  try {
    const assignmentId = req.params.id;

    console.log("🚀 SUBMIT API HIT");

    const assignmentExists = await Assignment.findById(assignmentId);
    if (!assignmentExists) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    // Duplicate submission check
    const existing = await Submission.findOne({
      assignment: assignmentId,
      student: req.user._id
    });

    if (existing) {
      return res.status(400).json({
        message: "You have already submitted this assignment"
      });
    }

    const filePath = `uploads/submissions/${req.file.filename}`;

    const submission = new Submission({
      assignment: assignmentId,
      student: req.user._id,
      teacherId: assignmentExists.teacher,
      file: filePath,
      originalFileName: req.file.originalname || req.file.filename,
      fileMimeType: req.file.mimetype || "",
      status: "submitted",
      aiFeedback: "No AI feedback available yet",
      aiScore: null,
      marks: null,
      totalMarks: assignmentExists.points || null,
      createdAt: new Date()
    });

    await submission.save();

    console.log("✅ Submission saved in DB:", submission);

    res.status(201).json({
      success: true,
      message: "Submitted successfully",
      data: submission
    });

  } catch (err) {
    console.error("❌ Submission DB Error:", err);
    res.status(500).json({ message: "Submission failed: " + err.message });
  }
};