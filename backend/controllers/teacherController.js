

const Assignment = require("../models/Assignment");

const User = require("../models/User");

const Submission = require("../models/Submission");

const path = require("path");

const fs = require("fs");

const { extractText } = require("../services/plagiarismService");

const { checkAssignment } = require("../services/geminiService");

const { create: createNotification } = require("./notificationController");



function extractTotalMarks(instructions) {

  const raw = String(instructions || "").trim();

  const normalized = raw.replace(/(\d)\s+(?=\d)/g, "$1");

  const match =

    normalized.match(

      /(?:out\s*of\s*|total\s*marks?\s*[:=]?\s*|max(?:imum)?\s*marks?\s*[:=]?\s*|marks?\s*[:=]?\s*)(\d+(?:\.\d+)?)/i

    ) || normalized.match(/\b(\d+(?:\.\d+)?)\s*marks?\b/i);



  return match ? Number(match[1]) : null;

}



const { resolveStoredUploadPath } = require("../utils/uploadsPath");
const storedFiles = require("../utils/storedFiles");

function normalizeFilePath(file) {
  try {
    return resolveStoredUploadPath(file);
  } catch (_) {
    return null;
  }
}

async function removeStoredAcademicFile(stored) {
  if (!stored) return;
  try {
    await storedFiles.remove(stored);
  } catch (error) {
    console.warn("Could not remove academic file:", error.message);
  }
}

async function materializeStored(stored) {
  if (!stored) return null;
  try {
    if (!(await storedFiles.exists(stored))) return null;
    return await storedFiles.materialize(stored);
  } catch (error) {
    if (error.code === "R2_NOT_CONFIGURED") throw error;
    return null;
  }
}




function getInlineMime(fileMimeType, filePath) {
  const declared = String(fileMimeType || "").toLowerCase().split(";")[0].trim();
  if (declared && declared !== "application/octet-stream") return declared;
  const extension = path.extname(filePath).toLowerCase();
  const byExtension = {
    ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg",
    ".aac": "audio/aac", ".flac": "audio/flac", ".m4a": "audio/mp4",
    ".mp4": "video/mp4", ".mpeg": "video/mpeg", ".mpg": "video/mpeg",
    ".mov": "video/quicktime", ".webm": "video/webm",
  };
  return byExtension[extension] || "";
}

const GEMINI_INLINE_MIMES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/pdf", "audio/mpeg", "audio/wav", "audio/ogg",
  "audio/aac", "audio/flac", "audio/mp4", "video/mp4",
  "video/mpeg", "video/quicktime", "video/webm",
]);

const GRADED = ["graded", "GRADED", "AI_GRADED", "PUBLISHED", "Graded"];



exports.getOverviewStats = async (req, res) => {

  try {

    const userId = req.user._id;



    const [totalCreated, totalStudents] = await Promise.all([

      Assignment.countDocuments({ teacher: userId }),

      User.countDocuments({ role: "student" }),

    ]);



    const assignments = await Assignment.find({ teacher: userId }).select("_id");

    const ids = assignments.map((item) => item._id);



    const [pendingCount, completedCount] = await Promise.all([

      Submission.countDocuments({

        assignment: { $in: ids },

        status: { $nin: GRADED },

      }),

      Submission.countDocuments({

        assignment: { $in: ids },

        status: { $in: GRADED },

      }),

    ]);



    res.json({ totalCreated, totalStudents, pendingCount, completedCount });

  } catch (error) {

    res.status(500).json({

      message: "Failed to fetch teacher statistics",

      error: error.message,

    });

  }

};



exports.createAssignment = async (req, res) => {

  try {

    const { title, startDate, deadline, description, points, subject } = req.body;

    const totalMarks = Number(points);



    if (

      !title ||

      !String(description || "").trim() ||

      !startDate ||

      !deadline ||

      !Number.isFinite(totalMarks) ||

      totalMarks <= 0

    ) {

      return res.status(400).json({

        message: "Title, academic instructions, dates, and total marks greater than 0 are required.",

      });

    }

    const start = new Date(startDate);
    const end = new Date(deadline);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
      return res.status(400).json({
        message: "Deadline must be a valid date on or after the start date.",
      });
    }



    const fileUrl = req.file

      ? `uploads/assignments/${req.file.filename}`

      : null;



    const assignment = await Assignment.create({

      title: title.trim(),

      startDate: start,

      deadline: end,

      description: String(description).trim(),

      points: totalMarks,

      subject: subject || req.user.subject || "General",

      file: fileUrl,

      fileUrl,

      originalFileName: req.file?.originalname || "",

      fileMimeType: req.file?.mimetype || "",

      teacher: req.user._id,

      status: "active",

    });



    const students = await User.find({ role: "student" }).select("_id");



    await Promise.all(

      students.map((student) =>

        createNotification({

          recipient: student._id,

          title: "New assignment posted",

          message: `${assignment.title} is available. Total marks: ${assignment.points}.`,

          type: "assignment",

          meta: { assignmentId: assignment._id },

          url: "/dashboard/student",

        })

      )

    );



    res.status(201).json(assignment);

  } catch (error) {

    console.error("CREATE ASSIGNMENT ERROR:", error);

    res.status(500).json({

      message: "Creation failed",

      error: error.message,

    });

  }

};



exports.updateAssignment = async (req, res) => {

  try {

    const updateData = { ...req.body };



    if (updateData.startDate) {

      updateData.startDate = new Date(updateData.startDate);

    }



    if (updateData.deadline) {

      updateData.deadline = new Date(updateData.deadline);

    }



    if (updateData.points !== undefined) {

      updateData.points = Number(updateData.points);



      if (!Number.isFinite(updateData.points) || updateData.points <= 0) {

        return res.status(400).json({

          message: "Total marks must be greater than 0.",

        });

      }

    }



    const current = await Assignment.findOne({

      _id: req.params.id,

      teacher: req.user._id,

    });



    if (!current) {

      return res.status(404).json({ message: "Assignment not found" });

    }



    if (req.file) {

      const newPath = `uploads/assignments/${req.file.filename}`;



      updateData.file = newPath;

      updateData.fileUrl = newPath;

      updateData.originalFileName = req.file.originalname || req.file.filename;

      updateData.fileMimeType = req.file.mimetype || "";



      if (current.file && current.file !== newPath) {

        await removeStoredAcademicFile(current.file);

      }

    }



    const updated = await Assignment.findOneAndUpdate(

      { _id: req.params.id, teacher: req.user._id },

      { $set: updateData },

      { new: true }

    );



    res.json(updated);

  } catch (error) {

    res.status(500).json({

      message: "Update failed",

      error: error.message,

    });

  }

};



exports.deleteAssignment = async (req, res) => {

  try {

    const deleted = await Assignment.findOneAndDelete({

      _id: req.params.id,

      teacher: req.user._id,

    });



    if (!deleted) {

      return res.status(404).json({ message: "Assignment not found" });

    }



    if (deleted.file) {

      await removeStoredAcademicFile(deleted.file);

    }



    res.json({ message: "Deleted successfully" });

  } catch (error) {

    res.status(500).json({

      message: "Deletion failed",

      error: error.message,

    });

  }

};



exports.updateAssignmentStatus = async (req, res) => {

  try {

    const updated = await Assignment.findOneAndUpdate(

      { _id: req.params.id, teacher: req.user._id },

      { status: req.body.status },

      { new: true }

    );



    if (!updated) {

      return res.status(404).json({ message: "Assignment not found" });

    }



    res.json(updated);

  } catch (error) {

    res.status(500).json({

      message: "Failed",

      error: error.message,

    });

  }

};



exports.getRecentSubmissions = async (req, res) => {

  try {

    const assignments = await Assignment.find({

      teacher: req.user._id,

    }).select("_id");



    const ids = assignments.map((item) => item._id);



    const submissions = await Submission.find({

      assignment: { $in: ids },

    })

      .populate("student", "name email registrationNumber")

      .populate("assignment", "title points file originalFileName fileMimeType")

      .sort({ createdAt: -1 });



    res.json(submissions || []);

  } catch (error) {

    res.status(500).json({

      message: "Error fetching submissions",

      error: error.message,

    });

  }

};



exports.evaluateWithGemini = async (req, res) => {

  try {

    const rawIds = req.body.submissionIds;

    const ids = (

      Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : []

    ).slice(0, 40);



    const instructions = String(req.body.teacherInstructions || "").trim();



    if (!ids.length) {

      return res.status(400).json({

        message: "Select at least one submission.",

      });

    }



    if (!instructions) {

      return res.status(400).json({

        message: "Enter teacher grading instructions.",

      });

    }



    const referenceFiles = Array.isArray(req.files)

      ? req.files.slice(0, 20)

      : [];



    // FIX: Define referenceMedia before it is used.

    // Only supported image types are sent as Gemini image media.

    const referenceMedia = [];

    const supportedImageMimes = [

      "image/jpeg",

      "image/png",

      "image/webp",

      "image/gif",

    ];



    function readRefBytes(file) {
      if (file?.buffer && Buffer.isBuffer(file.buffer)) return file.buffer;
      if (file?.path && fs.existsSync(file.path)) return fs.readFileSync(file.path);
      return null;
    }

    for (const file of referenceFiles) {

      const mime = String(

        file?.mimetype || file?.mimeType || ""

      ).toLowerCase();



      const bytes = readRefBytes(file);
      let size = bytes ? bytes.length : 0;



      if (

        supportedImageMimes.includes(mime) &&

        size > 0 &&

        size <= 15 * 1024 * 1024

      ) {

        referenceMedia.push({

          mimeType: mime,

          data: bytes.toString("base64"),

        });

      }

    }



    // Extract text from documents and other reference files.

    const referenceTexts = [];



    for (const file of referenceFiles) {

      try {
        let text = "";
        if (file?.path && fs.existsSync(file.path)) {
          text = await extractText(file.path);
        } else if (file?.buffer && Buffer.isBuffer(file.buffer)) {
          const ext = path.extname(file.originalname || "");
          const tmp = path.join(require("os").tmpdir(), `qc-ref-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
          fs.writeFileSync(tmp, file.buffer);
          try { text = await extractText(tmp); }
          finally { try { fs.unlinkSync(tmp); } catch (_) {} }
        }



        if (text && text.trim()) {

          referenceTexts.push(

            `REFERENCE FILE: ${file.originalname}\n${text.slice(0, 50000)}`

          );

        }

      } catch (_) {}

    }



    const includeQuestionIds = new Set(

      String(req.body.includeQuestionAssignmentIds || "")

        .split(",")

        .map((x) => x.trim())

        .filter(Boolean)

    );



    const results = [];



    // Process submissions sequentially to reduce Gemini rate-limit errors.

    for (const id of ids) {

      try {

        const submission = await Submission.findOne({

          _id: id,

          teacherId: req.user._id,

        }).populate(

          "assignment",

          "title description points file originalFileName fileMimeType"

        );



        if (!submission) {

          results.push({

            id,

            status: "Failed",

            error: "Submission not found",

          });

          continue;

        }



        // Use the assignment's configured maximum marks.

        const totalMarks = Number(submission.assignment?.points);



        if (!Number.isFinite(totalMarks) || totalMarks <= 0) {

          results.push({

            id,

            status: "Failed",

            error: "This assignment has no valid maximum marks configured.",

          });

          continue;

        }

        // Mark in-progress so Teacher UI can show AI grading state.
        submission.status = "AI_PROCESSING";
        await submission.save();



        const inlineAnswer = String(submission.answerText || "").trim();
        let materialized = null;
        let filePath = null;
        try {
          materialized = await materializeStored(submission.file);
          filePath = materialized?.path || null;
        } catch (matErr) {
          if (matErr.code === "R2_NOT_CONFIGURED") {
            submission.status = "submitted";
            await submission.save();
            throw matErr;
          }
        }

        if (!filePath && !inlineAnswer) {
          submission.status = "submitted";
          await submission.save();
          results.push({
            id,
            status: "Failed",
            error: "Submitted file was not found on the server.",
          });
          continue;
        }



        let text = inlineAnswer;
        const gradingMedia = [...referenceMedia];
        const stat = filePath && fs.existsSync(filePath) ? fs.statSync(filePath) : null;
        const submissionMime = filePath
          ? getInlineMime(submission.fileMimeType, filePath)
          : "";

        // Prefer persisted text answer; otherwise extract from the uploaded file.
        if (!text && filePath && fs.existsSync(filePath)) {
          text = await extractText(filePath);
        }
        if (
          filePath &&
          stat &&
          submissionMime &&
          GEMINI_INLINE_MIMES.has(submissionMime) &&
          stat.size > 0 &&
          stat.size <= 15 * 1024 * 1024
        ) {
          gradingMedia.unshift({
            mimeType: submissionMime,
            data: fs.readFileSync(filePath).toString("base64"),
          });
          if (!text.trim()) {
            text = `[Student submission attached as ${submissionMime}. Review the actual attached file content. File name: ${
              submission.originalFileName || path.basename(filePath)
            }.]`;
          }
        }

        if (!text.trim()) {
          if (materialized) await materialized.cleanup();
          submission.status = "submitted";
          await submission.save();
          results.push({
            id,
            status: "Failed",
            error:
              `The uploaded ${path.extname(filePath || "") || "file"} format could not be read by the AI checker. Use a supported text/code, DOCX, PDF, spreadsheet, presentation, ZIP, or supported image/audio/video file, or review it manually.`,
          });
          continue;
        }



        let gradingContext = instructions;
        if (submission.assignment?.title) {
          gradingContext += `\n\nASSIGNMENT TITLE: ${submission.assignment.title}`;
        }
        if (submission.assignment?.description) {
          gradingContext += `\n\nASSIGNMENT QUESTION / INSTRUCTIONS:\n${String(
            submission.assignment.description
          ).slice(0, 20000)}`;
        }



        if (referenceTexts.length) {

          gradingContext +=

            `\n\nTEACHER REFERENCE MATERIAL:\n${referenceTexts.join("\n\n")}`;

        }



        // Optionally include the original assignment/question file.

        if (

          includeQuestionIds.has(String(submission.assignment?._id)) &&

          submission.assignment?.file

        ) {

          let questionMat = null;
          try {

            questionMat = await materializeStored(

              submission.assignment.file

            );
            const questionPath = questionMat?.path || null;



            const questionMime = String(

              submission.assignment.fileMimeType || ""

            ).toLowerCase();



            const supportedQuestionImage =

              supportedImageMimes.includes(questionMime);



            if (

              supportedQuestionImage &&

              questionPath &&

              fs.existsSync(questionPath) &&

              fs.statSync(questionPath).size > 0 &&

              fs.statSync(questionPath).size <= 15 * 1024 * 1024

            ) {

              gradingMedia.push({

                mimeType: questionMime,

                data: fs.readFileSync(questionPath).toString("base64"),

              });



              gradingContext +=

                `\n\nThe attached image is the ORIGINAL ASSIGNMENT / QUESTION FILE (${

                  submission.assignment.originalFileName || "question"

                }).`;

            } else if (questionPath && fs.existsSync(questionPath)) {

              const questionText = await extractText(questionPath);



              if (questionText && questionText.trim()) {

                gradingContext +=

                  `\n\nORIGINAL ASSIGNMENT / QUESTION FILE (${

                    submission.assignment.originalFileName || "question"

                  }):\n${questionText.slice(0, 60000)}`;

              }

            }

          } catch (questionError) {

            console.error(

              `Could not process question file for submission ${id}:`,

              questionError.message

            );

          } finally {
            if (questionMat) await questionMat.cleanup();
          }

        }



        // Send student solution, grading instructions, context, and media to AI.

        const ai = await checkAssignment(

          text,

          gradingContext,

          totalMarks,

          gradingMedia

        );



        submission.aiScore = ai.score;

        submission.aiFeedback = ai.feedback;

        submission.aiStrengths = Array.isArray(ai.strengths) ? ai.strengths : [];

        submission.aiImprovements = Array.isArray(ai.improvements)
          ? ai.improvements
          : [];

        submission.totalMarks = totalMarks;

        submission.status = "AI_GRADED";

        submission.gradedAt = new Date();



        await submission.save();



        // Scores stay teacher-only until publish — do not leak marks in notifications.
        await createNotification({

          recipient: submission.student,

          title: "AI evaluation completed",

          message: `${

            submission.assignment?.title || "Your assignment"

          } was evaluated. Feedback will appear after your teacher publishes the result.`,

          type: "grade",

          meta: { submissionId: submission._id },

          url: "/dashboard/student",

        });



        results.push({

          id,

          status: "Success",

          aiScore: ai.score,

          totalMarks,

        });

        if (materialized) await materialized.cleanup();

      } catch (error) {

        if (typeof materialized !== "undefined" && materialized) { try { await materialized.cleanup(); } catch (_) {} }

        console.error(`AI evaluation failed for ${id}:`, error.message);

        try {
          const failed = await Submission.findOne({
            _id: id,
            teacherId: req.user._id,
          });
          if (failed && failed.status === "AI_PROCESSING") {
            failed.status = "submitted";
            await failed.save();
          }
        } catch (_) {}

        results.push({

          id,

          status: "Failed",

          error: error.message,

        });

      }

    }



    // Remove uploaded reference files after evaluation.

    for (const file of req.files || []) {

      try {

        if (file?.path && fs.existsSync(file.path)) {

          fs.unlinkSync(file.path);

        }

      } catch (_) {}

    }



    res.json({ success: true, results });

  } catch (error) {

    for (const file of req.files || []) {

      try {

        if (file?.path && fs.existsSync(file.path)) {

          fs.unlinkSync(file.path);

        }

      } catch (_) {}

    }



    if (error && error.code === "R2_NOT_CONFIGURED") {

      return res.status(503).json({ message: error.message });

    }



    res.status(500).json({

      message: "AI Grading Failed",

      error: error.message,

    });

  }

};



exports.evaluateAssignment = async (req, res) => {

  try {

    const submission = await Submission.findOne({

      _id: req.params.id,

      teacherId: req.user._id,

    }).populate("assignment", "title points");



    if (!submission) {

      return res.status(404).json({ message: "Submission not found" });

    }



    if (req.body.marks === undefined || req.body.marks === null || String(req.body.marks).trim() === "") {
      return res.status(400).json({
        message: "Enter Teacher Marks before saving manual grading. AI Marks are stored separately.",
      });
    }

    const marks = Number(req.body.marks);

    const totalMarks = Number(

      submission.totalMarks || submission.assignment?.points

    );



    if (!Number.isFinite(totalMarks) || totalMarks <= 0) {

      return res.status(400).json({

        message: "Total marks are not set for this assignment.",

      });

    }



    if (

      !Number.isFinite(marks) ||

      marks < 0 ||

      marks > totalMarks

    ) {

      return res.status(400).json({

        message: `Marks must be between 0 and ${totalMarks}.`,

      });

    }



    submission.marks = marks;

    submission.totalMarks = totalMarks;

    submission.feedback = String(req.body.feedback || "");

    submission.status =

      req.body.status === "PUBLISHED" ? "PUBLISHED" : "graded";



    await submission.save();



    const published = submission.status === "PUBLISHED";
    await createNotification({

      recipient: submission.student,

      title: published ? "Result published" : "Assignment evaluated",

      message: published
        ? `Your ${
            submission.assignment?.title || "assignment"
          } result is ${marks}/${totalMarks}.`
        : `Your ${
            submission.assignment?.title || "assignment"
          } was evaluated. Scores appear after your teacher publishes the result.`,

      type: "grade",

      meta: { submissionId: submission._id },

      url: "/dashboard/student",

    });



    res.json({ success: true, data: submission });

  } catch (error) {

    res.status(500).json({

      message: "Grading failed",

      error: error.message,

    });

  }

};



exports.publishResults = async (req, res) => {

  try {

    const ids = Array.isArray(req.body.submissionIds)

      ? req.body.submissionIds

      : [];



    if (!ids.length) {

      return res.status(400).json({

        message: "No submissions selected.",

      });

    }



    const submissions = await Submission.find({

      _id: { $in: ids },

      teacherId: req.user._id,

    }).populate("assignment", "title points");



    let publishedCount = 0;
    for (const submission of submissions) {

      // Already published — skip to avoid duplicate student notifications.
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

      // Publishing an AI-only result must never copy AI marks into the teacher field.
      if (!hasTeacherMarks && !hasAiMarks) continue;

      submission.status = "PUBLISHED";



      if (!submission.totalMarks) {

        submission.totalMarks = submission.assignment?.points || null;

      }



      await submission.save();
      publishedCount += 1;



      await createNotification({

        recipient: submission.student,

        title: "Result published",

        message: `Your ${
          submission.assignment?.title || "assignment"
        } result is ${
          hasTeacherMarks
            ? `Teacher Marks ${submission.marks}`
            : `AI Marks ${submission.aiScore}`
        }/${submission.totalMarks}.`,

        type: "grade",

        meta: { submissionId: submission._id },

        url: "/dashboard/student",

      });

    }



    res.json({

      success: true,

      published: publishedCount,

    });

  } catch (error) {

    res.status(500).json({

      message: "Publishing failed",

      error: error.message,

    });

  }

};



exports.deleteAssignmentsBulk = async (req, res) => {

  try {

    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];



    if (!ids.length) {

      return res.status(400).json({

        message: "No assignments selected.",

      });

    }



    const rows = await Assignment.find({

      _id: { $in: ids },

      teacher: req.user._id,

    });



    for (const row of rows) {

      if (row.file) {

        await removeStoredAcademicFile(row.file);
      }

    }



    await Submission.deleteMany({

      assignment: { $in: rows.map((r) => r._id) },

      teacherId: req.user._id,

    });



    const result = await Assignment.deleteMany({

      _id: { $in: ids },

      teacher: req.user._id,

    });



    res.json({

      success: true,

      deleted: result.deletedCount || 0,

    });

  } catch (error) {

    res.status(500).json({

      message: "Bulk assignment deletion failed",

      error: error.message,

    });

  }

};



exports.deleteSubmission = async (req, res) => {

  try {

    const row = await Submission.findOneAndDelete({

      _id: req.params.id,

      teacherId: req.user._id,

    });



    if (!row) {

      return res.status(404).json({

        message: "Submission not found.",

      });

    }



    try {

      await removeStoredAcademicFile(row.file);

    } catch (_) {}



    res.json({ success: true });

  } catch (error) {

    res.status(500).json({

      message: "Submission deletion failed",

      error: error.message,

    });

  }

};



exports.deleteSubmissionsBulk = async (req, res) => {

  try {

    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];



    if (!ids.length) {

      return res.status(400).json({

        message: "No submissions selected.",

      });

    }



    const rows = await Submission.find({

      _id: { $in: ids },

      teacherId: req.user._id,

    });



    for (const row of rows) {

      try {

        await removeStoredAcademicFile(row.file);

      } catch (_) {}

    }



    const result = await Submission.deleteMany({

      _id: { $in: ids },

      teacherId: req.user._id,

    });



    res.json({

      success: true,

      deleted: result.deletedCount || 0,

    });

  } catch (error) {

    res.status(500).json({

      message: "Bulk submission deletion failed",

      error: error.message,

    });

  }

};




// Reset an existing submission's grade without deleting/recreating the assignment or submission.
exports.resetSubmissionGrade = async (req, res) => {
  try {
    const submission = await Submission.findOne({
      _id: req.params.id,
      teacherId: req.user._id,
    }).populate("assignment", "title points");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found." });
    }

    submission.marks = null;
    submission.feedback = "";
    submission.aiScore = null;
    submission.aiFeedback = "";
    submission.aiStrengths = [];
    submission.aiImprovements = [];
    submission.totalMarks = Number(submission.assignment?.points) > 0
      ? Number(submission.assignment.points)
      : null;
    submission.status = "submitted";
    submission.checkedAt = undefined;
    submission.gradedAt = undefined;
    await submission.save();

    res.json({
      success: true,
      message: "Grade reset. The original submission is ready to be graded again.",
      submission,
    });
  } catch (error) {
    console.error("RESET GRADE ERROR:", error);
    res.status(500).json({ message: "Could not reset submission grade.", error: error.message });
  }
};

exports.getStudents = async (req, res) => {

  try {

    const students = await User.find({

      role: "student",

    }).select("name email registrationNumber");



    res.json(students || []);

  } catch (error) {

    res.status(500).json({

      message: "Unable to load students",

    });

  }

};



exports.getTeachers = async (_req, res) => {

  try {

    const teachers = await User.find({

      role: "teacher",

    }).select("name email subject");



    res.json(teachers || []);

  } catch (error) {

    res.status(500).json({

      message: "Unable to load teachers",

    });

  }

};



exports.getMyAssignments = async (req, res) => {

  try {

    const assignments = await Assignment.find({

      teacher: req.user._id,

    }).sort({ createdAt: -1 });



    res.json(assignments || []);

  } catch (error) {

    res.status(500).json({

      message: "Unable to load assignments",

    });

  }

};

// Reset grades for selected submissions while keeping the original submissions/files.
exports.resetSubmissionGradesBulk = async (req, res) => {
  try {
    const ids = [...new Set((Array.isArray(req.body.ids) ? req.body.ids : []).map(String))].slice(0, 200);
    if (!ids.length) return res.status(400).json({ message: "Select at least one submission." });
    const submissions = await Submission.find({ _id: { $in: ids }, teacherId: req.user._id })
      .populate("assignment", "title points");
    if (!submissions.length) return res.status(404).json({ message: "No matching submissions found." });
    for (const submission of submissions) {
      submission.marks = null;
      submission.feedback = "";
      submission.aiScore = null;
      submission.aiFeedback = "";
      submission.aiStrengths = [];
      submission.aiImprovements = [];
      submission.totalMarks = Number(submission.assignment?.points) > 0 ? Number(submission.assignment.points) : null;
      submission.status = "submitted";
      submission.checkedAt = undefined;
      submission.gradedAt = undefined;
      await submission.save();
    }
    return res.json({ success: true, reset: submissions.length, message: `Reset ${submissions.length} grade(s).` });
  } catch (error) {
    console.error("BULK RESET GRADE ERROR:", error);
    return res.status(500).json({ message: "Could not reset selected grades.", error: error.message });
  }
};

// Read submission text for Teacher review (inline answerText and/or extracted file text).
exports.getSubmissionContent = async (req, res) => {
  try {
    const submission = await Submission.findOne({
      _id: req.params.id,
      teacherId: req.user._id,
    }).populate("assignment", "title points");

    if (!submission) {
      return res.status(404).json({ message: "Submission not found." });
    }

    let extractedText = String(submission.answerText || "").trim();
    let contentMat = null;
    try {
      contentMat = await materializeStored(submission.file);
      if (!extractedText && contentMat?.path) {
        extractedText = String((await extractText(contentMat.path)) || "").trim();
      }
    } catch (contentErr) {
      if (contentErr && contentErr.code === "R2_NOT_CONFIGURED") {
        throw contentErr;
      }
      /* keep answerText only for other read/extract failures */
    } finally {
      if (contentMat) await contentMat.cleanup();
    }

    return res.json({
      success: true,
      submissionId: submission._id,
      originalFileName: submission.originalFileName || "",
      status: submission.status,
      answerText: String(submission.answerText || ""),
      extractedText: extractedText.slice(0, 120000),
      aiScore: submission.aiScore,
      aiFeedback: submission.aiFeedback,
      aiStrengths: submission.aiStrengths || [],
      aiImprovements: submission.aiImprovements || [],
      marks: submission.marks,
      feedback: submission.feedback,
      totalMarks: submission.totalMarks || submission.assignment?.points || null,
    });
  } catch (error) {
    if (error && error.code === "R2_NOT_CONFIGURED") {
      return res.status(503).json({ message: error.message });
    }
    return res.status(500).json({ message: "Could not load submission content." });
  }
};
