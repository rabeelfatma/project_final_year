const Assignment = require("../models/Assignment");
const User = require("../models/User");
const Submission = require("../models/Submission");

const GRADED = ["graded", "GRADED", "AI_GRADED", "PUBLISHED", "Graded"];

function monthBuckets(count = 6) {
  const result = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    result.push({ label: start.toLocaleString("en-US", { month: "short" }), start, end });
  }
  return result;
}

exports.getStudentDashboardStats = async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id }).populate("assignment", "title points subject").sort({ createdAt: 1 });
    const graded = submissions.filter((s) => GRADED.includes(s.status) && Number(s.totalMarks) > 0 && Number.isFinite(Number(s.marks)));
    const averageScore = graded.length
      ? Math.round(graded.reduce((sum, s) => sum + (Number(s.marks) / Number(s.totalMarks)) * 100, 0) / graded.length)
      : 0;

    res.json({
      performanceData: graded.slice(-8).map((s, index) => ({
        month: s.assignment?.title?.slice(0, 12) || String(index + 1),
        score: Math.round((Number(s.marks) / Number(s.totalMarks)) * 100),
      })),
      pieData: [
        { name: "Submitted", value: submissions.length },
        { name: "Graded", value: graded.length },
        { name: "Pending", value: Math.max(submissions.length - graded.length, 0) },
      ],
      averageScore,
      tasksCompleted: graded.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching student analytics", error: error.message });
  }
};

exports.getTeacherDashboardStats = async (req, res) => {
  try {
    const assignments = await Assignment.find({ teacher: req.user._id }).select("_id createdAt");
    const ids = assignments.map((a) => a._id);
    const submissions = await Submission.find({ assignment: { $in: ids } });
    res.json({
      totalCreated: assignments.length,
      totalStudents: new Set(submissions.map((s) => String(s.student))).size,
      pendingCount: submissions.filter((s) => !GRADED.includes(s.status)).length,
      completedCount: submissions.filter((s) => GRADED.includes(s.status)).length,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching teacher analytics", error: error.message });
  }
};

exports.getAdminStats = async (_req, res) => {
  try {
    const [totalUsers, totalTeachers, totalStudents, totalAssignments] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "teacher" }),
      User.countDocuments({ role: "student" }),
      Assignment.countDocuments(),
    ]);
    res.json({ totalUsers, totalTeachers, totalStudents, totalAssignments });
  } catch (error) {
    res.status(500).json({ message: "Error fetching admin stats", error: error.message });
  }
};

exports.getOverview = async (req, res) => {
  try {
    const role = req.user.role;
    const months = monthBuckets(6);
    let line = [];
    let bar = [];
    let pie = [];

    if (role === "student") {
      const submissions = await Submission.find({ student: req.user._id });
      line = months.map((m) => ({ label: m.label, value: submissions.filter((s) => s.createdAt >= m.start && s.createdAt < m.end).length }));
      bar = [
        { label: "Submitted", value: submissions.length },
        { label: "Graded", value: submissions.filter((s) => GRADED.includes(s.status)).length },
        { label: "Pending", value: submissions.filter((s) => !GRADED.includes(s.status)).length },
      ];
      pie = bar.map((item) => ({ label: item.label, value: item.value }));
    } else if (role === "teacher") {
      const assignments = await Assignment.find({ teacher: req.user._id });
      const ids = assignments.map((a) => a._id);
      const submissions = await Submission.find({ assignment: { $in: ids } });
      line = months.map((m) => ({ label: m.label, value: submissions.filter((s) => s.createdAt >= m.start && s.createdAt < m.end).length }));
      bar = [
        { label: "Assignments", value: assignments.length },
        { label: "Submissions", value: submissions.length },
        { label: "Graded", value: submissions.filter((s) => GRADED.includes(s.status)).length },
      ];
      pie = bar.map((item) => ({ label: item.label, value: item.value }));
    } else {
      const users = await User.find({}, "role createdAt");
      const assignments = await Assignment.find({}, "createdAt");
      line = months.map((m) => ({ label: m.label, value: users.filter((u) => u.createdAt >= m.start && u.createdAt < m.end).length }));
      bar = [
        { label: "Students", value: users.filter((u) => u.role === "student").length },
        { label: "Teachers", value: users.filter((u) => u.role === "teacher").length },
        { label: "Assignments", value: assignments.length },
      ];
      pie = bar.map((item) => ({ label: item.label, value: item.value }));
    }

    res.json({ line, bar, pie });
  } catch (error) {
    res.status(500).json({ message: "Unable to calculate analytics", error: error.message });
  }
};
