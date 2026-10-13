

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

function normalizeFilePath(file) {
  try {
    return resolveStoredUploadPath(file);
  } catch (_) {
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

      !startDate ||

      !deadline ||

      !Number.isFinite(totalMarks) ||

      totalMarks <= 0

    ) {

      return res.status(400).json({

        message: "Title, dates, and total marks greater than 0 are required.",

      });

    }



    const fileUrl = req.file

      ? `uploads/assignments/${req.file.filename}`

      : null;



    const assignment = await Assignment.create({

      title: title.trim(),

      startDate: new Date(startDate),

      deadline: new Date(deadline),

      description: description || "",

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

        const oldPath = normalizeFilePath(current.file);

        if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

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

      const filePath = normalizeFilePath(deleted.file);

      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

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



    for (const file of referenceFiles) {

      const mime = String(

        file?.mimetype || file?.mimeType || ""

      ).toLowerCase();



      let size = 0;



      try {

        size = fs.statSync(file.path).size;

      } catch (_) {}



      if (

        supportedImageMimes.includes(mime) &&

        size > 0 &&

        size <= 15 * 1024 * 1024

      ) {

        referenceMedia.push({

          mimeType: mime,

          data: fs.readFileSync(file.path).toString("base64"),

        });

      }

    }



    // Extract text from documents and other reference files.

    const referenceTexts = [];



    for (const file of referenceFiles) {

      try {

        const text = await extractText(file.path);



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

          "title points file originalFileName fileMimeType"

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



        const filePath = normalizeFilePath(submission.file);

        if (!filePath || !fs.existsSync(filePath)) {

          results.push({

            id,

            status: "Failed",

            error: "Submitted file was not found on the server.",

          });

          continue;

        }



        let text = "";
        const gradingMedia = [...referenceMedia];
        const stat = fs.statSync(filePath);
        const submissionMime = getInlineMime(
          submission.fileMimeType,
          filePath
        );

        // Code/text documents (including .cs) are extracted as text. Images, PDFs,
        // audio and video can also be attached directly when Gemini supports the MIME.
        text = await extractText(filePath);
        if (
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
          results.push({
            id,
            status: "Failed",
            error:
              `The uploaded ${path.extname(filePath) || "file"} format could not be read by the AI checker. Use a supported text/code, DOCX, PDF, spreadsheet, presentation, ZIP, or supported image/audio/video file, or review it manually.`,
          });
          continue;
        }



        let gradingContext = instructions;



        if (referenceTexts.length) {

          gradingContext +=

            `\n\nTEACHER REFERENCE MATERIAL:\n${referenceTexts.join("\n\n")}`;

        }



        // Optionally include the original assignment/question file.

        if (

          includeQuestionIds.has(String(submission.assignment?._id)) &&

          submission.assignment?.file

        ) {

          try {

            const questionPath = normalizeFilePath(

              submission.assignment.file

            );



            const questionMime = String(

              submission.assignment.fileMimeType || ""

            ).toLowerCase();



            const supportedQuestionImage =

              supportedImageMimes.includes(questionMime);



            if (

              supportedQuestionImage &&

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

            } else if (fs.existsSync(questionPath)) {

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

        submission.totalMarks = totalMarks;

        submission.status = "AI_GRADED";



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

      } catch (error) {

        console.error(`AI evaluation failed for ${id}:`, error.message);



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

        const filePath = normalizeFilePath(row.file);



        try {

          if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

        } catch (_) {}

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

      const filePath = normalizeFilePath(row.file);

      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

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

        const filePath = normalizeFilePath(row.file);

        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

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
