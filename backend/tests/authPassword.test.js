const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  validatePasswordInput,
  validateLoginPasswordInput,
  hashPassword,
  passwordsMatch,
  toPublicUser,
  normalizeRole,
  ALLOWED_ROLES,
  MIN_PASSWORD_LENGTH,
} = require("../utils/authPassword");

describe("authPassword helpers", () => {
  it("rejects missing passwords", () => {
    assert.equal(validatePasswordInput("").ok, false);
    assert.equal(validatePasswordInput(null).ok, false);
    assert.equal(validatePasswordInput(undefined).ok, false);
  });

  it("rejects short passwords", () => {
    const result = validatePasswordInput("Ab1!");
    assert.equal(result.ok, false);
    assert.match(result.message, /at least 8/i);
  });

  it("rejects passwords missing complexity rules", () => {
    assert.equal(validatePasswordInput("alllower1!").ok, false);
    assert.equal(validatePasswordInput("ALLUPPER1!").ok, false);
    assert.equal(validatePasswordInput("NoDigits!!").ok, false);
    assert.equal(validatePasswordInput("NoSpecial1").ok, false);
  });

  it("accepts passwords that meet the policy", () => {
    const result = validatePasswordInput("Secure1!");
    assert.equal(result.ok, true);
    assert.equal(result.password, "Secure1!");
    assert.ok(MIN_PASSWORD_LENGTH >= 8);
  });

  it("does not enforce complexity on login presence check", () => {
    assert.equal(validateLoginPasswordInput("legacy6").ok, true);
    assert.equal(validateLoginPasswordInput("").ok, false);
  });

  it("hashes passwords and verifies matches", async () => {
    const plain = "TeacherPass12!";
    const hash = await hashPassword(plain);
    assert.notEqual(hash, plain);
    assert.match(hash, /^\$2[aby]?\$/);
    assert.equal(await passwordsMatch(plain, hash), true);
    assert.equal(await passwordsMatch("wrong-password", hash), false);
    assert.equal(await passwordsMatch(plain, null), false);
    assert.equal(await passwordsMatch(plain, ""), false);
  });

  it("strips password from public user objects", () => {
    const publicUser = toPublicUser({
      name: "Ada",
      email: "ada@example.com",
      password: "$2a$10$secret",
      role: "student",
    });
    assert.equal(publicUser.password, undefined);
    assert.equal(publicUser.email, "ada@example.com");
  });

  it("normalizes roles safely", () => {
    assert.equal(normalizeRole("Teacher"), "teacher");
    assert.equal(normalizeRole(undefined), "student");
    assert.ok(ALLOWED_ROLES.includes("admin"));
  });
});

describe("login authorization contract (logic)", () => {
  it("does not treat client role as authority when DB role differs", () => {
    const dbRole = "student";
    const clientRole = "admin";
    const authorized = normalizeRole(clientRole) === dbRole;
    assert.equal(authorized, false);
  });

  it("uses stored role when client portal role matches", () => {
    const dbRole = "teacher";
    const clientRole = "teacher";
    assert.equal(normalizeRole(clientRole), dbRole);
  });
});
