const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
  assignment: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  file: { type: String, required: true },
  originalFileName: { type: String, default: "" },
  fileMimeType: { type: String, default: "" },
  aiScore: { type: Number, default: null },
  aiFeedback: { type: String, default: "No AI feedback available yet" },
  totalMarks: { type: Number, default: null },
  marks: { type: Number, default: null },
  feedback: { type: String, default: "" },
  submittedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ["pending", "submitted", "graded", "AI_GRADED", "PUBLISHED", "Submitted", "Graded", "REVIEWED"],
    default: "submitted",
  },
}, { timestamps: true });

// A zero is a valid grade. Only a real marks edit changes the status.
submissionSchema.pre("save", function() {
  if (this.isModified("marks") && this.marks !== null && this.marks !== undefined) {
    if (this.status !== "PUBLISHED") this.status = "graded";
  }
});

module.exports = mongoose.model("Submission", submissionSchema);
