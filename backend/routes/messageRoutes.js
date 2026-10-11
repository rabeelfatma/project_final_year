const express = require("express");
const router = express.Router();
const upload = require("../middleware/multerMiddleware");
const { protect } = require("../middleware/authMiddleware");
const ctrl = require("../controllers/messageController");

router.use(protect);
router.get("/users", ctrl.users);
router.get("/", ctrl.list);
router.post("/", ctrl.sendText);
router.post("/voice", upload.single("voice"), ctrl.sendVoice);
router.put("/:id", ctrl.updateText);
router.delete("/", ctrl.clearAll);
router.post("/bulk-delete", ctrl.removeMany);
router.delete("/:id", ctrl.remove);
module.exports = router;
