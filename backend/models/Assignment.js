const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema({
  title: { type: String, required: [true, "Title is required"] },
  description: { type: String, default: "" },
  startDate: { type: Date, required: true },
  deadline: { type: Date, required: true },
  file: { type: String },
  fileUrl: { type: String },
  originalFileName: { type: String, default: "" },
  fileMimeType: { type: String, default: "" },
  // Teacher chooses the actual maximum marks. There is intentionally no 10-mark default.
  points: { type: Number, required: [true, "Total marks are required"], min: 1 },
  subject: { type: String, default: "General" },
  // active = visible to students; deactive = legacy soft-close; archived = teacher archive (hidden from students, preserved).
  status: { type: String, enum: ["active", "deactive", "archived"], default: "active" },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

module.exports = mongoose.model("Assignment", assignmentSchema);
