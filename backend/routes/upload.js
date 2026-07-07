const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const rateLimit = require('express-rate-limit');
const { extractTextFromImage } = require('../utils/ocrProcessor');
const { authenticateToken } = require('../middleware/auth');

// 
const uploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 100, // Limit each user to 100 OCR requests per day
  skip: (req, res) => process.env.NODE_ENV !== 'production', // Unlimited in local dev
  message: { error: 'Scan limit reached (100/day). Please try again tomorrow.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// 
// The frontend keeps the File object in state.
// Image is saved later when user clicks "Save to Inventory" via POST /api/items
router.post('/', authenticateToken, uploadLimiter, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No image uploaded' });
  }

  // Write buffer to a temp file so Sharp/Tesseract can read it
  const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
  const tmpPath = path.join(os.tmpdir(), `ocr_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);

  try {
    fs.writeFileSync(tmpPath, req.file.buffer);

    // ── Run OCR ───────────────────────────────────────────────────────────────
    let ocrResult;
    try {
      ocrResult = await extractTextFromImage(tmpPath);
    } catch (ocrErr) {
      console.error('OCR pipeline failed:', ocrErr.message);
      return res.status(422).json({
        success: false,
        error: `OCR failed: ${ocrErr.message}. Please try a clearer image.`,
      });
    } finally {
      // Always clean up temp file
      try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    }

    const { text, confidence } = ocrResult;
    console.log('\n--- RAW OCR OUTPUT ---\n' + text + '\n----------------------\n');

    // ── Run date detection ────────────────────────────────────────────────────
    const { detectDates } = require('../utils/expiryDetector');
    const heuristicResult = detectDates(text);

    const { parseDateWithAI, mergeResults, callVisionAI } = require('../utils/aiParser');
    const aiResult = await parseDateWithAI(text, heuristicResult.normalized);
    let final = mergeResults(aiResult, heuristicResult);

    // ── ANTI-HALLUCINATION GUARDRAIL ──────────────────────────────────────────
    // If the AI hallucinates an expiration date, its year/month typically won't exist in the raw OCR text.
    // If we detect a hallucinated date we crush the confidence to force a Cloud Vision fallback.
    if (final.exp && final.source === 'ai') {
      const year = final.exp.split('-')[0].substring(2); // "27" from "2027"
      const month = final.exp.split('-')[1]; // "05"
      // Remove spaces/punctuation from text to check for garbled substrings
      const strippedText = text.replace(/[\s\.\/,-]/g, '');
      if (!strippedText.includes(year) && !text.includes(year)) {
        console.log(`[Guardrail] AI hallucinated year '${year}'. Forcing Cloud Vision fallback.`);
        final.confidence = 0.1;
      }
    }

    // ── HYBRID FALLBACK: If local OCR failed entirely or has LOW CONFIDENCE, use Cloud Vision ───────
    // We raised the threshold to 0.85. The AI prompt only allows 0.9 for perfect matches. 
    // Anything less is treated as uncertain and triggers the fallback.
    if (!final.exp || final.confidence < 0.85) {
      console.log('Local OCR uncertain or failed. Falling back to Cloud Vision API...');
      try {
        // Compress image before sending to Cloud Vision to prevent payload/timeout errors
        const sharp = require('sharp');
        const compressedBuffer = await sharp(req.file.buffer)
          .resize(800, null, { withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
          
        const base64Data = compressedBuffer.toString('base64');
        const dataUri = `data:image/jpeg;base64,${base64Data}`;
        
        const visionResult = await callVisionAI(dataUri);
        if (visionResult && visionResult.exp) {
          console.log('Cloud Vision succeeded!');
          final = {
            mfd: visionResult.mfd,
            exp: visionResult.exp,
            confidence: visionResult.confidence || 0.9,
            source: 'cloud-vision',
            reasoning: visionResult.reasoning || 'Extracted via Vision API fallback'
          };
        }
      } catch (visionErr) {
        console.error('Vision Fallback failed:', visionErr?.response?.data || visionErr.message);
      }
    }

    // ── Return OCR + date results only — image NOT saved yet ──────────────────
    res.json({
      success: true,
      // No imagePath/imagePublicId — image stays in frontend until user saves
      ocrText: text,
      aiConfidence: aiResult ? aiResult.confidence : 0,
      confidence: final.confidence * 100,
      detectedDate: final.exp,
      mfd: final.mfd,
      exp: final.exp,
      detected: !!final.exp,
      source: final.source,
      reasoning: final.reasoning,
      candidates: heuristicResult.candidates,
    });

  } catch (err) {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
    console.error('Upload/OCR error:', err.message);
    res.status(500).json({ success: false, error: err.message });
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
