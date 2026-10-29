/**
 * QC UI polish contracts — themes, notification toggle, admin CTA removal,
 * messages/AI selection chrome, and voice MIME normalization.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("QC UI polish contracts", () => {
  it("exposes six accent colours including red, purple, and teal", () => {
    const theme = read("frontend/src/context/ThemeContext.jsx");
    for (const key of ["blue", "sky", "deep", "red", "purple", "teal"]) {
      assert.match(theme, new RegExp(`\\b${key}:\\s*\\{`));
    }
    assert.match(theme, /name:\s*"Red"/);
    assert.match(theme, /name:\s*"Purple"/);
    assert.match(theme, /name:\s*"Teal"/);
    assert.doesNotMatch(theme, /name:\s*"Orange"/);
    assert.match(theme, /--sidebar-active-bg/);
  });

  it("persists a real in-app notification centre toggle", () => {
    const prefs = read("frontend/src/utils/notificationPrefs.js");
    const settings = read("frontend/src/pages/account/SettingsPage.jsx");
    const topBar = read("frontend/src/components/common/DashboardTopBar.jsx");
    assert.match(prefs, /qc_in_app_notifications/);
    assert.match(prefs, /getInAppNotificationsEnabled/);
    assert.match(prefs, /setInAppNotificationsEnabled/);
    assert.match(settings, /role="switch"/);
    assert.match(settings, /aria-checked=\{notificationsEnabled\}/);
    assert.doesNotMatch(settings, /Always on/i);
    assert.match(topBar, /notificationsEnabled/);
    assert.match(topBar, /notification centre is turned off/i);
  });

  it("removes Admin Add Student/Teacher dashboard CTAs without dropping signup routes", () => {
    const admin = read("frontend/src/pages/dashboards/AdminDashboard.jsx");
    assert.doesNotMatch(admin, /Add \{activeTab\.slice/);
    assert.doesNotMatch(admin, /signup\/student/);
    assert.doesNotMatch(admin, /signup\/teacher/);
    assert.match(admin, /Registration Requests/);
    assert.match(admin, /approveRegistrationRequest|onApprove/);
    const routes = read("frontend/src/routes/AppRoutes.jsx");
    assert.match(routes, /signup\/student|StudentSignup/);
    assert.match(routes, /signup\/teacher|TeacherSignup/);
  });

  it("keeps shared selection chrome for Messages and AI Assistant", () => {
    const css = read("frontend/src/index.css");
    const messages = read("frontend/src/components/common/MessagePanel.jsx");
    const ai = read("frontend/src/components/common/AIChatbot.jsx");
    assert.match(css, /\.qc-chat-bubble/);
    assert.match(css, /\.qc-chat-checkbox/);
    assert.match(css, /\.qc-chat-selection-bar/);
    assert.match(messages, /qc-chat-bubble/);
    assert.match(messages, /normalizeAudioMime|arrayBuffer/);
    assert.match(ai, /qc-chat-selection-bar/);
    assert.match(ai, /qc-chat-bubble/);
  });

  it("serves voice messages inline with a clean audio MIME type", () => {
    const fileCtrl = read("backend/controllers/fileController.js");
    const msgCtrl = read("backend/controllers/messageController.js");
    assert.match(fileCtrl, /normalizeVoiceMime/);
    assert.match(fileCtrl, /sendFile\([\s\S]*true\)/);
    assert.match(fileCtrl, /audio\/webm/);
    assert.match(msgCtrl, /split\(";"\)\[0\]/);
  });

  it("notificationPrefs defaults to enabled and maps off values", () => {
    const source = read("frontend/src/utils/notificationPrefs.js");
    const transformed = source
      .replace(/export const/g, "const")
      .replace(/export function/g, "function")
      .concat(
        "\nmodule.exports = { getInAppNotificationsEnabled, setInAppNotificationsEnabled, IN_APP_NOTIFICATIONS_KEY };\n"
      );
    const store = new Map();
    const listeners = [];
    const sandbox = {
      module: { exports: {} },
      exports: {},
      localStorage: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
      },
      window: {
        dispatchEvent: (event) => listeners.forEach((fn) => fn(event)),
        addEventListener: () => {},
      },
      CustomEvent: class CustomEvent {
        constructor(type, init) {
          this.type = type;
          this.detail = init?.detail;
        }
      },
    };
    vm.runInNewContext(transformed, sandbox);
    const {
      getInAppNotificationsEnabled,
      setInAppNotificationsEnabled,
      IN_APP_NOTIFICATIONS_KEY,
    } = sandbox.module.exports;

    assert.equal(getInAppNotificationsEnabled(), true);
    setInAppNotificationsEnabled(false);
    assert.equal(store.get(IN_APP_NOTIFICATIONS_KEY), "off");
    assert.equal(getInAppNotificationsEnabled(), false);
    setInAppNotificationsEnabled(true);
    assert.equal(store.get(IN_APP_NOTIFICATIONS_KEY), "on");
    assert.equal(getInAppNotificationsEnabled(), true);
  });

  it("search fields use one outlined wrapper and neutralize nested input borders", () => {
    const css = read("frontend/src/index.css");
    const searchField = read("frontend/src/components/ui/SearchField.jsx");
    const messages = read("frontend/src/components/common/MessagePanel.jsx");
    const ai = read("frontend/src/components/common/AIChatbot.jsx");
    const student = read("frontend/src/pages/dashboards/StudentDashboard.jsx");
    assert.match(css, /\.qc-search-field\s*\{/);
    assert.match(css, /\.qc-search-field__input/);
    assert.match(css, /appearance:\s*none\s*!important/);
    assert.match(css, /\.qc-search-clear/);
    assert.match(css, /\.qc-assignments-toolbar/);
    assert.match(searchField, /qc-search-field/);
    assert.match(searchField, /qc-search-field__input/);
    assert.match(searchField, /Clear search/);
    assert.match(messages, /SearchField/);
    assert.match(ai, /SearchField/);
    assert.match(student, /SearchField/);
    assert.match(student, /qc-assignments-toolbar/);
    assert.doesNotMatch(student, /bg-slate-900 p-3 rounded-xl border border-slate-800/);
  });

  it("assignment due-date sort labels are professional and undated items stay last", () => {
    const student = read("frontend/src/pages/dashboards/StudentDashboard.jsx");
    assert.match(student, /Due date: Earliest first/);
    assert.match(student, /Due date: Latest first/);
    assert.match(student, /sortAssignmentsByDueDate/);

    const sortSource = read("frontend/src/utils/assignmentSort.js");
    const transformed = sortSource
      .replace(/export function/g, "function")
      .concat("\nmodule.exports = { sortAssignmentsByDueDate, dueTimestamp };\n");
    const sandbox = { module: { exports: {} }, exports: {} };
    vm.runInNewContext(transformed, sandbox);
    const { sortAssignmentsByDueDate } = sandbox.module.exports;
    const sample = [
      { id: "later", deadline: "2026-12-01T00:00:00.000Z" },
      { id: "missing", deadline: null },
      { id: "earlier", deadline: "2026-01-15T00:00:00.000Z" },
      { id: "invalid", deadline: "not-a-date" },
    ];
    // Copy out of the vm realm before asserting (cross-realm arrays break deepEqual).
    const ascIds = Array.from(sortAssignmentsByDueDate(sample, "due-asc"), (row) => row.id);
    const descIds = Array.from(sortAssignmentsByDueDate(sample, "due-desc"), (row) => row.id);
    assert.equal(ascIds.join(","), "earlier,later,missing,invalid");
    assert.equal(descIds.join(","), "later,earlier,missing,invalid");
  });

  it("overflow menus portal with fixed positioning to avoid panel clipping", () => {
    const menu = read("frontend/src/components/ui/OverflowMenu.jsx");
    const css = read("frontend/src/index.css");
    assert.match(menu, /createPortal/);
    assert.match(menu, /qc-overflow-panel--fixed/);
    assert.match(menu, /Escape/);
    assert.match(css, /\.qc-overflow-panel--fixed/);
  });

  it("notifications toolbar stays compact with unread/type filters", () => {
    const topBar = read("frontend/src/components/common/DashboardTopBar.jsx");
    assert.match(topBar, /qc-notifications-toolbar/);
    assert.match(topBar, /qc-toolbar-select/);
    assert.match(topBar, /qc-filter-chip--compact/);
    assert.match(topBar, /Mark all read/);
    assert.match(topBar, /Clear all/);
  });

  it("student assignment cards show Submitted status and badge-anchored duplicate notice", () => {
    const student = read("frontend/src/pages/dashboards/StudentDashboard.jsx");
    const css = read("frontend/src/index.css");
    const routes = read("backend/routes/studentRoutes.js");
    assert.match(student, /Already submitted\./);
    assert.match(
      student,
      /Your submission is saved\. You do not need to submit it again\./
    );
    assert.match(student, /setTimeout\(\(\) => setDuplicateNoticeId\(null\), 3000\)/);
    assert.match(student, /onAlreadySubmitted/);
    assert.match(student, /showDuplicateNotice/);
    assert.match(student, /duplicateNoticeId/);
    assert.match(student, /qc-assignment-status-anchor/);
    assert.match(student, /qc-assignment-inline-notice/);
    assert.match(student, /qc-already-submitted-inline/);
    assert.match(student, /canSubmit === true/);
    assert.match(student, /Submitted — awaiting evaluation/);
    assert.match(student, /qc-assignments-toolbar/);
    assert.doesNotMatch(student, /qc-info-toast--float/);
    assert.doesNotMatch(student, /createPortal/);
    assert.doesNotMatch(student, /Short text answer \(demo-friendly\)/i);
    assert.match(css, /\.qc-assignment-status-anchor/);
    assert.match(css, /\.qc-assignment-inline-notice[\s\S]*position:\s*absolute/);
    assert.doesNotMatch(css, /\.qc-info-toast--float/);
    assert.match(routes, /ALREADY_SUBMITTED/);
    assert.match(routes, /You have already submitted this assignment\./);
  });
});
