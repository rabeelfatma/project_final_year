const Submission = require("../models/Submission");
const { extractText, compareTexts } = require("../services/plagiarismService");
const storedFiles = require("../utils/storedFiles");

async function extractStoredText(stored) {
  if (!stored) return "";
  let materialized;
  try {
    if (!(await storedFiles.exists(stored))) return "";
    materialized = await storedFiles.materialize(stored);
    return await extractText(materialized.path);
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") throw error;
    return "";
  } finally {
    if (materialized) await materialized.cleanup();
  }
}

exports.check = async (req, res) => {
  try {
    const ids = Array.isArray(req.body.submissionIds) ? req.body.submissionIds.slice(0, 50) : [];
    if (!ids.length) return res.status(400).json({ message: "Select at least one submission." });

    // Teachers are scoped to their own submissions; admins may inspect by id.
    const scope =
      req.user.role === "admin"
        ? { _id: { $in: ids } }
        : { _id: { $in: ids }, teacherId: req.user._id };

    const selected = await Submission.find(scope)
      .populate("student", "name email registrationNumber")
      .populate("assignment", "title points");

    const results = [];
    for (const submission of selected) {
      const peerScope =
        req.user.role === "admin"
          ? {
              assignment: submission.assignment?._id || submission.assignment,
              _id: { $ne: submission._id },
            }
          : {
              assignment: submission.assignment?._id || submission.assignment,
              teacherId: req.user._id,
              _id: { $ne: submission._id },
            };
      const sameAssignment = await Submission.find(peerScope).populate(
        "student",
        "name email registrationNumber"
      );

      const currentText = await extractStoredText(submission.file);

      const comparisons = [];
      for (const other of sameAssignment) {
        const otherText = await extractStoredText(other.file);
        comparisons.push({
          submissionId: other._id,
          student: other.student?.name || "Student",
          similarity: compareTexts(currentText, otherText),
        });
      }

      comparisons.sort((a, b) => b.similarity - a.similarity);
      const highest = comparisons[0]?.similarity || 0;
      results.push({
        submissionId: submission._id,
        student: submission.student?.name || "Student",
        assignment: submission.assignment?.title || "Assignment",
        similarity: highest,
        status: highest >= 70 ? "HIGH" : highest >= 35 ? "REVIEW" : "LOW",
        comparedWith: comparisons[0] || null,
        note: currentText
          ? "Local text-shingle similarity check completed. This is a similarity indicator, not a final academic misconduct decision."
          : "No extractable text was found for this file type; manual review is required.",
      });
    }

    res.json({ results });
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") {
      return res.status(503).json({ message: error.message });
    }
    res.status(500).json({ message: "Plagiarism check failed", error: error.message });
  }
};
