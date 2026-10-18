/**
 * Offline first-admin provisioning core (no HTTP, no auto-run).
 * Callers inject User/mongoose dependencies for testability.
 */
const {
  validatePasswordInput,
  hashPassword,
  isBcryptHash,
  MIN_PASSWORD_LENGTH,
} = require("../../utils/authPassword");
const { validateEmailInput } = require("../../utils/emailValidation");

/** Same length/complexity policy as signup and password reset (via validatePasswordInput). */
const FIRST_ADMIN_MIN_PASSWORD_LENGTH = MIN_PASSWORD_LENGTH;

function sanitizeError(error) {
  const message = error && error.message ? String(error.message) : "Unknown error";
  return message
    .replace(/mongodb(\+srv)?:\/\/[^\s'"]+/gi, "[redacted-uri]")
    .replace(/\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}/g, "[redacted-hash]");
}

function validateIdentity({ name, email }) {
  const trimmedName = typeof name === "string" ? name.trim() : "";

  if (!trimmedName) {
    return { ok: false, message: "Admin name is required." };
  }
  if (trimmedName.length < 2) {
    return { ok: false, message: "Admin name must be at least 2 characters." };
  }
  const emailCheck = validateEmailInput(email);
  if (!emailCheck.ok) {
    return {
      ok: false,
      message:
        emailCheck.message === "Email is required"
          ? "Admin email is required."
          : "Admin email format is invalid.",
    };
  }

  return { ok: true, name: trimmedName, email: emailCheck.email };
}

function validateFirstAdminPassword(password) {
  const base = validatePasswordInput(password);
  if (!base.ok) return base;
  if (base.password.length < FIRST_ADMIN_MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `First-admin password must be at least ${FIRST_ADMIN_MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  return base;
}

/**
 * Dry-run / preflight validation only — never connects or writes.
 */
function planFirstAdminProvision({ name, email, password }) {
  const identity = validateIdentity({ name, email });
  if (!identity.ok) {
    return { ok: false, mode: "dry-run", message: identity.message };
  }

  const passwordCheck = validateFirstAdminPassword(password);
  if (!passwordCheck.ok) {
    return { ok: false, mode: "dry-run", message: passwordCheck.message };
  }

  return {
    ok: true,
    mode: "dry-run",
    message:
      "Dry-run OK. No database connection was made. Re-run with --execute and MONGO_URI set to provision.",
    planned: {
      name: identity.name,
      email: identity.email,
      role: "admin",
      passwordLength: passwordCheck.password.length,
    },
  };
}

/**
 * Mutating provision against an injected User model + mongoose connection helpers.
 *
 * @param {object} options
 * @param {string} options.mongoUri
 * @param {string} options.name
 * @param {string} options.email
 * @param {string} options.password plaintext (hashed exactly once here)
 * @param {boolean} options.execute must be true
 * @param {object} options.deps { mongoose, User }
 */
async function provisionFirstAdmin(options) {
  const {
    mongoUri,
    name,
    email,
    password,
    execute = false,
    deps,
  } = options || {};

  if (!execute) {
    return planFirstAdminProvision({ name, email, password });
  }

  if (!deps || !deps.mongoose || !deps.User) {
    return {
      ok: false,
      mode: "execute",
      message: "Internal error: database dependencies were not provided.",
    };
  }

  if (!mongoUri || typeof mongoUri !== "string" || !mongoUri.trim()) {
    return {
      ok: false,
      mode: "execute",
      message: "MONGO_URI is required in the environment for --execute.",
    };
  }

  const uri = mongoUri.trim();
  if (!/^mongodb(\+srv)?:\/\//i.test(uri)) {
    return {
      ok: false,
      mode: "execute",
      message: "MONGO_URI must be a mongodb:// or mongodb+srv:// URI.",
    };
  }

  const identity = validateIdentity({ name, email });
  if (!identity.ok) {
    return { ok: false, mode: "execute", message: identity.message };
  }

  const passwordCheck = validateFirstAdminPassword(password);
  if (!passwordCheck.ok) {
    return { ok: false, mode: "execute", message: passwordCheck.message };
  }

  const { mongoose, User } = deps;
  let connected = false;

  try {
    // Same Atlas SRV DNS workaround used by backend/config/db.js (QC-15C / QC-16B).
    const { ensureSrvDnsResolvers } = require("../../config/mongoDns");
    ensureSrvDnsResolvers(uri);
    await mongoose.connect(uri);
    connected = true;

    const existingAdmins = await User.countDocuments({ role: "admin" });
    if (existingAdmins > 0) {
      return {
        ok: false,
        mode: "execute",
        message:
          "Refused: this database already has one or more admin users. First-admin provisioning is not allowed.",
        existingAdmins,
      };
    }

    const emailTaken = await User.findOne({ email: identity.email });
    if (emailTaken) {
      return {
        ok: false,
        mode: "execute",
        message:
          "Refused: that email already belongs to an account. This tool will not overwrite or promote existing users.",
      };
    }

    const hashedPassword = await hashPassword(passwordCheck.password);
    if (!isBcryptHash(hashedPassword)) {
      return {
        ok: false,
        mode: "execute",
        message: "Refused: password hashing did not produce a bcrypt hash.",
      };
    }

    const created = await User.create({
      name: identity.name,
      email: identity.email,
      password: hashedPassword,
      role: "admin",
      department: "CS",
      isAllowedLogin: true,
      approvalStatus: "approved",
      emailVerified: true,
      emailVerifiedAt: new Date(),
      approvedAt: new Date(),
    });

    return {
      ok: true,
      mode: "execute",
      message: "First admin created successfully.",
      admin: {
        id: String(created._id),
        name: created.name,
        email: created.email,
        role: created.role,
      },
    };
  } catch (error) {
    return {
      ok: false,
      mode: "execute",
      message: `Provisioning failed: ${sanitizeError(error)}`,
    };
  } finally {
    if (connected) {
      try {
        await mongoose.disconnect();
      } catch (_) {
        /* ignore disconnect errors */
      }
    }
  }
}

module.exports = {
  FIRST_ADMIN_MIN_PASSWORD_LENGTH,
  validateIdentity,
  validateFirstAdminPassword,
  planFirstAdminProvision,
  provisionFirstAdmin,
  sanitizeError,
};
