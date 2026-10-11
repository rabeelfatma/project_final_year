const bcrypt = require("bcryptjs");
const User = require("../models/User");
const generateToken = require("../utils/tokenUtils");

// ==========================================
// REGISTER USER (Admin, Teacher, or Student)
// ==========================================
exports.registerUser = async (req, res) => {
  try {
    console.log("Incoming Signup Data:", req.body);

    const { name, email, password, role, department, program, subject } = req.body;

    // 1. Basic validation
    if (!name || !email) {
      return res.status(400).json({
        message: "Name and email are required"
      });
    }

    // Role detection
    const allowedRoles = ["student", "admin", "teacher"];
    const userRole = role ? role.toLowerCase() : "student";

    // Password validation based on role (Admin must have password)
    if (userRole === "admin" && !password) {
      return res.status(400).json({ message: "Password is required for Admin" });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(400).json({ message: "Invalid role selected" });
    }

    // 2. Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // 3. Check if user already exists by email
    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // 4. Hash password
    let hashedPassword = null;
    const defaultPass = password || "User123@"; 
    hashedPassword = await bcrypt.hash(defaultPass, 10);

    // 5. Create Payload Object
    let newUserPayload = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role: userRole,
      department: department || "CS",
      program: program || null,
      subject: subject || null 
    };

    // ==========================================
    // REGISTRATION NUMBER LOGIC (STUDENTS ONLY)
    // ==========================================
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

    // 6. CREATE USER
    const user = await User.create(newUserPayload);

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
      user
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
// LOGIN USER (Fixed Dynamic Logic)
// ==========================================
exports.loginUser = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    // 1. Basic Check
    if (!email || !role) {
      return res.status(400).json({ message: "Email and Role are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    let user;

    // 2. Logic for Admin (Email + Password)
    if (role === "admin") {
      if (!password) return res.status(400).json({ message: "Password is required for Admin" });
      
      user = await User.findOne({ email: normalizedEmail, role: "admin" });
      if (!user) return res.status(400).json({ message: "Admin not found" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ message: "Invalid password" });
    } 

    // 3. Logic for Student/Teacher (Name + Email ONLY)
    else if (role === "student" || role === "teacher") {
      if (!name) return res.status(400).json({ message: "Name is required for login" });

      // Yahan password check nahi hoga, sirf Name aur Email match hona chahiye
      user = await User.findOne({ 
        email: normalizedEmail, 
        name: name.trim(), 
        role: role 
      });

      if (!user) {
        return res.status(400).json({ message: `Invalid Name or Email for ${role}` });
      }
    }

    // 4. Send Success Response
    return res.json({
      message: "Login Successful",
      token: generateToken(user._id, user.role),
      role: user.role,
      name: user.name,
      regNo: user.registrationNumber || "N/A",
      user
    });

  } catch (error) {
    console.error("SERVER ERROR DURING LOGIN:", error.message);
    return res.status(500).json({
      message: "Server internal error",
      error: error.message
    });
  }
};