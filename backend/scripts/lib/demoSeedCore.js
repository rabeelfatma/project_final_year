/**
 * Demo MongoDB seed planner/executor core.
 * Dry-run never connects. Execute requires explicit flags + approved DB name.
 * Does not drop collections, overwrite admins, or hardcode passwords.
 */
const {
  validatePasswordInput,
  hashPassword,
  isBcryptHash,
} = require("../../utils/authPassword");

const APPROVED_DEMO_DB_NAMES = new Set(["quickcheck_hub_demo"]);
const DEMO_EMAIL_DOMAIN = "demo.quickcheck.local";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeError(error) {
  const message = error && error.message ? String(error.message) : "Unknown error";
  return message
    .replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, "[redacted-uri]")
    .replace(/\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}/g, "[redacted-hash]");
}

function extractDbName(mongoUri) {
  const raw = String(mongoUri || "").trim();
  if (!raw) return "";
  try {
    const normalized = raw.replace(/^mongodb(\+srv)?:\/\//i, "http://");
    const url = new URL(normalized);
    return String(url.pathname || "")
      .replace(/^\//, "")
      .split("?")[0]
      .trim();
  } catch (_) {
    const match = raw.match(/\/([^/?]+)(\?|$)/);
    return match ? match[1] : "";
  }
}

function assertApprovedDemoTarget(mongoUri) {
  const dbName = extractDbName(mongoUri);
  if (!dbName) {
    return { ok: false, message: "MONGO_URI must include an explicit database name." };
  }
  if (!APPROVED_DEMO_DB_NAMES.has(dbName)) {
    return {
      ok: false,
      message: `Refused: demo seeding only targets ${[...APPROVED_DEMO_DB_NAMES].join(", ")}. Got "${dbName}".`,
    };
  }
  return { ok: true, dbName };
}

function demoPlan() {
  return {
    admin: {
      name: "Rabeel Ramzan",
      emailHint: "Operator must supply --admin-email (never invent Rabeel's real email).",
      role: "admin",
    },
    teachers: [
      { name: "Teacher 1", email: `teacher1@${DEMO_EMAIL_DOMAIN}`, subject: "CS-Demo-A" },
      { name: "Teacher 2", email: `teacher2@${DEMO_EMAIL_DOMAIN}`, subject: "CS-Demo-B" },
    ],
    students: [
      { name: "Student 1", email: `student1@${DEMO_EMAIL_DOMAIN}`, subject: "CS-Demo-A", registrationNumber: "DEMO-S1" },
      { name: "Student 2", email: `student2@${DEMO_EMAIL_DOMAIN}`, subject: "CS-Demo-A", registrationNumber: "DEMO-S2" },
      { name: "Student 3", email: `student3@${DEMO_EMAIL_DOMAIN}`, subject: "CS-Demo-B", registrationNumber: "DEMO-S3" },
    ],
    assignments: [
      {
        teacherEmail: `teacher1@${DEMO_EMAIL_DOMAIN}`,
        title: "Demo Assignment A1",
        description: "Sample assignment for Teacher 1 / Students 1–2.",
        subject: "CS-Demo-A",
        points: 100,
      },
      {
        teacherEmail: `teacher2@${DEMO_EMAIL_DOMAIN}`,
        title: "Demo Assignment B1",
        description: "Sample assignment for Teacher 2 / Student 3.",
        subject: "CS-Demo-B",
        points: 50,
      },
    ],
    notes: [
      "No submission files are created by the seeder.",
      "Never uses the existing 87 academic upload files.",
      "Does not drop collections or overwrite existing Admin accounts.",
      "Duplicate demo emails are skipped (duplicate-safe).",
    ],
  };
}

function planDemoSeed({ adminEmail, password, confirmToken, mongoUri }) {
  const plan = demoPlan();
  const email =
    typeof adminEmail === "string" ? adminEmail.toLowerCase().trim() : "";
  if (!email || !EMAIL_RE.test(email)) {
    return {
      ok: false,
      mode: "dry-run",
      message: "Admin email is required (--admin-email). Do not invent Rabeel's address.",
    };
  }

  const passwordCheck = validatePasswordInput(password);
  if (!passwordCheck.ok) {
    return { ok: false, mode: "dry-run", message: passwordCheck.message };
  }

  if (String(confirmToken || "") !== "DEMO_SEED_OK") {
    return {
      ok: false,
      mode: "dry-run",
      message: 'Confirmation token must be exactly DEMO_SEED_OK for planning/execute.',
    };
  }

  if (mongoUri) {
    const target = assertApprovedDemoTarget(mongoUri);
    if (!target.ok) return { ok: false, mode: "dry-run", message: target.message };
  }

  return {
    ok: true,
    mode: "dry-run",
    message:
      "Dry-run OK. No database connection was made. Re-run with --execute, MONGO_URI, and --confirm DEMO_SEED_OK to seed.",
    planned: {
      database: mongoUri ? extractDbName(mongoUri) : "quickcheck_hub_demo (required at execute)",
      admin: { name: plan.admin.name, email, role: "admin" },
      teachers: plan.teachers.map((t) => ({ name: t.name, email: t.email, subject: t.subject })),
      students: plan.students.map((s) => ({
        name: s.name,
        email: s.email,
        subject: s.subject,
        registrationNumber: s.registrationNumber,
      })),
      assignments: plan.assignments.map((a) => ({
        title: a.title,
        teacherEmail: a.teacherEmail,
        subject: a.subject,
        points: a.points,
      })),
      passwordLength: passwordCheck.password.length,
      notes: plan.notes,
    },
  };
}

async function ensureUser(User, spec, hashedPassword) {
  const query = User.findOne({ email: spec.email });
  const existing =
    query && typeof query.select === "function"
      ? await query.select("_id email role name")
      : await query;
  if (existing) {
    return { user: existing, created: false, skipped: true };
  }
  const user = await User.create({
    name: spec.name,
    email: spec.email,
    password: hashedPassword,
    role: spec.role,
    subject: spec.subject || "",
    registrationNumber: spec.registrationNumber || undefined,
    department: "CS",
    isAllowedLogin: true,
  });
  return { user, created: true, skipped: false };
}

/**
 * Mutating demo seed. Never drops data. Skips existing emails.
 * Will not modify an existing admin document; creates admin only if email is free
 * and no conflicting admin email ownership exists for that address.
 */
async function executeDemoSeed(options) {
  const {
    mongoUri,
    adminEmail,
    password,
    confirmToken,
    execute,
    deps,
  } = options || {};

  if (!execute) {
    return { ok: false, message: "execute flag must be true." };
  }
  if (String(confirmToken || "") !== "DEMO_SEED_OK") {
    return { ok: false, message: "Missing confirmation token DEMO_SEED_OK." };
  }

  const planned = planDemoSeed({ adminEmail, password, confirmToken, mongoUri });
  if (!planned.ok) return planned;

  const target = assertApprovedDemoTarget(mongoUri);
  if (!target.ok) return target;

  if (!deps?.mongoose || !deps?.User || !deps?.Assignment) {
    return { ok: false, message: "Missing mongoose/User/Assignment dependencies." };
  }

  const { mongoose, User, Assignment } = deps;
  const passwordCheck = validatePasswordInput(password);
  if (!passwordCheck.ok) return { ok: false, message: passwordCheck.message };

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 12000 });
  } catch (error) {
    return { ok: false, message: `Database connection failed: ${sanitizeError(error)}` };
  }

  const summary = {
    ok: true,
    database: target.dbName,
    created: { users: 0, assignments: 0 },
    skipped: { users: 0, assignments: 0 },
    roles: [],
  };

  try {
    const hashed = await hashPassword(passwordCheck.password);
    if (!isBcryptHash(hashed)) {
      return { ok: false, message: "Password hashing failed safety check." };
    }

    const adminSpec = {
      name: "Rabeel Ramzan",
      email: planned.planned.admin.email,
      role: "admin",
    };
    const adminResult = await ensureUser(User, adminSpec, hashed);
    if (adminResult.skipped) {
      if (adminResult.user.role !== "admin") {
        return {
          ok: false,
          message: "Admin email already belongs to a non-admin account. Refusing to modify it.",
        };
      }
      summary.skipped.users += 1;
    } else {
      summary.created.users += 1;
    }
    summary.roles.push({ email: adminSpec.email, role: "admin", created: adminResult.created });

    const plan = demoPlan();
    const teacherIds = {};

    for (const teacher of plan.teachers) {
      const result = await ensureUser(
        User,
        { ...teacher, role: "teacher" },
        hashed
      );
      if (result.skipped) summary.skipped.users += 1;
      else summary.created.users += 1;
      teacherIds[teacher.email] = result.user._id;
      summary.roles.push({
        email: teacher.email,
        role: "teacher",
        created: result.created,
      });
    }

    for (const student of plan.students) {
      const result = await ensureUser(
        User,
        { ...student, role: "student" },
        hashed
      );
      if (result.skipped) summary.skipped.users += 1;
      else summary.created.users += 1;
      summary.roles.push({
        email: student.email,
        role: "student",
        created: result.created,
      });
    }

    const now = Date.now();
    for (const assignment of plan.assignments) {
      const teacherId = teacherIds[assignment.teacherEmail];
      if (!teacherId) continue;
      const existingQuery = Assignment.findOne({
        title: assignment.title,
        teacher: teacherId,
      });
      const exists =
        existingQuery && typeof existingQuery.select === "function"
          ? await existingQuery.select("_id")
          : await existingQuery;
      if (exists) {
        summary.skipped.assignments += 1;
        continue;
      }
      await Assignment.create({
        title: assignment.title,
        description: assignment.description,
        subject: assignment.subject,
        points: assignment.points,
        teacher: teacherId,
        status: "active",
        startDate: new Date(now - 86400000),
        deadline: new Date(now + 14 * 86400000),
      });
      summary.created.assignments += 1;
    }

    summary.message =
      "Demo seed completed without dropping collections. Existing matching emails/assignments were skipped.";
    return summary;
  } catch (error) {
    return { ok: false, message: sanitizeError(error) };
  } finally {
    try {
      await mongoose.disconnect();
    } catch (_) {
      /* ignore */
    }
  }
}

module.exports = {
  APPROVED_DEMO_DB_NAMES,
  DEMO_EMAIL_DOMAIN,
  extractDbName,
  assertApprovedDemoTarget,
  demoPlan,
  planDemoSeed,
  executeDemoSeed,
  sanitizeError,
};
