const Submission = require("../models/Submission");
const { checkAssignment } = require("../services/geminiService");
const mammoth = require("mammoth");
const path = require("path");
const fs = require("fs");
const { resolveStoredUploadPath } = require("../utils/uploadsPath");

exports.evaluateAssignment = async (req, res) => {
  try {
    const { submissionIds, teacherInstructions } = req.body;

    // 🔥 DYNAMIC MARKS EXTRACTION: Instruction se marks nikalo (e.g. "100 marks")
    let dynamicTotalMarks = 10; // Default
    const marksMatch = teacherInstructions.match(/(\d+)\s*marks/i) || teacherInstructions.match(/out of\s*(\d+)/i);
    if (marksMatch) {
        dynamicTotalMarks = parseInt(marksMatch[1]);
    }

    if (submissionIds && Array.isArray(submissionIds)) {
      const batch = submissionIds.slice(0, 60);
      
      const results = await Promise.all(batch.map(async (id) => {
        const sub = await Submission.findById(id);
        if (!sub) return null;

        try {
          let filePath;
          try {
            filePath = resolveStoredUploadPath(sub.file);
          } catch (_) {
            console.error("Invalid stored submission file path");
            return sub;
          }

          if (!fs.existsSync(filePath)) {
            console.error("Submission file not found on disk");
            return sub;
          }

          // Support for multiple file types
          let extractedText = "";
          const ext = path.extname(filePath).toLowerCase();

          if (ext === '.docx') {
            const result = await mammoth.extractRawText({ path: filePath });
            extractedText = result.value;
          } else if (['.txt', '.md', '.py', '.js', '.java', '.cpp', '.sql'].includes(ext)) {
            extractedText = fs.readFileSync(filePath, 'utf8');
          } else {
            extractedText = `File format ${ext} detected. Perform visual/manual check.`;
          }

          if (!extractedText || extractedText.trim() === "") {
            throw new Error("File is empty or could not be read");
          }

          // 3. Gemini Evaluation with Dynamic Marks
          const finalPrompt = `${teacherInstructions}. Strictly evaluate out of ${dynamicTotalMarks}.`;
          const aiResult = await checkAssignment(extractedText, finalPrompt, dynamicTotalMarks);
          
          // 4. DB Update - Keeping all fields for Student Dashboard
          return await Submission.findByIdAndUpdate(id, {
            aiScore: aiResult.score || 0,
            aiFeedback: aiResult.feedback || "AI check completed.",
            totalMarks: dynamicTotalMarks, // Student dashboard needs this
            status: "AI_GRADED" 
          }, { new: true });

        } catch (innerError) {
          console.error(`Error processing submission ${id}:`, innerError.message);
          return await Submission.findByIdAndUpdate(id, {
            aiFeedback: "Error: " + innerError.message,
            status: "AI_GRADED" 
          }, { new: true });
        }
      }));

      return res.json({ message: "Bulk AI grading completed", data: results });
    }

    res.status(400).json({ error: "No submission IDs provided" });

  } catch (error) {
    console.error("Critical Controller Error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Teacher Manual Grading (Feedback Optional kiya gaya hai)
exports.updateTeacherGrading = async (req, res) => {
  try {
    const { submissionId, marks, feedback } = req.body;
    
    const updatedSubmission = await Submission.findByIdAndUpdate(
      submissionId,
      { 
        marks: marks, 
        feedback: feedback || "", // Optional: teacher likhe ya na likhe
        status: "GRADED" // Student dashboard 'GRADED' status dekhta hai
      },
      { new: true }
    );

    if (!updatedSubmission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    res.json({ message: "Teacher grading updated successfully", data: updatedSubmission });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.publishResults = async (req, res) => {
  try {
    const { submissionIds } = req.body;
    const submissions = await Submission.find({ _id: { $in: submissionIds } });
    let published = 0;
    for (const submission of submissions) {
      const hasTeacherMarks = submission.marks !== null && submission.marks !== undefined &&
        Number.isFinite(Number(submission.marks)) && Number(submission.marks) >= 0;
      const hasAiMarks = submission.aiScore !== null && submission.aiScore !== undefined &&
        Number.isFinite(Number(submission.aiScore)) && Number(submission.aiScore) >= 0;
      if (!hasTeacherMarks && !hasAiMarks) continue;
      submission.status = "PUBLISHED";
      await submission.save();
      published += 1;
    }
    res.json({ message: "Results published successfully", published });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};