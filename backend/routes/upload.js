const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { extractTextFromImage } = require('../utils/ocrProcessor');
const { detectExpiry, extractCandidates } = require('../utils/expiryDetector');

// ─── Multer config ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `upload_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ─── POST /api/upload ─────────────────────────────────────────────────────────
router.post('/', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No image uploaded' });
  }

  const filePath = req.file.path;
  const relativePath = `uploads/${req.file.filename}`;

  try {
    // Run OCR
    const { text, confidence } = await extractTextFromImage(filePath);
    console.log('\n--- RAW OCR OUTPUT ---\n' + text + '\n----------------------\n');

    // Use the comprehensive multi-date detector
    const { detectDates } = require('../utils/expiryDetector');
    const heuristicResult = detectDates(text);

    // If aiParser is available, run it and merge
    const { parseDateWithAI, mergeResults } = require('../utils/aiParser');
    const aiResult = await parseDateWithAI(text, heuristicResult.normalized); // use pass-2 normalized text if needed
    
    // Combine both logic paths
    const final = mergeResults(aiResult, heuristicResult);

    res.json({
      success: true,
      imagePath: relativePath,
      ocrText: text,
      aiConfidence: aiResult ? aiResult.confidence : 0,
      confidence: final.confidence * 100,
      detectedDate: final.exp, // for backward-compat with frontend
      mfd: final.mfd,
      exp: final.exp,
      detected: !!final.exp,
      source: final.source,
      reasoning: final.reasoning,
      candidates: heuristicResult.candidates // still provide raw candidates for UI to pick
    });
  } catch (err) {
    console.error('Upload/OCR error:', err.message);
    // Still return the image path so user can do manual entry
    res.status(200).json({
      success: true,
      imagePath: relativePath,
      ocrText: '',
      confidence: 0,
      detectedDate: null,
      detected: false,
      error: err.message,
      candidates: []
    });
  }
});

// Error handler for multer
router.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, error: 'File too large (max 15MB)' });
  }
  res.status(400).json({ success: false, error: err.message });
});

module.exports = router;
