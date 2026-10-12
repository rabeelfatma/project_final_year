const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const controller = require("../controllers/notificationController");

router.get("/", protect, controller.list);
router.get("/public-key", protect, controller.publicKey);
router.post("/subscribe", protect, controller.subscribe);
router.put("/read-all", protect, controller.markAllRead);
router.put("/:id/read", protect, controller.markOneRead);
router.delete("/:id", protect, controller.remove);
router.delete("/", protect, controller.clearAll);
router.post("/unsubscribe", protect, controller.unsubscribe);

module.exports = router;
