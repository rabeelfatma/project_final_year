const mongoose = require("mongoose");

/**
 * Turnitin-oriented similarity / plagiarism check records.
 * Local peer-comparison scores must never be stored here as provider results.
 */
const matchedSourceSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    url: { type: String, default: "" },
    percent: { type: Number, default: null },
    detail: { type: String, default: "" },
  },
  { _id: false }
);

const highlightedPassageSchema = new mongoose.Schema(
  {
    text: { type: String, default: "" },
    sourceTitle: { type: String, default: "" },
    percent: { type: Number, default: null },
  },
  { _id: false }
);

const similarityCheckSchema = new mongoose.Schema(
  {
    submission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Submission",
      required: true,
      index: true,
    },
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ["external_sources", "student_paper_repository"],
      required: true,
    },
    provider: {
      type: String,
      enum: ["turnitin"],
      default: "turnitin",
    },
    providerSubmissionId: { type: String, default: null },
    providerReportId: { type: String, default: null },
    status: {
      type: String,
      enum: [
        "provider_not_connected",
        "queued",
        "processing",
        "completed",
        "failed",
      ],
      default: "provider_not_connected",
      index: true,
    },
    // Null until a real provider report completes — never invent a score.
    similarityPercent: { type: Number, default: null },
    matchedSources: { type: [matchedSourceSchema], default: [] },
    highlightedPassages: { type: [highlightedPassageSchema], default: [] },
    reportAvailable: { type: Boolean, default: false },
    reportMimeType: { type: String, default: "" },
    errorCode: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
    requestedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    // Sanitized provider metadata only — never store API secrets.
    providerMeta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

similarityCheckSchema.index({ teacherId: 1, createdAt: -1 });
similarityCheckSchema.index({ submission: 1, createdAt: -1 });

module.exports = mongoose.model("SimilarityCheck", similarityCheckSchema);
