const User = require("../models/User");
const generateToken = require("../utils/tokenUtils");
const {
  ALLOWED_ROLES,
  normalizeRole,
  validatePasswordInput,
  hashPassword,
  passwordsMatch,
  toPublicUser,
  isPublicAdminBootstrapAllowed,
} = require("../utils/authPassword");

// ==========================================
// REGISTER USER (Admin, Teacher, or Student)
// ==========================================
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, role, department, program, subject } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        message: "Name and email are required"
      });
    }

    const userRole = normalizeRole(role);

    if (!ALLOWED_ROLES.includes(userRole)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    // Student/teacher/admin creation via this endpoint requires an authenticated admin.
    // Public first-admin bootstrap is disabled (see isPublicAdminBootstrapAllowed).
    if (userRole === "student" || userRole === "teacher") {
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
          message: "Only an authenticated admin can create student or teacher accounts"
        });
      }
    }

    if (userRole === "admin") {
      const isAuthedAdmin = req.user && req.user.role === "admin";
      if (!isAuthedAdmin && !isPublicAdminBootstrapAllowed()) {
        return res.status(403).json({
          message:
            "Public administrator registration is disabled. An authenticated administrator must create admin accounts, or use an approved setup process for the first admin."
        });
      }
    }

    const passwordCheck = validatePasswordInput(password);
    if (!passwordCheck.ok) {
      return res.status(400).json({ message: passwordCheck.message });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    const hashedPassword = await hashPassword(passwordCheck.password);

    const newUserPayload = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: userRole,
      department: department || "CS",
      program: program || null,
      subject: subject || null
    };

    if (userRole === "student") {
      const date = new Date();
      const month = date.getMonth();
      const year = date.getFullYear().toString().slice(-2);
      const season = month < 6 ? "SP" : "FA";
      const deptCode = (department || "CS") === "SE" ? "BSE" : "BCS";

      const count = await User.countDocuments({
        role: "student",
        department: department || "CS"
      });

      const sequence = (count + 1).toString().padStart(3, "0");
      newUserPayload.registrationNumber = `${season}${year}-${deptCode}-${sequence}`;
    }

    const user = await User.create(newUserPayload);
    const publicUser = toPublicUser(user);

    return res.status(201).json({
      message:
        userRole === "student"
          ? "Student Registered Successfully ✅"
          : userRole === "teacher"
          ? "Teacher Added Successfully ✅"
          : "User Registered Successfully",
      regNo: user.registrationNumber || "N/A",
      token: generateToken(user._id, user.role),
      role: user.role,
      user: publicUser
    });

  } catch (error) {
    console.error("SERVER ERROR DURING SIGNUP:", error.message);

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Conflict: This email or registration number is already in use. ❌"
      });
    }

    return res.status(500).json({
      message: "Database or server error",
      error: error.message
    });
  }
};

// ==========================================
// LOGIN USER
// ==========================================
exports.loginUser = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const passwordCheck = validatePasswordInput(password);
    if (!passwordCheck.ok) {
      return res.status(400).json({ message: passwordCheck.message });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    // Authorization role always comes from the stored user record.
    // A client-supplied role is only a portal hint and must match the account.
    if (role) {
      const requestedRole = normalizeRole(role);
      if (requestedRole !== user.role) {
        return res.status(400).json({
          message: `Invalid credentials for ${requestedRole} login`
        });
      }
    }

    if (user.role === "student" || user.role === "teacher") {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ message: "Name is required for login" });
      }
      if (name.trim() !== user.name) {
        return res.status(400).json({
          message: `Invalid Name or Email for ${user.role}`
        });
      }
    }

    if (!user.password) {
      return res.status(400).json({
        message: "This account has no password set. Contact an administrator to reset access."
      });
    }

    const isMatch = await passwordsMatch(passwordCheck.password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password" });
    }

    return res.json({
      message: "Login Successful",
      token: generateToken(user._id, user.role),
      role: user.role,
      name: user.name,
      regNo: user.registrationNumber || "N/A",
      user: toPublicUser(user)
    });

  } catch (error) {
    console.error("SERVER ERROR DURING LOGIN:", error.message);
    return res.status(500).json({
      message: "Server internal error",
      error: error.message
    });
  }
};
