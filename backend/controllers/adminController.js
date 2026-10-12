const User = require('../models/User');
const Assignment = require('../models/Assignment');
const {
    validatePasswordInput,
    hashPassword,
    toPublicUser,
    normalizeRole,
} = require('../utils/authPassword');

/* =========================================================
   1. DASHBOARD INSIGHTS
========================================================= */
exports.getSystemInsights = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalTeachers = await User.countDocuments({ role: 'teacher' });
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalAssignments = await Assignment.countDocuments();

        // Keep the existing department distribution data unchanged.
        const csCount = await User.countDocuments({ department: 'CS' });
        const seCount = await User.countDocuments({ department: 'SE' });
        const pieData = [
            { name: 'CS Dept', value: csCount },
            { name: 'SE Dept', value: seCount },
            { name: 'Teachers', value: totalTeachers }
        ];

        // Real six-month user/assignment history instead of fabricated chart values.
        const now = new Date();
        const months = [];
        for (let i = 5; i >= 0; i -= 1) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
            months.push({
                name: start.toLocaleString('en-US', { month: 'short' }),
                start,
                end
            });
        }

        const [users, assignments] = await Promise.all([
            User.find({}).select('createdAt').lean(),
            Assignment.find({}).select('createdAt').lean()
        ]);

        const chartData = months.map((month) => ({
            name: month.name,
            users: users.filter((u) => u.createdAt >= month.start && u.createdAt < month.end).length
        }));

        let runningUsers = 0;
        chartData.forEach((item) => {
            runningUsers += item.users;
            item.users = runningUsers;
        });

        const assignmentBarData = months.map((month) => ({
            name: month.name,
            assignments: assignments.filter((a) => a.createdAt >= month.start && a.createdAt < month.end).length
        }));

        res.json({
            totalUsers,
            totalTeachers,
            totalStudents,
            totalAssignments,
            chartData,
            assignmentBarData,
            pieData
        });
    } catch (err) {
        console.error('INSIGHTS ERROR:', err);
        res.status(500).json({ message: 'Error fetching insights', error: err.message });
    }
};

/* =========================================================
   2. TEACHERS (Updated to ensure Subject is fetched)
========================================================= */
exports.getAllTeachers = async (req, res) => {
    try {
        const teachers = await User.find({ role: 'teacher' })
            .select('name email subject department role createdAt') // Explicitly select subject
            .lean();

        res.json(teachers);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching teachers" });
    }
};

/* =========================================================
   3. STUDENTS 
========================================================= */
exports.getRecentUsers = async (req, res) => {
    try {
        const students = await User.find({ role: 'student' })
            .select('-password')
            .sort({ createdAt: -1 })
            .lean();

        res.json(students);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Error fetching students" });
    }
};

/* =========================================================
   4. ASSIGNMENTS
========================================================= */
exports.getAllAssignments = async (req, res) => {
    try {
        const assignments = await Assignment.find()
            .populate('teacher', 'name email department') 
            .lean();

        const formatted = assignments.map(a => ({
            _id: a._id,
            title: a.title,
            description: a.description,
            startDate: a.startDate,
            deadline: a.deadline,
            status: a.status,
            points: a.points,
            teacherName: a.teacher?.name || "System Admin",
            teacherEmail: a.teacher?.email || "",
            department: a.teacher?.department || "CS"
        }));

        res.json(formatted);
    } catch (err) {
        console.error("ASSIGNMENT FETCH ERROR:", err);
        res.status(500).json({ message: "Error fetching assignments" });
    }
};

/* =========================================================
   5. ADD USER
========================================================= */
exports.addUser = async (req, res) => {
    try {
        const { name, email, password, role, subject, department, registrationNumber } = req.body;
        const userRole = normalizeRole(role);

        // Admin dashboard CRUD path may only create students/teachers.
        // Additional admins use /auth/signup with an authenticated admin JWT.
        if (userRole !== "student" && userRole !== "teacher") {
            return res.status(400).json({
                message: "Only student or teacher accounts can be created here",
            });
        }

        const exists = await User.findOne({ email });
        if (exists) return res.status(400).json({ message: "User already exists" });

        const passwordCheck = validatePasswordInput(password);
        if (!passwordCheck.ok) {
            return res.status(400).json({ message: passwordCheck.message });
        }

        const newUser = new User({
            name,
            email,
            password: await hashPassword(passwordCheck.password),
            role: userRole,
            subject: userRole === "teacher" ? subject : undefined,
            department: department || "CS"
        });

        if (userRole === "student" && registrationNumber) {
            newUser.registrationNumber = registrationNumber;
        }

        await newUser.save();
        res.status(201).json(toPublicUser(newUser));

    } catch (err) {
        console.error("ADD USER ERROR:", err.message);
        res.status(400).json({ message: "User creation failed" });
    }
};

/* =========================================================
   6. UPDATE USER
========================================================= */
exports.updateUser = async (req, res) => {
    try {
        const update = { ...req.body };
        // Clients must not forge session-invalidation fields.
        delete update.tokenVersion;
        delete update.passwordChangedAt;
        delete update._id;
        delete update.id;

        const updateQuery = { $set: update };
        if (Object.prototype.hasOwnProperty.call(update, "password")) {
            const passwordCheck = validatePasswordInput(update.password);
            if (!passwordCheck.ok) {
                return res.status(400).json({ message: passwordCheck.message });
            }
            update.password = await hashPassword(passwordCheck.password);
            update.passwordChangedAt = new Date();
            updateQuery.$inc = { tokenVersion: 1 };
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            updateQuery,
            { new: true, runValidators: true }
        ).select('-password');

        res.json(updatedUser);
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: "Update failed" });
    }
};

/* =========================================================
   7. DELETE USER
========================================================= */
exports.deleteUser = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "Deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: "Delete failed" });
    }
};

/* =========================================================
   8. TOGGLE LOGIN
========================================================= */
exports.toggleLoginAccess = async (req, res) => {
    try {
        const { status } = req.body;
        await User.updateMany(
            { role: { $ne: 'admin' } },
            { isAllowedLogin: status }
        );
        res.json({ message: `Access ${status ? 'enabled' : 'disabled'} for all users` });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Failed to update access" });
    }
};

exports.deleteAssignment = async (req, res) => {
    try {
        const deleted = await Assignment.findByIdAndDelete(req.params.id);
        if (!deleted) return res.status(404).json({ message: "Assignment not found" });
        res.json({ message: "Assignment deleted successfully" });
    } catch (err) {
        console.error("DELETE ASSIGNMENT ERROR:", err);
        res.status(400).json({ message: "Assignment delete failed" });
    }
};
