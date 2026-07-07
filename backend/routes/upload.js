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
      const strippedText = text.replace(/[\s\.\/,-]/g, '');
      if (!strippedText.includes(year) && !text.includes(year)) {
        console.log(`[Guardrail] AI hallucinated year '${year}'. Forcing Cloud Vision fallback.`);
        final.confidence = 0.1;
      }
    }

    // ── OCR DIGIT CONFUSION DETECTOR ────────────────────────────────────────
    // OCR commonly confuses 6↔8 and 5↔3 in year digits. If the result says "2028"
    // but the OCR text also contains "2026", it's a systematic distortion.
    // Force Cloud Vision to read the actual image pixels instead of trusting garbled text.
    if (final.confidence > 0.1) {
      const DIGIT_SWAPS = { '6': '8', '8': '6', '5': '3', '3': '5' };
      const datesToCheck = [final.exp, final.mfd].filter(Boolean);
      for (const dateStr of datesToCheck) {
        const year = dateStr.split('-')[0]; // "2028"
        const lastDigit = year[3];
        if (DIGIT_SWAPS[lastDigit]) {
          const twinYear = year.slice(0, 3) + DIGIT_SWAPS[lastDigit]; // "2026"
          if (text.includes(twinYear)) {
            console.log(`[Guardrail] OCR digit confusion: result has ${year} but text also contains ${twinYear}. Forcing Cloud Vision.`);
            final.confidence = 0.1;
            break;
          }
        }
      }
    }

    // ── HYBRID FALLBACK: If local OCR failed entirely or has LOW CONFIDENCE, use Cloud Vision ───────
    // We raised the threshold to 0.85. The AI prompt only allows 0.9 for perfect matches. 
    // Anything less is treated as uncertain and triggers the fallback.
    if (!final.exp || final.confidence < 0.85) {
      console.log(`Local OCR uncertain (confidence: ${final.confidence}). Falling back to Cloud Vision API...`);
      try {
        // Compress image before sending to Cloud Vision to prevent payload/timeout errors
        const sharp = require('sharp');
        const compressedBuffer = await sharp(req.file.buffer)
          .resize(800, null, { withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
          
        const base64Data = compressedBuffer.toString('base64');
        const dataUri = `data:image/jpeg;base64,${base64Data}`;
        
        console.log(`Sending ${Math.round(compressedBuffer.length / 1024)}kb image to Cloud Vision...`);
        const visionResult = await callVisionAI(dataUri);
        console.log('Cloud Vision raw response:', JSON.stringify(visionResult));
        
        // Accept result if it has EITHER exp or mfd (not just exp)
        if (visionResult && (visionResult.exp || visionResult.mfd)) {
          console.log('Cloud Vision succeeded!');
          final = {
            mfd: visionResult.mfd || final.mfd,
            exp: visionResult.exp || final.exp,
            confidence: visionResult.confidence || 0.9,
            source: 'cloud-vision',
            reasoning: visionResult.reasoning || 'Extracted via Vision API fallback'
          };
        } else {
          console.log('Cloud Vision returned no dates:', JSON.stringify(visionResult));
        }
      } catch (visionErr) {
        console.error('Vision Fallback failed:', visionErr?.response?.status, visionErr?.response?.data || visionErr.message);
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
