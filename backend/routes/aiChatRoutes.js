const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const controller = require("../controllers/aiChatController");

router.use(protect);
router.get("/", controller.list);
router.post("/bulk-delete", controller.removeMany);
router.put("/:clientId", controller.upsert);
router.delete("/:clientId", controller.remove);

module.exports = router;
