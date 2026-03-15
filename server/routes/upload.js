const express = require('express');
const auth = require('../middleware/auth');
const upload = require('../middleware/upload');

const router = express.Router();

// POST /api/upload - Upload a file
router.post('/', auth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'File size exceeds 10MB limit.' });
      }
      return res.status(400).json({ message: err.message || 'File upload failed.' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file provided.' });
    }

    const backendBaseUrl = "https://infrachat-gemh.onrender.com";

    const file = {
      url: `${backendBaseUrl}/uploads/${req.file.filename}`,
      name: req.file.originalname,
      size: req.file.size,
      type: req.file.mimetype,
    };

    return res.json({ file });
  });
});

module.exports = router;
