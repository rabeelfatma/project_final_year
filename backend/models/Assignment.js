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
  /**
   * Set when "New assignment posted" availability notifications were dispatched.
   * Null means students have not been notified yet (e.g. future startDate).
   * Used as an atomic claim so cron / opportunistic flush cannot double-send.
   */
  availabilityNotifiedAt: { type: Date, default: null },
}, { timestamps: true });

assignmentSchema.index(
  { status: 1, startDate: 1, availabilityNotifiedAt: 1 },
  { name: "assignment_availability_notify_scan" }
);

module.exports = mongoose.model("Assignment", assignmentSchema);
