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
});
