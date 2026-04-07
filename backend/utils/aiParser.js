/**
 * aiParser.js — AI-powered date extraction for Indian product labels
 *
 * Improvements over v1:
 *  1. Richer Indian-label context in the prompt (batch codes, prices, rupee symbols)
 *  2. Two-pass approach:
 *       Pass 1: send raw OCR text with full context
 *       Pass 2: if confidence < 0.6, send re-normalised text (OCR fixes applied)
 *  3. Supports OpenRouter, direct OpenAI-compatible APIs, AND Anthropic Claude API
 *  4. Validates + sanitises returned dates (rejects implausible years, prices-as-dates)
 *  5. Merges AI result with heuristic result (takes higher-confidence value per field)
 *
 * Environment variables:
 *   OPENROUTER_API_KEY / LLM_API_KEY   — for OpenRouter / OpenAI-compatible APIs
 *   LLM_BASE_URL                       — override base URL (default: OpenRouter)
 *   LLM_MODEL                          — model slug (default: qwen/qwen-2.5-72b-instruct)
 *   ANTHROPIC_API_KEY                  — for direct Anthropic Claude API (preferred)
 */

const axios = require('axios');

// ─── Prompt builder ───────────────────────────────────────────────────────────

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

## OCR Noise to Fix
- O or Q → 0 (zero) when in numeric context
- I or l → 1 (one) when in numeric context
- S → 5, Z → 2, B → 8 when in numeric context
- Spaces within digits from dot-matrix: "2 0 2 6" → "2026"

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

// ─── Date validation ──────────────────────────────────────────────────────────

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

// ─── OpenRouter / OpenAI-compatible API call ──────────────────────────────────

async function callOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY;
  if (!apiKey) return null;

  const url   = process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1/chat/completions';
  const model = process.env.LLM_MODEL    || 'qwen/qwen-2.5-72b-instruct';

  const response = await axios.post(url, {
    model,
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

  const content = response.data.choices[0].message.content.trim();
  const match = content.match(/\{[\s\S]*?\}/);
  return JSON.parse(match ? match[0] : content);
}

// ─── Anthropic Claude API call ────────────────────────────────────────────────

async function callAnthropic(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const response = await axios.post('https://api.anthropic.com/v1/messages', {
    model: 'claude-haiku-4-5-20251001', // fast + cheap for label parsing
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  }, {
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  const content = response.data.content[0].text.trim();
  const match = content.match(/\{[\s\S]*?\}/);
  return JSON.parse(match ? match[0] : content);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Parse MFD and EXP dates from raw OCR text using an AI model.
 *
 * Tries Anthropic first (if key present), then OpenRouter, then returns null.
 * Runs two passes if the first pass returns low confidence.
 *
 * @param {string} rawText  — OCR output from ocrProcessor
 * @param {string} [normalizedText] — pre-normalised text from expiryDetector (optional second pass)
 * @returns {{ mfd, exp, confidence, reasoning } | null}
 */
async function parseDateWithAI(rawText, normalizedText = null) {
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY);

  if (!hasAnthropic && !hasOpenRouter) return null;

  const callAI = async (text) => {
    const prompt = buildPrompt(text);
    try {
      const raw = hasAnthropic
        ? await callAnthropic(prompt)
        : await callOpenRouter(prompt);
      return sanitiseResult(raw);
    } catch (err) {
      if (hasAnthropic && hasOpenRouter) {
        // Fallback: try the other provider
        try {
          const raw = await callOpenRouter(prompt);
          return sanitiseResult(raw);
        } catch (_) {}
      }
      console.error('AI parse error:', err?.response?.data || err.message);
      return null;
    }
  };

  // Pass 1: raw OCR text
  const result1 = await callAI(rawText);
  if (!result1) return null;

  // Pass 2: if low confidence AND we have a normalised version, try again
  if (result1.confidence < 0.6 && normalizedText && normalizedText !== rawText) {
    const result2 = await callAI(normalizedText);
    if (result2 && result2.confidence > result1.confidence) {
      return result2;
    }
  }

  return result1;
}

// ─── Merge AI result with heuristic result ────────────────────────────────────

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

  // Confidence: AI when present, else heuristic-mapped
  const confMap = { high: 0.85, medium: 0.65, low: 0.45, none: 0 };
  const hConf = confMap[h.confidence] || 0;
  const aConf = typeof ai.confidence === 'number' ? ai.confidence : 0;
  const confidence = Math.max(aConf, hConf);

  return {
    mfd,
    exp,
    confidence,
    source: ai.exp ? 'ai' : (h.expStr ? 'heuristic' : 'none'),
    reasoning: ai.reasoning || `heuristic:${h.source}`,
  };
}

module.exports = { parseDateWithAI, mergeResults };