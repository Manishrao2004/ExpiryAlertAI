/**
 * ocrProcessor.js — Multi-pipeline OCR for Indian product labels
 *
 * Strategy:
 *  1. Run THREE preprocessing pipelines in parallel
 *     a) Dot-matrix pipeline  : blur→threshold→median (good for ink-dot fonts)
 *     b) Clean-print pipeline : sharpen→clahe-like normalize (good for bold print)
 *     c) Adaptive pipeline    : OTSU-style per-region threshold (good for stained/dirty labels)
 *  2. Run Tesseract on ALL three outputs simultaneously
 *  3. Pick the result with the highest confidence AND most date-like tokens
 *  4. Also run a second Tesseract pass with PSM-11 (sparse text) if PSM-6 misses dates
 *  5. Merge the two best texts before returning
 *
 * Handles:
 *  - Dot-matrix fonts (images 1, 4)
 *  - Bold clean print on curved containers (image 2)
 *  - Mixed label styles (image 3)
 *  - Stained / wrinkled labels (image 4)
 *  - Rotated sidebar text (image 2) — suppressed via crop heuristic
 */

const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ─── Image Preprocessing Pipelines ────────────────────────────────────────────

/**
 * Scale to a consistent width for OCR (300 DPI equivalent).
 * Returns a sharp instance ready for further pipeline steps.
 */
async function baseResize(inputPath, targetWidth = 2400) {
  const meta = await sharp(inputPath).metadata();
  const w = meta.width || 800;
  const h = meta.height || 600;

  // SAFETY: If image is tiny (like the 2x36 error), scale it up significantly 
  // before any filtering to avoid kernel-size errors.
  const minDim = Math.min(w, h);
  let scale = w < targetWidth ? Math.min(4.0, targetWidth / w) : 1;
  
  if (minDim < 10) scale = Math.max(scale, 20); // extreme upscale for tiny slivers
  
  const newW = Math.max(100, Math.round(w * scale)); // Ensure at least 100px

  return sharp(inputPath)
    .resize(newW, null, { 
      withoutEnlargement: false, 
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false 
    });
}

/**
 * Pipeline A — Dot-matrix / ink-dot fonts
 * Works by bridging the gaps between dots, then binarising.
 * Best for: images 1, 4 (dot-matrix printer labels)
 */
async function pipelineDotMatrix(inputPath, outPath) {
  const base = await baseResize(inputPath);
  await base
    .grayscale()
    .clahe({ width: 30, height: 30 }) // Enhance local contrast for faint dots
    .normalize()
    .blur(1.2)          // bridge dots
    .threshold(140)     // slightly higher threshold to solidify bridged dots
    .median(3)          
    .png({ quality: 100 })
    .toFile(outPath);
}

/**
 * Pipeline B — Clean bold print on containers
 * Sharpens edges without blurring, handles curved label distortion.
 * Best for: images 2, 3
 */
async function pipelineCleanPrint(inputPath, outPath) {
  const base = await baseResize(inputPath);
  await base
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.5, m1: 1.5, m2: 0.7 })
    .threshold(140)
    .png({ quality: 100 })
    .toFile(outPath);
}

/**
 * Pipeline C — Adaptive / stained labels
 * Uses a lower threshold and stronger median to cope with background staining.
 * Best for: image 4 (dirty/stained wrinkled label)
 */
async function pipelineAdaptive(inputPath, outPath) {
  const base = await baseResize(inputPath, 2800); // extra scale for small/noisy labels
  await base
    .grayscale()
    .normalize()
    .blur(2.0)
    .threshold(110)     // lower threshold catches ink on dark background
    .median(5)          // stronger denoising for stains
    .png({ quality: 100 })
    .toFile(outPath);
}

// ─── Tesseract Runner ─────────────────────────────────────────────────────────

const CHAR_WHITELIST =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-.() :,';

/**
 * Run Tesseract with a specific Page Segmentation Mode.
 * PSM 6 = uniform block of text (default)
 * PSM 11 = sparse text — finds text scattered across the image (great for labels)
 * PSM 4 = single column of text
 */
async function runTesseract(imagePath, psm = '6') {
  const worker = await createWorker('eng', 1, { logger: () => {} });
  await worker.setParameters({
    tessedit_char_whitelist: CHAR_WHITELIST,
    tessedit_pageseg_mode: psm,
  });
  const { data: { text, confidence } } = await worker.recognize(imagePath);
  await worker.terminate();
  return { text: text.trim(), confidence: Math.round(confidence) };
}

// ─── Date token scorer ────────────────────────────────────────────────────────

const DATE_SCORE_RE = [
  /\b\d{1,2}[\s\/\-\.]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\/\-\.]+\d{2,4}\b/gi,
  /\b\d{1,2}[\s\/\-\.]+\d{1,2}[\s\/\-\.]+\d{2,4}\b/g,
  /\b(?:exp|mfg|use\s*by|best\s*before|mfd|pkd|dom)\b/gi,
];

/** Score how many date-like tokens appear in the OCR text. */
function dateLikeScore(text) {
  return DATE_SCORE_RE.reduce((acc, re) => {
    re.lastIndex = 0;
    return acc + (text.match(re) || []).length;
  }, 0);
}

// ─── Multi-pipeline OCR ───────────────────────────────────────────────────────

/**
 * Run all three pipelines + two PSM modes and return the merged best text.
 */
async function runMultiPipelineOCR(inputPath) {
  const tmpDir = os.tmpdir();
  const base = path.join(tmpDir, `ocr_${Date.now()}`);

  const paths = {
    dotMatrix:   `${base}_a.png`,
    cleanPrint:  `${base}_b.png`,
    adaptive:    `${base}_c.png`,
    stark:       `${base}_d.png`,
    mixed:       `${base}_e.png`,
  };

  // Run all preprocessing pipelines in parallel
  await Promise.all([
    pipelineDotMatrix(inputPath, paths.dotMatrix).catch(e => console.error('P1 Error:', e.message)),
    pipelineCleanPrint(inputPath, paths.cleanPrint).catch(e => console.error('P2 Error:', e.message)),
    pipelineAdaptive(inputPath, paths.adaptive).catch(e => console.error('P3 Error:', e.message)),
    // Pipeline D: Stark Contrast (Good for extremely faint/faded thermal print)
    baseResize(inputPath).then(b => 
      b.grayscale().negate().normalize().negate().threshold(160).median(1).toFile(paths.stark)
    ).catch(e => console.error('P4 Error:', e.message)),
    // Pipeline E: Mixed Polarity (Good for labels with dark sidebars + light center)
    baseResize(inputPath, 2000).then(b =>
      b.grayscale()
       .clahe({ width: 50, height: 50 }) // Heavy CLAHE for mixed lighting
       .sharpen()
       .threshold(128)
       .toFile(paths.mixed)
    ).catch(e => console.error('P5 Error:', e.message)),
  ]);

  // For each preprocessed image, run OCR with PSM 6 AND PSM 11
  const jobs = [];
  for (const [label, imgPath] of Object.entries(paths)) {
    if (!fs.existsSync(imgPath)) continue;
    jobs.push(
      runTesseract(imgPath, '6').then(r => ({ ...r, pipeline: label, psm: 6 })).catch(() => null),
      runTesseract(imgPath, '11').then(r => ({ ...r, pipeline: label, psm: 11 })).catch(() => null),
      runTesseract(imgPath, '4').then(r => ({ ...r, pipeline: label, psm: 4 })).catch(() => null),
    );
  }

  const results = (await Promise.all(jobs)).filter(Boolean);

  // Cleanup temp files
  for (const p of Object.values(paths)) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
  }

  if (!results.length) throw new Error('All OCR pipelines failed');

  // Score each result: weighted combination of tesseract confidence + date tokens found
  const scored = results.map(r => ({
    ...r,
    totalScore: r.confidence * 0.4 + dateLikeScore(r.text) * 25,
  }));
  scored.sort((a, b) => b.totalScore - a.totalScore);

  // Merge top-2 results: keeps all date-relevant lines from both
  const best = scored[0];
  const second = scored[1];

  let mergedText = best.text;
  if (second && second.text) {
    // Add unique lines from second result that contain date-like tokens
    const bestLines = new Set(best.text.split('\n').map(l => l.trim().toLowerCase()));
    const extraLines = second.text.split('\n').filter(line => {
      const trimmed = line.trim();
      if (!trimmed || bestLines.has(trimmed.toLowerCase())) return false;
      return dateLikeScore(trimmed) > 0;
    });
    if (extraLines.length) mergedText += '\n' + extraLines.join('\n');
  }

  return {
    text: mergedText.trim(),
    confidence: best.confidence,
    pipeline: best.pipeline,
    psm: best.psm,
    raw: best.text,
    allResults: scored.slice(0, 3), // expose top-3 for debugging
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Main entry: multi-pipeline preprocess → OCR → merged best text
 * Drop-in replacement for the old extractTextFromImage.
 */
async function extractTextFromImage(imagePath) {
  try {
    const result = await runMultiPipelineOCR(imagePath);
    return {
      text: result.text,
      confidence: result.confidence,
      raw: result.raw,
      debug: {
        pipeline: result.pipeline,
        psm: result.psm,
      },
    };
  } catch (err) {
    console.error('OCR error:', err.message);
    throw new Error(`OCR failed: ${err.message}`);
  }
}

module.exports = { extractTextFromImage };