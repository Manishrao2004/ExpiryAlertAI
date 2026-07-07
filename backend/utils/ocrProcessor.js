/**
 * ocrProcessor.js — Optimized OCR for Indian product labels (Hugging Face / Local)
 *
 * Strategy:
 *  1. Use a persistent Tesseract worker pool initialized on boot (massively improves speed).
 *  2. Early-Exit Fast Path: Try Clean Print pipeline first. If valid date found, return immediately.
 *  3. Fallback Path: Run Dot-Matrix and Adaptive pipelines concurrently via scheduler if fast path fails.
 */

const sharp = require('sharp');
const { createWorker, createScheduler } = require('tesseract.js');
const path = require('path');
const fs = require('fs');
const os = require('os');

const CHAR_WHITELIST = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-.() :,';

const scheduler = createScheduler();
let workersInitialized = false;

/**
 * Initialize worker pool. Caps at 4 cores for safety, typically 2 on HuggingFace.
 */
async function initWorkers() {
  if (workersInitialized) return;
  const numWorkers = Math.min(os.cpus().length, 4) || 2;
  console.log(`[OCR] Initializing ${numWorkers} Tesseract workers for scheduler...`);
  
  for (let i = 0; i < numWorkers; i++) {
    const worker = await createWorker('eng', 1, {
      logger: () => {},
      cachePath: os.tmpdir(),
    });
    await worker.setParameters({
      tessedit_char_whitelist: CHAR_WHITELIST,
      tessedit_pageseg_mode: '11', // PSM 11 is best for sparse text on labels
    });
    scheduler.addWorker(worker);
  }
  workersInitialized = true;
  console.log('[OCR] Workers initialized and ready.');
}

// Ensure workers are initialized if called directly before server boot finishes
async function runTesseractJob(imagePath) {
  if (!workersInitialized) await initWorkers();
  const { data: { text, confidence } } = await scheduler.addJob('recognize', imagePath);
  return { text: text.trim(), confidence: Math.round(confidence) };
}

/**
 * Scale to a consistent width. Target 900px for a balance of speed and accuracy.
 */
async function baseResize(inputPath, targetWidth = 900) {
  const meta = await sharp(inputPath).metadata();
  const w = meta.width || 800;
  const h = meta.height || 600;

  const minDim = Math.min(w, h);
  let scale = w < targetWidth ? Math.min(4.0, targetWidth / w) : 1;
  if (minDim < 10) scale = Math.max(scale, 20); 
  
  const newW = Math.max(100, Math.round(w * scale));

  return sharp(inputPath)
    .resize(newW, null, { 
      withoutEnlargement: false, 
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false 
    });
}

// Fast Path Pipeline
async function pipelineCleanPrint(inputPath, outPath) {
  const base = await baseResize(inputPath);
  await base.grayscale().normalize().sharpen({ sigma: 1.5, m1: 1.5, m2: 0.7 }).threshold(140).png({ quality: 100 }).toFile(outPath);
}

// Fallback Pipeline 1
async function pipelineDotMatrix(inputPath, outPath) {
  const base = await baseResize(inputPath);
  await base.grayscale().clahe({ width: 30, height: 30 }).normalize().negate().blur(1.5).threshold(40).median(2).negate().png({ quality: 100 }).toFile(outPath);
}

// Fallback Pipeline 2
async function pipelineAdaptive(inputPath, outPath) {
  const base = await baseResize(inputPath);
  await base.grayscale().normalize().blur(2.0).threshold(110).median(5).png({ quality: 100 }).toFile(outPath);
}

const DATE_SCORE_RE = [
  // Matches dd/mmm/yyyy, including common typos like 0 for O, 1 for l
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

/**
 * Runs Fast Path, early exits if good, otherwise runs Fallbacks concurrently.
 */
async function runMultiPipelineOCR(inputPath) {
  const tmpDir = os.tmpdir();
  const baseId = `ocr_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  
  const pClean = path.join(tmpDir, `${baseId}_clean.png`);
  
  // ==========================================
  // 1. FAST PATH (Early Exit)
  // ==========================================
  await pipelineCleanPrint(inputPath, pClean);
  let result = null;
  
  try {
    const rClean = await runTesseractJob(pClean);
    const score = dateLikeScore(rClean.text);
    
    // EARLY EXIT: Found a date-like text with decent confidence!
    if (score > 0 && rClean.confidence > 50) {
      try { fs.unlinkSync(pClean); } catch (e) {}
      return {
        text: rClean.text,
        confidence: rClean.confidence,
        pipeline: 'fast-path-clean',
        raw: rClean.text,
      };
    }
    result = { ...rClean, pipeline: 'clean', score: rClean.confidence * 0.4 + score * 25 };
  } catch (e) {
    console.error('Fast path OCR failed:', e.message);
  }
  
  // ==========================================
  // 2. FALLBACK PATH (Dot Matrix + Adaptive)
  // ==========================================
  const pDot = path.join(tmpDir, `${baseId}_dot.png`);
  const pAdapt = path.join(tmpDir, `${baseId}_adapt.png`);
  
  await Promise.all([
    pipelineDotMatrix(inputPath, pDot).catch(() => {}),
    pipelineAdaptive(inputPath, pAdapt).catch(() => {})
  ]);
  
  const jobs = [];
  if (fs.existsSync(pDot)) jobs.push(runTesseractJob(pDot).then(r => ({ ...r, pipeline: 'dot-matrix' })).catch(() => null));
  if (fs.existsSync(pAdapt)) jobs.push(runTesseractJob(pAdapt).then(r => ({ ...r, pipeline: 'adaptive' })).catch(() => null));
  
  const fallbackResults = (await Promise.all(jobs)).filter(Boolean);
  
  // Cleanup files
  [pClean, pDot, pAdapt].forEach(p => {
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
  });

  const allResults = result ? [result, ...fallbackResults] : fallbackResults;
  
  if (!allResults.length) {
    throw new Error('All OCR pipelines failed');
  }

  // Score them
  const scored = allResults.map(r => ({
    ...r,
    totalScore: r.score !== undefined ? r.score : (r.confidence * 0.4 + dateLikeScore(r.text) * 25)
  })).sort((a, b) => b.totalScore - a.totalScore);

  const best = scored[0];
  const second = scored[1];

  // Merge top 2 results to catch disparate lines
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
    raw: best.text,
    allResults: scored.slice(0, 3),
  };
}

/**
 * Main entry point
 */
async function extractTextFromImage(imagePath) {
  try {
    const result = await runMultiPipelineOCR(imagePath);
    return {
      text: result.text,
      confidence: result.confidence,
      raw: result.raw,
      debug: { pipeline: result.pipeline },
    };
  } catch (err) {
    console.error('OCR error:', err.message);
    throw new Error(`OCR failed: ${err.message}`);
  }
}

module.exports = { extractTextFromImage, initWorkers };