const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const upload = require("../middleware/multerMiddleware");
const { chat, downloadGenerated } = require("../controllers/aiController");

router.post("/chat", protect, upload.array("files", 40), chat);
router.get("/generated/:name", protect, downloadGenerated);
module.exports = router;
