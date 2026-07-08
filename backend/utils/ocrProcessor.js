/**
 * ocrProcessor.js — Multi-pipeline OCR for Indian product labels
 *
 * Strategy:
 *  1. Run THREE preprocessing pipelines in parallel (plus 2 stark/mixed)
 *  2. Stitch all 5 images into a single stacked image.
 *  3. Run Tesseract on the stacked image with 3 different PSM modes.
 *  4. Use a PERSISTENT worker pool for the 3 PSMs to eliminate initialization latency.
 */

const sharp = require('sharp');
const { createWorker } = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 

const CHAR_WHITELIST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-.() :,';

// Persistent workers for speed
const workers = {
  '6': null
};
let workersInitialized = false;

async function initWorkers() {
  if (workersInitialized) return;
  console.log('[OCR] Initializing persistent Tesseract worker (PSM 6)...');
  const worker = await createWorker('eng', 1, { logger: () => {} });
  await worker.setParameters({
    tessedit_char_whitelist: CHAR_WHITELIST,
    tessedit_pageseg_mode: '6',
  });
  workers['6'] = worker;
  workersInitialized = true;
  console.log('[OCR] Workers initialized.');
}

/**
 * Scale to a consistent width for OCR.
 */
async function baseResize(inputPath, targetWidth = 600) {
  const meta = await sharp(inputPath).metadata();
  const w = meta.width || targetWidth;
  
  // Force downscale large images to targetWidth to drastically speed up OCR.
  // If the image is smaller, we scale it up to targetWidth for better OCR readability.
  const scale = targetWidth / w;
  const newW = Math.round(w * scale);

  return sharp(inputPath)
    .resize(newW, null, { 
      withoutEnlargement: false, 
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: true 
    });
}

/** Pipelines */
async function pipelineDotMatrix(buffer, outPath) {
  await sharp(buffer).grayscale().clahe({ width: 30, height: 30 }).normalize()
    .negate().blur(1.5).threshold(40).median(2).negate()
    .png({ quality: 100 }).toFile(outPath);
}

async function pipelineCleanPrint(buffer, outPath) {
  await sharp(buffer).grayscale().normalize().sharpen({ sigma: 1.5, m1: 1.5, m2: 0.7 })
    .threshold(140).png({ quality: 100 }).toFile(outPath);
}

async function pipelineAdaptive(buffer, outPath) {
  await sharp(buffer).grayscale().normalize().blur(2.0).threshold(110).median(5)
    .png({ quality: 100 }).toFile(outPath);
}

/**
 * Run Tesseract using persistent workers
 */
async function runTesseract(imagePath, psm = '6') {
  if (!workersInitialized) await initWorkers();
  const { data: { text, confidence } } = await workers[psm].recognize(imagePath);
  return { text: text.trim(), confidence: Math.round(confidence) };
}

// 

const DATE_SCORE_RE = [
  /\b\d{1,2}[\s\/\-\.]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\/\-\.]+\d{2,4}\b/gi,
  /\b\d{1,2}[\s\/\-\.]+\d{1,2}[\s\/\-\.]+\d{2,4}\b/g,
  /\b(?:exp|mfg|use\s*by|best\s*before|mfd|pkd|dom)\b/gi,
];

function dateLikeScore(text) {
  return DATE_SCORE_RE.reduce((acc, re) => {
    re.lastIndex = 0;
    return acc + (text.match(re) || []).length;
  }, 0);
}

// 

async function runMultiPipelineOCR(inputPath) {
  const tmpDir = os.tmpdir();
  const base = path.join(tmpDir, `ocr_${Date.now()}_${Math.floor(Math.random() * 10000)}`);

  const paths = {
    dotMatrix:   `${base}_a.png`,
    cleanPrint:  `${base}_b.png`,
    adaptive:    `${base}_c.png`,
    stark:       `${base}_d.png`,
    mixed:       `${base}_e.png`,
  };

  // Decode and resize the original image exactly once
  const baseBuffer = await (await baseResize(inputPath)).toBuffer();

  // Run ALL 5 preprocessing pipelines in parallel using the pre-shrunk buffer
  await Promise.all([
    pipelineDotMatrix(baseBuffer, paths.dotMatrix).catch(e => console.error('P1 Error:', e.message)),
    pipelineCleanPrint(baseBuffer, paths.cleanPrint).catch(e => console.error('P2 Error:', e.message)),
    pipelineAdaptive(baseBuffer, paths.adaptive).catch(e => console.error('P3 Error:', e.message)),
    sharp(baseBuffer).grayscale().negate().normalize().negate().threshold(160).median(1).toFile(paths.stark).catch(e => console.error('P4 Error:', e.message)),
    sharp(baseBuffer).grayscale().normalize().sharpen().threshold(128).toFile(paths.mixed).catch(e => console.error('P5 Error:', e.message)),
  ]);
  
  const validPaths = Object.values(paths).filter(p => fs.existsSync(p));
  const stackedPath = `${base}_stacked.png`;

  if (validPaths.length > 0) {
    const meta = await sharp(validPaths[0]).metadata();
    const width = meta.width;
    const height = meta.height;
    const gap = 50; 
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
    .withMetadata({ density: 300 })
    .png()
    .toFile(stackedPath);
  }

  // Run Tesseract with PSM 6
  const jobs = [];
  if (fs.existsSync(stackedPath)) {
    jobs.push(
      runTesseract(stackedPath, '6').then(r => ({ ...r, pipeline: 'stacked', psm: 6 })).catch(() => null)
    );
  }

  const results = (await Promise.all(jobs)).filter(Boolean);

  // Cleanup temp files
  for (const p of Object.values(paths)) {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
  }
  try { if (fs.existsSync(stackedPath)) fs.unlinkSync(stackedPath); } catch (_) {}

  if (!results.length) throw new Error('All OCR pipelines failed');

  const scored = results.map(r => ({
    ...r,
    totalScore: r.confidence * 0.4 + dateLikeScore(r.text) * 25,
  }));
  scored.sort((a, b) => b.totalScore - a.totalScore);

  const best = scored[0];
  const second = scored[1];

  let mergedText = best.text;
  if (second && second.text) {
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
    allResults: scored.slice(0, 3), 
  };
}

async function extractTextFromImage(imagePath) {
  try {
    const result = await runMultiPipelineOCR(imagePath);
    return {
      text: result.text,
      confidence: result.confidence,
      raw: result.raw,
      debug: { pipeline: result.pipeline, psm: result.psm },
    };
  } catch (err) {
    console.error('OCR error:', err.message);
    throw new Error(`OCR failed: ${err.message}`);
  }
}

module.exports = { extractTextFromImage, initWorkers };