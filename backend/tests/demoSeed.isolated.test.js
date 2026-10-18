const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  extractDbName,
  assertApprovedDemoTarget,
  planDemoSeed,
  executeDemoSeed,
  demoPlan,
} = require("../scripts/lib/demoSeedCore");

describe("demo seed target validation", () => {
  it("extracts database names from URI forms", () => {
    assert.equal(
      extractDbName("mongodb+srv://u:p@cluster.mongodb.net/quickcheck_hub_demo?retryWrites=true"),
      "quickcheck_hub_demo"
    );
    assert.equal(extractDbName("mongodb://127.0.0.1:27017/quickcheck_hub_demo"), "quickcheck_hub_demo");
  });

  it("refuses non-demo database targets", () => {
    const bad = assertApprovedDemoTarget("mongodb://127.0.0.1:27017/production");
    assert.equal(bad.ok, false);
    const good = assertApprovedDemoTarget(
      "mongodb+srv://u:p@cluster.mongodb.net/quickcheck_hub_demo"
    );
    assert.equal(good.ok, true);
  });
});

describe("demo seed dry-run safety", () => {
  it("requires admin email and confirmation token", () => {
    const missing = planDemoSeed({
      adminEmail: "",
      password: "ValidPass12!",
      confirmToken: "DEMO_SEED_OK",
    });
    assert.equal(missing.ok, false);

    const noConfirm = planDemoSeed({
      adminEmail: "operator@example.com",
      password: "ValidPass12!",
      confirmToken: "NOPE",
    });
    assert.equal(noConfirm.ok, false);
  });

  it("plans without connecting when inputs are valid", () => {
    const plan = planDemoSeed({
      adminEmail: "operator@example.com",
      password: "ValidPass12!",
      confirmToken: "DEMO_SEED_OK",
    });
    assert.equal(plan.ok, true);
    assert.equal(plan.mode, "dry-run");
    assert.equal(plan.planned.admin.name, "Rabeel Ramzan");
    assert.equal(plan.planned.teachers.length, 2);
    assert.equal(plan.planned.students.length, 3);
    assert.equal(plan.planned.assignments.length, 2);
    assert.match(plan.message, /No database connection/i);
  });

  it("uses only fictional demo emails for teachers/students", () => {
    const emails = [
      ...demoPlan().teachers.map((t) => t.email),
      ...demoPlan().students.map((s) => s.email),
    ];
    for (const email of emails) {
      assert.match(email, /@demo\.quickcheck\.local$/);
    }
  });
});

describe("demo seed execute safeguards", () => {
  it("refuses execute without confirmation or approved DB", async () => {
    const noConfirm = await executeDemoSeed({
      execute: true,
      confirmToken: "WRONG",
      adminEmail: "a@b.co",
      password: "ValidPass12!",
      mongoUri: "mongodb://127.0.0.1:27017/quickcheck_hub_demo",
      deps: {},
    });
    assert.equal(noConfirm.ok, false);

    const badDb = await executeDemoSeed({
      execute: true,
      confirmToken: "DEMO_SEED_OK",
      adminEmail: "a@b.co",
      password: "ValidPass12!",
      mongoUri: "mongodb://127.0.0.1:27017/something_else",
      deps: { mongoose: {}, User: {}, Assignment: {} },
    });
    assert.equal(badDb.ok, false);
    assert.match(badDb.message, /Refused/i);
  });

  it("does not connect when execute is false", async () => {
    let connected = false;
    const result = await executeDemoSeed({
      execute: false,
      confirmToken: "DEMO_SEED_OK",
      adminEmail: "a@b.co",
      password: "ValidPass12!",
      mongoUri: "mongodb://127.0.0.1:27017/quickcheck_hub_demo",
      deps: {
        mongoose: {
          connect: async () => {
            connected = true;
          },
          disconnect: async () => {},
        },
        User: {},
        Assignment: {},
      },
    });
    assert.equal(result.ok, false);
    assert.equal(connected, false);
  });

  it("skips duplicates and never drops collections", async () => {
    const created = { users: 0, assignments: 0 };
    const users = new Map();
    users.set("operator@example.com", {
      _id: "admin1",
      email: "operator@example.com",
      role: "admin",
      name: "Rabeel Ramzan",
    });

    const User = {
      findOne: async ({ email }) => users.get(String(email).toLowerCase()) || null,
      create: async (doc) => {
        created.users += 1;
        const row = { _id: `u${created.users}`, ...doc };
        users.set(doc.email, row);
        return row;
      },
    };
    const Assignment = {
      findOne: async () => null,
      create: async () => {
        created.assignments += 1;
        return { _id: `a${created.assignments}` };
      },
      drop: async () => {
        throw new Error("drop must never be called");
      },
      deleteMany: async () => {
        throw new Error("deleteMany must never be called");
      },
    };

    const result = await executeDemoSeed({
      execute: true,
      confirmToken: "DEMO_SEED_OK",
      adminEmail: "operator@example.com",
      password: "ValidPass12!",
      mongoUri: "mongodb://127.0.0.1:27017/quickcheck_hub_demo",
      deps: {
        mongoose: {
          connect: async () => {},
          disconnect: async () => {},
        },
        User,
        Assignment,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.skipped.users >= 1, true);
    assert.equal(result.created.assignments, 2);
    assert.equal(result.created.users, 5); // 2 teachers + 3 students; admin skipped
  });
});
