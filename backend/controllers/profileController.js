const User = require("../models/User");
const path = require("path");
const fs = require("fs");

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Unable to load profile", error: error.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const update = {
      name: String(req.body.name || "").trim(),
      email: String(req.body.email || "").trim().toLowerCase(),
    };
    if (!update.name || !update.email) return res.status(400).json({ message: "Name and email are required." });

    const emailOwner = await User.findOne({ email: update.email, _id: { $ne: req.user._id } });
    if (emailOwner) return res.status(409).json({ message: "This email is already used by another account." });

    const currentUser = await User.findById(req.user._id).select("profilePicture");
    if (req.file) {
      update.profilePicture = `uploads/profilePictures/${req.file.filename}`;
      if (currentUser?.profilePicture) {
        const oldPath = path.join(__dirname, "..", String(currentUser.profilePicture).replace(/^[/\\]+/, ""));
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, { new: true, runValidators: true }).select("-password");
    res.json({ ...user.toObject(), regNo: user.registrationNumber || "N/A" });
  } catch (error) {
    res.status(500).json({ message: "Profile update failed", error: error.message });
  }
};
