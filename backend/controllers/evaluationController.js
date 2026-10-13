const Submission = require("../models/Submission");
const { checkAssignment } = require("../services/geminiService");
const mammoth = require("mammoth");
const path = require("path");
const fs = require("fs");
const { resolveStoredUploadPath } = require("../utils/uploadsPath");

function ownedQuery(req, extra = {}) {
  return { ...extra, teacherId: req.user._id };
}

exports.evaluateAssignment = async (req, res) => {
  try {
    const { submissionIds, teacherInstructions } = req.body;
    const instructions = String(teacherInstructions || "").trim();
    if (!instructions) {
      return res.status(400).json({ error: "Teacher grading instructions are required." });
    }

    if (!submissionIds || !Array.isArray(submissionIds) || !submissionIds.length) {
      return res.status(400).json({ error: "No submission IDs provided" });
    }

    const batch = submissionIds.slice(0, 60);
    const results = await Promise.all(
      batch.map(async (id) => {
        const sub = await Submission.findOne(ownedQuery(req, { _id: id })).populate(
          "assignment",
          "points title"
        );
        if (!sub) return null;

        try {
          const totalMarks = Number(sub.assignment?.points || sub.totalMarks);
          if (!Number.isFinite(totalMarks) || totalMarks <= 0) {
            return {
              id,
              status: "Failed",
              error: "This assignment has no valid maximum marks configured.",
            };
          }

          let filePath;
          try {
            filePath = resolveStoredUploadPath(sub.file);
          } catch (_) {
            return {
              id,
              status: "Failed",
              error: "Invalid stored file path.",
            };
          }

          if (!fs.existsSync(filePath)) {
            return { id, status: "Failed", error: "Submitted file was not found." };
          }

          let extractedText = "";
          const ext = path.extname(filePath).toLowerCase();

          if (ext === ".docx") {
            const result = await mammoth.extractRawText({ path: filePath });
            extractedText = result.value;
          } else if ([".txt", ".md", ".py", ".js", ".java", ".cpp", ".sql"].includes(ext)) {
            extractedText = fs.readFileSync(filePath, "utf8");
          } else {
            // Do not invent placeholder text for unsupported formats.
            return {
              id,
              status: "Failed",
              error: `Unsupported file format ${ext || "(unknown)"} for legacy evaluation path.`,
            };
          }

          if (!extractedText || extractedText.trim() === "") {
            return {
              id,
              status: "Failed",
              error: "File is empty or could not be read.",
            };
          }

          const aiResult = await checkAssignment(extractedText, instructions, totalMarks);

          return await Submission.findOneAndUpdate(
            ownedQuery(req, { _id: id }),
            {
              aiScore: aiResult.score,
              aiFeedback: aiResult.feedback || "AI check completed.",
              totalMarks,
              status: "AI_GRADED",
            },
            { new: true }
          );
        } catch (innerError) {
          console.error(`Error processing submission ${id}:`, innerError.message);
          // Do not mark AI_GRADED on provider/processing failure.
          return {
            id,
            status: "Failed",
            error: "AI grading failed for this submission.",
          };
        }
      })
    );

    return res.json({ message: "Bulk AI grading completed", data: results });
  } catch (error) {
    console.error("Critical Controller Error:", error);
    res.status(500).json({ error: "AI grading request failed." });
  }
};

exports.updateTeacherGrading = async (req, res) => {
  try {
    const { submissionId, marks, feedback } = req.body;
    if (!submissionId) {
      return res.status(400).json({ error: "submissionId is required." });
    }

    const updatedSubmission = await Submission.findOneAndUpdate(
      ownedQuery(req, { _id: submissionId }),
      {
        marks,
        feedback: feedback || "",
        status: "GRADED",
      },
      { new: true }
    );

    if (!updatedSubmission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json({ message: "Teacher grading updated successfully", data: updatedSubmission });
  } catch (error) {
    res.status(500).json({ error: "Unable to update grading." });
  }
};

exports.publishResults = async (req, res) => {
  try {
    const { submissionIds } = req.body;
    if (!Array.isArray(submissionIds) || !submissionIds.length) {
      return res.status(400).json({ error: "No submission IDs provided." });
    }

    const submissions = await Submission.find(
      ownedQuery(req, { _id: { $in: submissionIds } })
    );
    let published = 0;
    for (const submission of submissions) {
      if (submission.status === "PUBLISHED") continue;
      const hasTeacherMarks =
        submission.marks !== null &&
        submission.marks !== undefined &&
        Number.isFinite(Number(submission.marks)) &&
        Number(submission.marks) >= 0;
      const hasAiMarks =
        submission.aiScore !== null &&
        submission.aiScore !== undefined &&
        Number.isFinite(Number(submission.aiScore)) &&
        Number(submission.aiScore) >= 0;
      if (!hasTeacherMarks && !hasAiMarks) continue;
      submission.status = "PUBLISHED";
      await submission.save();
      published += 1;
    }
    res.json({ message: "Results published successfully", published });
  } catch (error) {
    res.status(500).json({ error: "Unable to publish results." });
  }
};
