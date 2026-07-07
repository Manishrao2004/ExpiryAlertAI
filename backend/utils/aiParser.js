/**
 * aiParser.js — Edge AI + Cloud Vision Date Extraction Pipeline
 *
 * Architecture Overview:
 *  1. STAGE 1: Edge OCR (Local Tesseract) runs 5 distinct image processing pipelines
 *              (Dot-Matrix, Clean Print, Stark Contrast, Mixed Polarity).
 *  2. STAGE 2: Edge AI (Gemini Flash via OpenRouter) parses the combined text from all 5 pipelines.
 *              It uses a "Majority Consensus" algorithm to resolve distortions (e.g. if one
 *              pipeline distorts a 9 into a 5, the AI ignores the 5 and picks the 9).
 *  3. STAGE 3: Cloud Vision Fallback. If the Edge AI detects an unresolvable conflict, or
 *              outputs a confidence < 75%, the image is routed to the Cloud Vision API
 *              (Google Gemini Vision) for a final, guaranteed visual parse.
 *
 * Environment variables:
 *   OPENROUTER_API_KEY / LLM_API_KEY   — for OpenRouter / OpenAI-compatible APIs
 *   LLM_BASE_URL                       — override base URL (default: OpenRouter)
 *   LLM_MODEL                          — model slug (default: google/gemini-2.5-flash)
 */

const axios = require('axios');

// 

function buildPrompt(rawText) {
  return `
You are an expert at reading Indian product labels. Extract the manufacturing date (MFD) and expiry date (EXP) from the OCR text below.

## Indian Label Conventions
- Date formats used: DD/MM/YYYY, DD/MMM/YYYY, DD.MM.YY, MM/YYYY, MMM/YYYY
- MFD keywords: MFD, MFG, MFG. DATE, MFG DATE, MANUFACTURED, DOM, PKD, PACKED
- EXP keywords: EXP, EXPIRY, EXPIRY DATE, EXP DATE, BEST BEFORE, USE BY, USE BEFORE
- When two dates appear with NO keyword labels, the EARLIER date is MFD and the LATER date is EXP
- When only ONE date appears with no keyword, it is most likely the EXPIRY date
- Month abbreviations: JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC

## Things that are NOT dates — ignore these completely
- Prices: "Rs.57.00", "₹1429.00", "USP Rs.4.47/g", "Rs.50.00(0.13 PER G)"
- Times: "07:18", "14:30"
- Batch codes: alphanumeric strings like "WWCMCCB0009", "HAFC07", "AA010104", "52970513"
- Long numeric codes (5+ digits) are batch numbers, not dates

## OCR Noise to Fix & Stacked Pipelines
- The OCR text comes from 5 different image processing pipelines stacked together. This means you will see the same text repeated 3 to 5 times.
- OCR distortions are SYSTEMATIC: the same digit error (e.g. 9 read as 5, or 9 read as 0) can repeat across MULTIPLE pipelines, creating a false majority. Do NOT blindly trust the most frequent reading.
- Common OCR misreads: O or Q → 0, I or l → 1, S → 5, Z → 2, B → 8, 9 → 5, 9 → 0.

## Confidence Scoring (CRITICAL)
- 0.9: ALL repetitions across ALL pipelines show the EXACT SAME digits for a date. Zero disagreement.
- 0.6: ANY repetition shows a DIFFERENT digit for the same date position (e.g. 05.02.27 vs 09.02.27 vs 00.02.27). Even if one reading appears more often, you CANNOT be sure which is correct. Use 0.6 so the system falls back to Cloud Vision.
- 0.4: The text is heavily garbled and you are guessing.

## OCR Text from Label
"""
${rawText}
"""

Return ONLY raw JSON (no markdown, no backticks):
{
  "mfd": "YYYY-MM-DD" or null,
  "exp": "YYYY-MM-DD" or null,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation"
}
  `.trim();
}

// 

const PRICE_LIKE_RE = /^\d{1,4}\.\d{2}$/; // 57.00, 1429.00

function isValidDate(str) {
  if (!str || str === 'null') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (y < 2000 || y > 2100) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // Check it's not a disguised price (e.g. "2057-00-00")
  if (m === 0 || d === 0) return false;
  return true;
}

function sanitiseResult(raw) {
  return {
    mfd: isValidDate(raw?.mfd) ? raw.mfd : null,
    exp: isValidDate(raw?.exp) ? raw.exp : null,
    confidence: typeof raw?.confidence === 'number'
      ? Math.min(1, Math.max(0, raw.confidence))
      : 0.5,
    reasoning: raw?.reasoning || '',
  };
}

// 

async function callOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const url   = process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions';
  const model = process.env.LLM_MODEL    || 'qwen/qwen-2.5-72b-instruct';

  const response = await axios.post(url, {
    model,
    max_tokens: 500, // Explicitly limit tokens to avoid 402 Insufficient Credit errors
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    response_format: { type: 'json_object' },
  }, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'ExpiryAlert AI',
    },
    timeout: 30000,
  });

  if (!response.data || !response.data.choices || !response.data.choices.length) {
    throw new Error(`OpenRouter returned unexpected format: ${JSON.stringify(response.data)}`);
  }

  const content = response.data.choices[0].message.content.trim();
  const match = content.match(/\{[\s\S]*?\}/);
  return JSON.parse(match ? match[0] : content);
}


// 

/**
 * When local Tesseract fails, send the image directly to a Vision LLM.
 * We hardcode gemini-1.5-flash as it's insanely fast, free on OpenRouter, and supports Vision.
 */
async function callVisionAI(base64Image) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const prompt = `
You are an expert at reading Indian product labels. Look at this image and extract the manufacturing date (MFD) and expiry date (EXP).
## Indian Label Conventions
- Date formats used: DD/MM/YYYY, DD/MMM/YYYY, DD.MM.YY, MM/YYYY, MMM/YYYY
- MFD keywords: MFD, MFG, MFG. DATE, MFG DATE, MANUFACTURED, DOM, PKD, PACKED
- EXP keywords: EXP, EXPIRY, EXPIRY DATE, EXP DATE, BEST BEFORE, USE BY, USE BEFORE
- When two dates appear with NO keyword labels, the EARLIER date is MFD and the LATER date is EXP
- When only ONE date appears with no keyword, it is most likely the EXPIRY date
## Things that are NOT dates
- Prices: "Rs.57.00", "Rs.0.30 per g", "215.00", "199.00", "175.00"
- Times: "07:18", "14:30", "20:55"
- Batch codes: alphanumeric strings like "HAFF13", "BRH-3070", "52970513"
- Dates next to "Batch No." are batch dates, NOT manufacturing or expiry dates
Return ONLY raw JSON: {"mfd":"YYYY-MM-DD"|null,"exp":"YYYY-MM-DD"|null,"confidence":0.0-1.0,"reasoning":"brief"}
  `.trim();

  // Validate VISION_MODEL looks like a real model slug (must contain '/')
  const envModel = process.env.VISION_MODEL;
  const visionModel = (envModel && envModel.includes('/')) ? envModel : 'google/gemini-2.5-flash';

  const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model: visionModel, // Must natively support images
    max_tokens: 500, // Fixes OpenRouter 402 error for users with low credit balances
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: base64Image } }
        ]
      }
    ],
    temperature: 0.1
  }, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'ExpiryAlert AI Hybrid OCR',
    },
    timeout: 30000,
  });

  if (!response.data || !response.data.choices) throw new Error('Vision AI failed');
  const content = response.data.choices[0].message.content.trim();
  const match = content.match(/\{[\s\S]*?\}/);
  return JSON.parse(match ? match[0] : content);
}

// 

/**
 * Parse MFD and EXP dates from raw OCR text using an AI model.
 *
 * Runs two passes if the first pass returns low confidence.
 *
 * @param {string} rawText  — OCR output from ocrProcessor
 * @param {string} [normalizedText] — pre-normalised text from expiryDetector (optional second pass)
 * @returns {{ mfd, exp, confidence, reasoning } | null}
 */
async function parseDateWithAI(rawText, normalizedText = null) {
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY);

  if (!hasOpenRouter) return null;

  const callAI = async (text) => {
    const prompt = buildPrompt(text);
    try {
      const raw = await callOpenRouter(prompt);
      return sanitiseResult(raw);
    } catch (err) {
      console.error('AI parse error:', err?.response?.data || err.message);
      return null;
    }
  };

  // Pass 1: raw OCR text
  const result1 = await callAI(rawText);
  if (!result1) return null;

  // Pass 2: if uncertain AND we have a normalised version, try again
  if (result1.confidence < 0.8 && normalizedText && normalizedText !== rawText) {
    const result2 = await callAI(normalizedText);
    if (result2 && result2.confidence > result1.confidence) {
      return result2;
    }
  }

  return result1;
}

// 

/**
 * Combine the AI parser output with the heuristic detectDates() output.
 * Takes the higher-confidence value per field.
 * AI wins on exp/mfd if both found; heuristic fills gaps.
 *
 * @param {object} aiResult   — from parseDateWithAI()
 * @param {object} heuristic  — from detectDates()
 * @returns {{ mfd, exp, confidence, source }}
 */
function mergeResults(aiResult, heuristic) {
  const ai = aiResult || {};
  const h  = heuristic || {};

  const exp = ai.exp || h.expStr || null;
  const mfd = ai.mfd || h.mfdStr || null;

  // Confidence: trust AI confidence when available (it actually analyzed the text content).
  // Heuristic confidence only measures keyword proximity, not date correctness.
  const confMap = { high: 0.80, medium: 0.60, low: 0.40, none: 0 };
  const hConf = confMap[h.confidence] || 0;
  const aConf = typeof ai.confidence === 'number' ? ai.confidence : 0;
  const confidence = aConf > 0 ? aConf : hConf;

  return {
    mfd,
    exp,
    confidence,
    source: ai.exp ? 'ai' : (h.expStr ? 'heuristic' : 'none'),
    reasoning: ai.reasoning || `heuristic:${h.source}`,
  };
}

module.exports = { parseDateWithAI, mergeResults, callVisionAI };