/**
 * Scheduled assignment availability notifications — isolated mocks only.
 * Does not touch production Atlas.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  isAssignmentAvailableNow,
  notifyAssignmentAvailable,
  dispatchDueAssignmentAvailabilityNotifications,
  createAvailabilityNotificationForStudent,
} = require("../services/assignmentAvailabilityNotificationService");

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

function createHarness() {
  const assignments = [];
  const users = [
    { _id: "stu-1", role: "student" },
    { _id: "stu-2", role: "student" },
    { _id: "tea-1", role: "teacher" },
  ];
  const notifications = [];

  const Assignment = {
    async findOneAndUpdate(filter, update) {
      const row = assignments.find((item) => {
        if (String(item._id) !== String(filter._id)) return false;
        if (filter.status && item.status !== filter.status) return false;
        if (filter.startDate?.$lte && new Date(item.startDate) > filter.startDate.$lte) {
          return false;
        }
        const notified = item.availabilityNotifiedAt;
        const isNullish = notified == null;
        if (!isNullish) return false;
        return true;
      });
      if (!row) return null;
      Object.assign(row, update.$set || {});
      return { ...row };
    },
    async find(filter) {
      const now = filter.startDate?.$lte;
      const rows = assignments.filter((item) => {
        if (filter.status && item.status !== filter.status) return false;
        if (now && new Date(item.startDate) > now) return false;
        if (item.availabilityNotifiedAt != null) return false;
        return true;
      });
      return {
        sort() {
          return {
            limit(n) {
              return rows.slice(0, n);
            },
          };
        },
        limit(n) {
          return rows.slice(0, n);
        },
        then(resolve, reject) {
          return Promise.resolve(rows).then(resolve, reject);
        },
      };
    },
  };

  // Support await Assignment.find(...).sort().limit()
  const originalFind = Assignment.find.bind(Assignment);
  Assignment.find = (filter) => {
    const now = filter.startDate?.$lte;
    const rows = assignments
      .filter((item) => {
        if (filter.status && item.status !== filter.status) return false;
        if (now && new Date(item.startDate) > now) return false;
        if (item.availabilityNotifiedAt != null) return false;
        return true;
      })
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    const chain = {
      sort() {
        return chain;
      },
      limit(n) {
        return Promise.resolve(rows.slice(0, n));
      },
      then(resolve, reject) {
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
    return chain;
  };

  const User = {
    find(filter) {
      const rows = users.filter((u) => !filter.role || u.role === filter.role);
      return {
        select() {
          return Promise.resolve(rows);
        },
      };
    },
  };

  const Notification = {
    async findOne(filter) {
      return (
        notifications.find((n) => {
          if (String(n.recipient) !== String(filter.recipient)) return false;
          if (filter.type && n.type !== filter.type) return false;
          const variants = filter["meta.assignmentId"]?.$in || [];
          const id = String(n.meta?.assignmentId || "");
          return variants.some((v) => String(v) === id);
        }) || null
      );
    },
  };

  async function createNotification(payload) {
    const row = {
      _id: makeId("notif"),
      createdAt: new Date(),
      ...payload,
    };
    notifications.push(row);
    return row;
  }

  return {
    assignments,
    users,
    notifications,
    Assignment,
    User,
    Notification,
    createNotification,
    originalFind,
  };
}

describe("assignment availability notifications", () => {
  let harness;

  beforeEach(() => {
    harness = createHarness();
  });

  it("future startDate is not available yet", () => {
    const start = Date.now() + 60 * 60 * 1000;
    const assignment = {
      _id: "a-future",
      status: "active",
      startDate: new Date(start),
      deadline: new Date(start + 86400000),
      title: "Future Lab",
      points: 20,
    };
    assert.equal(isAssignmentAvailableNow(assignment, Date.now()), false);
  });

  it("active assignment that has already opened is available", () => {
    const start = Date.now() - 60 * 1000;
    const assignment = {
      _id: "a-open",
      status: "active",
      startDate: new Date(start),
      deadline: new Date(Date.now() + 86400000),
      title: "Open Lab",
      points: 20,
    };
    assert.equal(isAssignmentAvailableNow(assignment, Date.now()), true);
  });

  it("deactive / unpublished assignment is not available for notify", () => {
    const assignment = {
      _id: "a-off",
      status: "deactive",
      startDate: new Date(Date.now() - 1000),
      deadline: new Date(Date.now() + 86400000),
      title: "Hidden",
      points: 10,
    };
    assert.equal(isAssignmentAvailableNow(assignment, Date.now()), false);
  });

  it("future assignment: notifyAssignmentAvailable skips without creating rows", async () => {
    const start = Date.now() + 30 * 60 * 1000;
    const assignment = {
      _id: "a1",
      status: "active",
      startDate: new Date(start),
      deadline: new Date(start + 86400000),
      title: "Evening Quiz",
      points: 15,
      availabilityNotifiedAt: null,
    };
    harness.assignments.push(assignment);

    const result = await notifyAssignmentAvailable(assignment, {
      ...harness,
      nowMs: Date.now(),
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "not-available-yet");
    assert.equal(harness.notifications.length, 0);
    assert.equal(assignment.availabilityNotifiedAt, null);
  });

  it("already-open assignment: notifies eligible students once", async () => {
    const start = Date.now() - 5 * 60 * 1000;
    const assignment = {
      _id: "a2",
      status: "active",
      startDate: new Date(start),
      deadline: new Date(Date.now() + 86400000),
      title: "Immediate Quiz",
      points: 25,
      availabilityNotifiedAt: null,
    };
    harness.assignments.push(assignment);

    const first = await notifyAssignmentAvailable(assignment, {
      ...harness,
      nowMs: Date.now(),
    });
    assert.equal(first.skipped, false);
    assert.equal(first.notified, 2);
    assert.equal(harness.notifications.length, 2);
    assert.ok(harness.assignments[0].availabilityNotifiedAt);

    const second = await notifyAssignmentAvailable(assignment, {
      ...harness,
      nowMs: Date.now(),
    });
    assert.equal(second.skipped, true);
    assert.equal(second.reason, "already-claimed");
    assert.equal(harness.notifications.length, 2);
  });

  it("dispatchDue notifies when start time is reached", async () => {
    const start = Date.now() - 1000;
    harness.assignments.push({
      _id: "a3",
      status: "active",
      startDate: new Date(start),
      deadline: new Date(Date.now() + 86400000),
      title: "Scheduled Now",
      points: 30,
      availabilityNotifiedAt: null,
    });

    const summary = await dispatchDueAssignmentAvailabilityNotifications({
      ...harness,
      nowMs: Date.now(),
      limit: 10,
    });

    assert.equal(summary.scanned, 1);
    assert.equal(summary.notified, 2);
    assert.equal(harness.notifications.length, 2);
    assert.match(harness.notifications[0].title, /New assignment posted/i);
    assert.match(harness.notifications[0].message, /Scheduled Now/);
  });

  it("duplicate student notification is suppressed", async () => {
    const assignment = {
      _id: "a4",
      title: "Dup Guard",
      points: 10,
    };
    harness.notifications.push({
      _id: "n-existing",
      recipient: "stu-1",
      type: "assignment",
      meta: { assignmentId: "a4" },
      createdAt: new Date(),
    });

    const result = await createAvailabilityNotificationForStudent({
      createNotification: harness.createNotification,
      Notification: harness.Notification,
      studentId: "stu-1",
      assignment,
    });
    assert.equal(result.created, false);
    assert.equal(result.reason, "duplicate");
    assert.equal(harness.notifications.length, 1);
  });

  it("unpublished due assignment is not scanned for notify", async () => {
    harness.assignments.push({
      _id: "a5",
      status: "archived",
      startDate: new Date(Date.now() - 1000),
      deadline: new Date(Date.now() + 86400000),
      title: "Archived",
      points: 10,
      availabilityNotifiedAt: null,
    });

    const summary = await dispatchDueAssignmentAvailabilityNotifications({
      ...harness,
      nowMs: Date.now(),
    });
    assert.equal(summary.scanned, 0);
    assert.equal(harness.notifications.length, 0);
  });

  it("create path no longer always notifies inline (source contract)", () => {
    const ctrl = fs.readFileSync(
      path.resolve(__dirname, "../controllers/teacherController.js"),
      "utf8"
    );
    assert.match(ctrl, /notifyAssignmentAvailable/);
    assert.match(ctrl, /availabilityNotifiedAt:\s*null/);
    assert.doesNotMatch(
      ctrl,
      /students\.map\(\(student\)\s*=>\s*[\s\S]{0,80}New assignment posted/
    );
  });

  it("cron route and vercel cron schedule are wired", () => {
    const cronRoutes = fs.readFileSync(
      path.resolve(__dirname, "../routes/cronRoutes.js"),
      "utf8"
    );
    assert.match(cronRoutes, /assignment-availability/);
    assert.match(cronRoutes, /CRON_SECRET|x-vercel-cron/);

    const appFull = fs.readFileSync(
      path.resolve(__dirname, "../appFull.js"),
      "utf8"
    );
    assert.match(appFull, /\/api\/cron/);

    const vercel = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "../vercel.json"), "utf8")
    );
    assert.ok(Array.isArray(vercel.crons));
    assert.equal(vercel.crons[0].path, "/api/cron/assignment-availability");

    const studentRoutes = fs.readFileSync(
      path.resolve(__dirname, "../routes/studentRoutes.js"),
      "utf8"
    );
    assert.match(studentRoutes, /flushAssignmentAvailabilityNotifications/);
  });

  it("notification timestamps use createdAt (local display on client)", () => {
    const topBar = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../frontend/src/components/common/DashboardTopBar.jsx"
      ),
      "utf8"
    );
    assert.match(topBar, /createdAt/);
    assert.match(topBar, /toLocaleString\(\)/);
  });
});
