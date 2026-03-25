const multer = require("multer");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: process.env.NODE_ENV === "test" ? 10 * 1024 * 1024 : 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (req.path.includes("upload-resume") && file.mimetype !== "application/pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    if (req.path.includes("upload-booth-logo") && !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  },
});

module.exports = upload;
