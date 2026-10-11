const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Folder existence check
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Unique filename using timestamp
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { 
    // 100MB Maximum Limit for Videos and large files
    fileSize: 100 * 1024 * 1024 
  },
  fileFilter: (req, file, cb) => {
    // 1. All Allowed Extensions
    const allowedExtensions = [
      // Documents
      '.pdf', '.docx', '.txt', '.md', '.html',
      // Programming
      '.py', '.js', '.cpp', '.c', '.java', '.php', '.cs', '.swift', '.go', '.sql',
      // Images
      '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif',
      // Video
      '.mp4', '.mov', '.avi', '.wmv', '.mpeg',
      // Audio
      '.mp3', '.wav', '.aac', '.flac'
    ];

    const fileExt = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error(`Error: File type ${fileExt} not supported!`), false);
    }
  }
});

module.exports = upload;