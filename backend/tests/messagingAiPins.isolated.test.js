/**
 * Isolated contracts for conversation pins, conversation-read marking,
 * and AI chat rename/pin meta — no MongoDB, no production writes.
 */
const assert = require("node:assert/strict");
const { describe, it, beforeEach, afterEach } = require("node:test");
const fs = require("fs");
const path = require("path");
const Module = require("module");

const root = path.join(__dirname, "..");
const messageControllerPath = path.join(root, "controllers", "messageController.js");
const aiChatControllerPath = path.join(root, "controllers", "aiChatController.js");
const conversationPinPath = path.join(root, "models", "ConversationPin.js");
const messageModelPath = path.join(root, "models", "Message.js");
const userModelPath = path.join(root, "models", "User.js");
const aiChatModelPath = path.join(root, "models", "AIChat.js");
const notificationControllerPath = path.join(root, "controllers", "notificationController.js");
const storedFilesPath = path.join(root, "utils", "storedFiles.js");
const artifactPath = path.join(root, "utils", "artifactDownloadUrl.js");

function clear(modPath) {
  delete require.cache[require.resolve(modPath)];
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe("ConversationPin model + message pin/read contracts", () => {
  it("defines owner/peer unique pin schema fields", () => {
    const source = fs.readFileSync(conversationPinPath, "utf8");
    assert.match(source, /owner/);
    assert.match(source, /peer/);
    assert.match(source, /pinned/);
    assert.match(source, /unique:\s*true/);
  });

  it("message routes expose pins and conversation-read before :id", () => {
    const routes = fs.readFileSync(path.join(root, "routes", "messageRoutes.js"), "utf8");
    assert.match(routes, /\/pins/);
    assert.match(routes, /conversation-read/);
    const pinIdx = routes.indexOf("/pins");
    const idIdx = routes.indexOf("/:id");
    assert.ok(pinIdx >= 0 && idIdx > pinIdx);
  });
});

describe("messageController pin + read (mocked stores)", () => {
  let pins;
  let users;
  let messages;

  beforeEach(() => {
    pins = [];
    users = [
      { _id: "u-peer", name: "Peer", email: "p@example.com", role: "student" },
      { _id: "u-me", name: "Me", email: "me@example.com", role: "teacher" },
    ];
    messages = [
      {
        _id: "m1",
        sender: "u-peer",
        recipient: "u-me",
        text: "Hello there",
        read: false,
        createdAt: new Date("2026-01-02T00:00:00Z"),
      },
    ];

    require.cache[conversationPinPath] = {
      id: conversationPinPath,
      filename: conversationPinPath,
      loaded: true,
      exports: {
        find(query) {
          const rows = pins.filter(
            (row) =>
              String(row.owner) === String(query.owner) &&
              (query.pinned == null || row.pinned === query.pinned)
          );
          return {
            select() {
              return {
                lean: async () => rows,
              };
            },
          };
        },
        findOneAndDelete: async (query) => {
          const idx = pins.findIndex(
            (row) =>
              String(row.owner) === String(query.owner) &&
              String(row.peer) === String(query.peer)
          );
          if (idx < 0) return null;
          return pins.splice(idx, 1)[0];
        },
        findOneAndUpdate(query, update) {
          let row = pins.find(
            (item) =>
              String(item.owner) === String(query.owner) &&
              String(item.peer) === String(query.peer)
          );
          if (!row) {
            row = {
              owner: query.owner,
              peer: query.peer,
              pinned: true,
              pinnedAt: new Date(),
            };
            pins.push(row);
          }
          Object.assign(row, update.$set || {});
          return {
            lean: async () => row,
          };
        },
      },
    };

    require.cache[userModelPath] = {
      id: userModelPath,
      filename: userModelPath,
      loaded: true,
      exports: {
        find(query) {
          const rows = users.filter((user) => String(user._id) !== String(query._id?.$ne));
          return {
            select() {
              return this;
            },
            sort() {
              return this;
            },
            lean: async () => rows.filter((user) => String(user._id) !== "u-me"),
          };
        },
        findById: async (id) => users.find((user) => String(user._id) === String(id)) || null,
      },
    };

    require.cache[messageModelPath] = {
      id: messageModelPath,
      filename: messageModelPath,
      loaded: true,
      exports: {
        find() {
          return {
            sort() {
              return this;
            },
            limit() {
              return this;
            },
            select() {
              return this;
            },
            lean: async () => messages,
            populate() {
              return this;
            },
          };
        },
        updateMany: async (filter) => {
          let modified = 0;
          for (const row of messages) {
            if (
              String(row.sender) === String(filter.sender) &&
              String(row.recipient) === String(filter.recipient) &&
              row.read === false
            ) {
              row.read = true;
              modified += 1;
            }
          }
          return { modifiedCount: modified };
        },
      },
    };

    require.cache[notificationControllerPath] = {
      id: notificationControllerPath,
      filename: notificationControllerPath,
      loaded: true,
      exports: { create: async () => ({}) },
    };
    require.cache[storedFilesPath] = {
      id: storedFilesPath,
      filename: storedFilesPath,
      loaded: true,
      exports: { remove: async () => {} },
    };

    clear(messageControllerPath);
  });

  afterEach(() => {
    clear(messageControllerPath);
    delete require.cache[conversationPinPath];
    delete require.cache[userModelPath];
    delete require.cache[messageModelPath];
    delete require.cache[notificationControllerPath];
    delete require.cache[storedFilesPath];
  });

  it("setPin rejects invalid peer ids and self-pins", async () => {
    const ctrl = require(messageControllerPath);
    const invalid = mockRes();
    await ctrl.setPin(
      { user: { _id: "u-me" }, params: { peerId: "not-a-valid-object-id" }, body: { pinned: true } },
      invalid
    );
    assert.equal(invalid.statusCode, 400);

    const selfOid = "507f191e810c19729de860ea";
    const self = mockRes();
    await ctrl.setPin(
      { user: { _id: selfOid }, params: { peerId: selfOid }, body: { pinned: true } },
      self
    );
    assert.equal(self.statusCode, 400);
    assert.match(String(self.body?.message || ""), /cannot pin yourself/i);
  });

  it("markConversationRead only updates messages from the peer to me", async () => {
    const ctrl = require(messageControllerPath);
    const peerOid = "507f191e810c19729de860ea";
    messages[0].sender = peerOid;
    const res = mockRes();
    await ctrl.markConversationRead(
      { user: { _id: "u-me" }, body: { peerId: peerOid } },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.updated, 1);
    assert.equal(messages[0].read, true);
  });
});

describe("AIChat patchMeta rename/pin (mocked)", () => {
  let chats;

  beforeEach(() => {
    chats = [
      {
        owner: "u1",
        role: "student",
        clientId: "c1",
        title: "Old title",
        pinned: false,
        messages: [],
        updatedAt: new Date(),
      },
    ];
    require.cache[aiChatModelPath] = {
      id: aiChatModelPath,
      filename: aiChatModelPath,
      loaded: true,
      exports: {
        findOneAndUpdate(filter, update) {
          const chat = chats.find(
            (row) =>
              String(row.owner) === String(filter.owner) &&
              row.role === filter.role &&
              row.clientId === filter.clientId
          );
          if (!chat) return { lean: async () => null };
          Object.assign(chat, update.$set || {});
          return { lean: async () => ({ ...chat }) };
        },
        find() {
          return {
            sort() {
              return this;
            },
            limit() {
              return this;
            },
            lean: async () => chats,
          };
        },
      },
    };
    require.cache[artifactPath] = {
      id: artifactPath,
      filename: artifactPath,
      loaded: true,
      exports: {
        sanitizeArtifacts: (value) => (Array.isArray(value) ? value : []),
      },
    };
    clear(aiChatControllerPath);
  });

  afterEach(() => {
    clear(aiChatControllerPath);
    delete require.cache[aiChatModelPath];
    delete require.cache[artifactPath];
  });

  it("renames and pins only the owner+role chat", async () => {
    const ctrl = require(aiChatControllerPath);
    const res = mockRes();
    await ctrl.patchMeta(
      {
        user: { _id: "u1", role: "student" },
        params: { clientId: "c1" },
        body: { title: "Renamed chat", pinned: true },
      },
      res
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.chat.title, "Renamed chat");
    assert.equal(res.body.chat.pinned, true);
    assert.equal(chats[0].title, "Renamed chat");
    assert.equal(chats[0].pinned, true);
  });

  it("rejects empty meta updates", async () => {
    const ctrl = require(aiChatControllerPath);
    const res = mockRes();
    await ctrl.patchMeta(
      { user: { _id: "u1", role: "student" }, params: { clientId: "c1" }, body: {} },
      res
    );
    assert.equal(res.statusCode, 400);
  });
});

describe("frontend selection contracts", () => {
  it("MessagePanel scopes Select/Deselect labels to visible eligible ids", () => {
    const source = fs.readFileSync(
      path.join(root, "..", "frontend", "src", "components", "common", "MessagePanel.jsx"),
      "utf8"
    );
    assert.match(source, /selectedVisibleIds/);
    assert.match(source, /Deselect all/);
    assert.match(source, /eligibleIds\.length/);
    assert.match(source, /\/messages\/pins\//);
    assert.match(source, /conversation-read/);
    assert.match(source, /unreadOnly/);
  });

  it("AIChatbot searches history and patches meta for rename/pin", () => {
    const source = fs.readFileSync(
      path.join(root, "..", "frontend", "src", "components", "common", "AIChatbot.jsx"),
      "utf8"
    );
    assert.match(source, /historySearch/);
    assert.match(source, /patch\(`\/ai-chats\/\$\{encodeURIComponent\(chat\.id\)\}\/meta`/);
    assert.match(source, /Deselect all/);
    assert.match(source, /selectedVisibleIds/);
  });

  it("NotificationsPanel filters by unread and existing type values", () => {
    const source = fs.readFileSync(
      path.join(root, "..", "frontend", "src", "components", "common", "DashboardTopBar.jsx"),
      "utf8"
    );
    assert.match(source, /unreadOnly/);
    assert.match(source, /typeFilter/);
    assert.match(source, /registration_pending/);
    assert.match(source, /Mark all read/);
  });
});

// Silence unused Module import warning if linted later.
void Module;
