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

// 

/**
 * Scale to a consistent width for OCR (300 DPI equivalent).
 * Returns a sharp instance ready for further pipeline steps.
 */
async function baseResize(inputPath, targetWidth = 1200) {
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
 * Pipeline A — Dot-matrix / ink-dot fonts (IMPROVED)
 * Simulates morphological DILATION to bridge gaps between dots.
 * 1. Negate (text becomes white)
 * 2. Blur (spreads the white dots)
 * 3. Aggressive threshold (solidifies the spread dots into continuous lines)
 * 4. Negate back
 */
async function pipelineDotMatrix(inputPath, outPath) {
  const base = await baseResize(inputPath);
  await base
    .grayscale()
    .clahe({ width: 30, height: 30 })
    .normalize()
    .negate()         // Text becomes white
    .blur(1.5)        // Spread white pixels
    .threshold(40)    // Solidify the spread (Dilation)
    .median(2)        // Clean up noise
    .negate()         // Back to black text
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
  const base = await baseResize(inputPath); // Strict dimension consistency
  await base
    .grayscale()
    .normalize()
    .blur(2.0)
    .threshold(110)
    .median(5)
    .png({ quality: 100 })
    .toFile(outPath);
}

// 

const CHAR_WHITELIST =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-.() :,';

/**
 * Run Tesseract with a specific Page Segmentation Mode.
 * PSM 6 = uniform block of text (default)
 * PSM 11 = sparse text — finds text scattered across the image (great for labels)
 * PSM 4 = single column of text
 */
async function runTesseract(imagePath, psm = '6') {
  const worker = await createWorker('eng', 1, {
    logger: () => {},
    cachePath: os.tmpdir(),
  });
  await worker.setParameters({
    tessedit_char_whitelist: CHAR_WHITELIST,
    tessedit_pageseg_mode: psm,
  });
  const { data: { text, confidence } } = await worker.recognize(imagePath);
  await worker.terminate();
  return { text: text.trim(), confidence: Math.round(confidence) };
}

// 

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

// 

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

  const isRender = process.env.RENDER === 'true';

  if (isRender) {
    // Render has 0.1 vCPUs, so run sequentially to avoid 30s timeouts
    try { await pipelineDotMatrix(inputPath, paths.dotMatrix); } catch (e) {}
    try { await pipelineCleanPrint(inputPath, paths.cleanPrint); } catch (e) {}
    try { await pipelineAdaptive(inputPath, paths.adaptive); } catch (e) {}
    try {
      const b1 = await baseResize(inputPath);
      await b1.grayscale().negate().normalize().negate().threshold(160).median(1).toFile(paths.stark);
    } catch (e) {}
    try {
      const b2 = await baseResize(inputPath);
      await b2.grayscale().normalize().sharpen().threshold(128).toFile(paths.mixed);
    } catch (e) {}
  } else {
    // Run ALL 5 preprocessing pipelines in parallel (Restoring maximum accuracy and speed for Hugging Face)
    await Promise.all([
      pipelineDotMatrix(inputPath, paths.dotMatrix).catch(e => console.error('P1 Error:', e.message)),
      pipelineCleanPrint(inputPath, paths.cleanPrint).catch(e => console.error('P2 Error:', e.message)),
      pipelineAdaptive(inputPath, paths.adaptive).catch(e => console.error('P3 Error:', e.message)),
      // Pipeline D: Stark Contrast
      baseResize(inputPath).then(b => 
        b.grayscale().negate().normalize().negate().threshold(160).median(1).toFile(paths.stark)
      ).catch(e => console.error('P4 Error:', e.message)),
      // Pipeline E: Mixed Polarity
      baseResize(inputPath).then(b =>
        b.grayscale()
         .normalize()
         .sharpen()
         .threshold(128)
         .toFile(paths.mixed)
      ).catch(e => console.error('P5 Error:', e.message)),
    ]);
  }

  // 
  // Instead of spawning 15 concurrent Tesseract workers (which choked the CPU for 16s),
  // we stitch the 5 processed images into ONE giant vertical image.
  // Tesseract reads this single stacked image top-to-bottom.
  // This gives us the text from ALL 5 pipelines, but only requires 3 Tesseract jobs!
  
  const validPaths = Object.values(paths).filter(p => fs.existsSync(p));
  const stackedPath = `${base}_stacked.png`;

  if (validPaths.length > 0) {
    const meta = await sharp(validPaths[0]).metadata();
    const width = meta.width;
    const height = meta.height;
    const gap = 50; // Add 50px white gap between images so Tesseract doesn't bleed lines
    const totalHeight = (height * validPaths.length) + (gap * (validPaths.length - 1));
    
    const composites = validPaths.map((p, i) => ({
      input: p,
      top: i * (height + gap),
      left: 0
    }));

    await sharp({
      create: { width, height: totalHeight, channels: 3, background: {r:255,g:255,b:255} }
    })
    .composite(composites)
    .withMetadata({ density: 300 }) // Prevents Tesseract "Invalid resolution 25 dpi" warning
    .png()
    .toFile(stackedPath);
  }

  // Run Tesseract with PSM 11, 6, and 4
  const results = [];
  if (fs.existsSync(stackedPath)) {
    if (isRender) {
      try { const r11 = await runTesseract(stackedPath, '11'); if (r11) results.push({ ...r11, pipeline: 'stacked', psm: 11 }); } catch (_) {}
      try { const r6 = await runTesseract(stackedPath, '6'); if (r6) results.push({ ...r6, pipeline: 'stacked', psm: 6 }); } catch (_) {}
      try { const r4 = await runTesseract(stackedPath, '4'); if (r4) results.push({ ...r4, pipeline: 'stacked', psm: 4 }); } catch (_) {}
    } else {
      const jobs = [];
      jobs.push(
        runTesseract(stackedPath, '11').then(r => ({ ...r, pipeline: 'stacked', psm: 11 })).catch(() => null),
        runTesseract(stackedPath, '6').then(r => ({ ...r, pipeline: 'stacked', psm: 6 })).catch(() => null),
        runTesseract(stackedPath, '4').then(r => ({ ...r, pipeline: 'stacked', psm: 4 })).catch(() => null)
      );
      const res = (await Promise.all(jobs)).filter(Boolean);
      results.push(...res);
    }
  }

  // Cleanup temp files
  for (const p of Object.values(paths)) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
  }
  try { if (fs.existsSync(stackedPath)) fs.unlinkSync(stackedPath); } catch (_) {}

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

// 

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