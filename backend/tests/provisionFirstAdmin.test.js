const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  planFirstAdminProvision,
  provisionFirstAdmin,
  validateFirstAdminPassword,
  FIRST_ADMIN_MIN_PASSWORD_LENGTH,
} = require("../scripts/lib/provisionFirstAdminCore");
const { isBcryptHash, passwordsMatch } = require("../utils/authPassword");
const { parseArgs } = require("../scripts/provisionFirstAdmin");

function createMockDeps({ adminCount = 0, existingEmail = null, failConnect = false, failCreate = false } = {}) {
  const created = [];
  const User = {
    async countDocuments(query) {
      assert.equal(query.role, "admin");
      return adminCount;
    },
    async findOne(query) {
      if (existingEmail && query.email === existingEmail) {
        return { _id: "existing-id", role: "student", email: existingEmail };
      }
      return null;
    },
    async create(doc) {
      if (failCreate) throw new Error("create failed");
      const row = {
        _id: "new-admin-id",
        ...doc,
      };
      created.push(row);
      return row;
    },
  };

  let connected = false;
  const mongoose = {
    async connect() {
      if (failConnect) throw new Error("mongodb://secret-user:secret-pass@host/db failed");
      connected = true;
    },
    async disconnect() {
      connected = false;
    },
    get connected() {
      return connected;
    },
  };

  return { User, mongoose, created, getConnected: () => connected };
}

describe("provisionFirstAdmin CLI argument safety", () => {
  it("refuses --password CLI arguments", () => {
    assert.throws(
      () => parseArgs(["--execute", "--password", "Secret12345"]),
      /do not pass the password as a CLI argument/i
    );
  });

  it("parses dry-run and execute flags", () => {
    const dry = parseArgs(["--dry-run", "--name", "A", "--email", "a@b.co"]);
    assert.equal(dry.dryRun, true);
    assert.equal(dry.execute, false);
    const ex = parseArgs(["--execute", "--name", "A", "--email", "a@b.co"]);
    assert.equal(ex.execute, true);
  });
});

describe("provisionFirstAdmin validation", () => {
  it("rejects weak / short passwords for first admin", () => {
    assert.equal(validateFirstAdminPassword("short").ok, false);
    assert.equal(validateFirstAdminPassword("123456789").ok, false); // 9 chars if min is 10
    const okLen = "a".repeat(FIRST_ADMIN_MIN_PASSWORD_LENGTH);
    assert.equal(validateFirstAdminPassword(okLen).ok, true);
  });

  it("dry-run rejects missing identity without connecting", () => {
    const result = planFirstAdminProvision({
      name: "",
      email: "admin@example.com",
      password: "a".repeat(FIRST_ADMIN_MIN_PASSWORD_LENGTH),
    });
    assert.equal(result.ok, false);
    assert.equal(result.mode, "dry-run");
  });

  it("dry-run succeeds without database access", () => {
    const result = planFirstAdminProvision({
      name: "Campus Admin",
      email: "Admin@Example.COM",
      password: "a".repeat(FIRST_ADMIN_MIN_PASSWORD_LENGTH),
    });
    assert.equal(result.ok, true);
    assert.equal(result.planned.email, "admin@example.com");
    assert.equal(result.planned.role, "admin");
    assert.match(result.message, /no database connection/i);
  });
});

describe("provisionFirstAdmin execute safeguards", () => {
  it("does not mutate when execute is false", async () => {
    const deps = createMockDeps();
    const result = await provisionFirstAdmin({
      mongoUri: "mongodb://127.0.0.1:27017/test",
      name: "Campus Admin",
      email: "admin@example.com",
      password: "a".repeat(FIRST_ADMIN_MIN_PASSWORD_LENGTH),
      execute: false,
      deps,
    });
    assert.equal(result.ok, true);
    assert.equal(result.mode, "dry-run");
    assert.equal(deps.created.length, 0);
    assert.equal(deps.getConnected(), false);
  });

  it("requires MONGO_URI for execute", async () => {
    const deps = createMockDeps();
    const result = await provisionFirstAdmin({
      mongoUri: "",
      name: "Campus Admin",
      email: "admin@example.com",
      password: "a".repeat(FIRST_ADMIN_MIN_PASSWORD_LENGTH),
      execute: true,
      deps,
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /MONGO_URI/i);
    assert.equal(deps.created.length, 0);
  });

  it("refuses when an admin already exists", async () => {
    const deps = createMockDeps({ adminCount: 1 });
    const result = await provisionFirstAdmin({
      mongoUri: "mongodb://127.0.0.1:27017/test",
      name: "Campus Admin",
      email: "admin@example.com",
      password: "a".repeat(FIRST_ADMIN_MIN_PASSWORD_LENGTH),
      execute: true,
      deps,
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /already has one or more admin/i);
    assert.equal(deps.created.length, 0);
    assert.equal(deps.getConnected(), false);
  });

  it("refuses when email already belongs to another account", async () => {
    const deps = createMockDeps({
      adminCount: 0,
      existingEmail: "taken@example.com",
    });
    const result = await provisionFirstAdmin({
      mongoUri: "mongodb://127.0.0.1:27017/test",
      name: "Campus Admin",
      email: "taken@example.com",
      password: "a".repeat(FIRST_ADMIN_MIN_PASSWORD_LENGTH),
      execute: true,
      deps,
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /already belongs/i);
    assert.equal(deps.created.length, 0);
  });

  it("creates a bcrypt-hashed admin once when safeguards pass", async () => {
    const deps = createMockDeps({ adminCount: 0 });
    const plain = `SecureAdmin!${FIRST_ADMIN_MIN_PASSWORD_LENGTH}`;
    const result = await provisionFirstAdmin({
      mongoUri: "mongodb://127.0.0.1:27017/test",
      name: "Campus Admin",
      email: "admin@example.com",
      password: plain,
      execute: true,
      deps,
    });
    assert.equal(result.ok, true);
    assert.equal(result.admin.role, "admin");
    assert.equal(result.admin.email, "admin@example.com");
    assert.equal(deps.created.length, 1);
    const saved = deps.created[0];
    assert.equal(saved.role, "admin");
    assert.notEqual(saved.password, plain);
    assert.equal(isBcryptHash(saved.password), true);
    assert.equal(await passwordsMatch(plain, saved.password), true);
    assert.equal(deps.getConnected(), false);
    assert.ok(!JSON.stringify(result).includes(plain));
    assert.ok(!String(result.message).includes(plain));
  });

  it("sanitizes connection failures and disconnects safely", async () => {
    const deps = createMockDeps({ failConnect: true });
    const result = await provisionFirstAdmin({
      mongoUri: "mongodb://secret-user:secret-pass@host/db",
      name: "Campus Admin",
      email: "admin@example.com",
      password: "a".repeat(FIRST_ADMIN_MIN_PASSWORD_LENGTH),
      execute: true,
      deps,
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /Provisioning failed/i);
    assert.equal(result.message.includes("secret-pass"), false);
    assert.equal(result.message.includes("secret-user"), false);
    assert.equal(deps.created.length, 0);
  });
});
