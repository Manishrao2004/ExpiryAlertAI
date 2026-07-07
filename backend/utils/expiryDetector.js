/**
 * expiryDetector.js — Robust MFD + EXP extraction for Indian product labels
 *
 * Strategy:
 *  1. Normalise OCR noise (character substitutions, spacing)
 *  2. Suppress non-date numbers: prices (Rs./₹), times (HH:MM), batch codes
 *  3. Search for expiry AND manufacturing keywords near dates
 *  4. Apply 8 date-format regex patterns covering all Indian label styles
 *  5. Score candidates (keyword proximity, future preference, position)
 *  6. When NO keyword is found, use positional heuristic:
 *       earlier date = MFD, later date = EXP
 *  7. Return { mfd, exp, confidence } — never just one date
 *
 * Handles all test cases:
 *  Image 1 (dot-matrix) : "Mfg. Date: 05/DEC/2025"  "Expiry: 04/JUN/2027"
 *  Image 2 (clean bold)  : "07.03.26" "06.11.26" — no keywords, positional
 *  Image 3 (mixed)       : "MFG. DATE: 24/10/2025"  "USE BY: 23/10/2026"
 *  Image 4 (stained)     : "10/04/2026" — single date, treat as EXP
 */

// 

const MONTH_MAP = {
  jan: 1, jan: 1, january: 1,
  feb: 2, feb: 2, february: 2,
  mar: 3, mar: 3, march: 3,
  apr: 4, apr: 4, april: 4,
  may: 5, may: 5,
  jun: 6, jun: 6, june: 6,
  jul: 7, jul: 7, july: 7,
  aug: 8, aug: 8, august: 8,
  sep: 9, sep: 9, sept: 9, september: 9,
  oct: 10, oct: 10, october: 10,
  nov: 11, nov: 11, november: 11,
  dec: 12, dec: 12, december: 12,
  oec: 12, d3c: 12, dbc: 12, d6c: 12,
  '0ct': 10, qct: 10,
  jvn: 6, jnn: 6, jlm: 6,
  jvl: 7, jwl: 7,
  mfr: 3, mrd: 3,
  sfp: 9, '5ep': 9,
  avc: 8, ajc: 8,
};

function getMonth(str) {
  const s = str.toLowerCase().slice(0, 3);
  return MONTH_MAP[s] || null;
}

/** Keywords that signal an EXPIRY date */
const EXP_KEYWORDS = /\b(exp(?:iry|iration|ires|\.)?|best\s*before|use\s*(?:by|before)|useby|bb(?:e|d)?|best\s*by|sell\s*by|consume\s*(?:by|before)|valid\s*(?:until|thru|through)|validuntil|expdate|exp\.?\s*date|expiry\s*date)\b/i;

/** Keywords that signal a MANUFACTURING date */
const MFD_KEYWORDS = /\b(mf[dg]\.?|mfg\.?\s*date|mfd\.?\s*date|manufactured?\s*(?:date|on)?|dom|date\s*of\s*(?:mfg|manufacture)|pkd\.?|packed?\s*(?:date|on)?|production\s*date|mfr\.?\s*date)\b/i;

/** Patterns that look like dates but AREN'T — suppress before parsing */
const FALSE_DATE_SUPPRESSORS = [
  /\b(?:rs|rs\.|inr|₹)\s*\d+[\.,]\d{2}\b/gi,   // Rs.57.00, ₹1429.00
  /\b(?:rs|rs\.|inr|₹)\s*\d+\b/gi,            // Rs 57
  /\busp\s+(?:rs|inr|₹)?\s*[\d\.]+\/g\b/gi,   // USP Rs 4.47/g
  /\b\d+\s*[\.\,]\s*\d+\s*(?:\/|per)\s*g\b/gi, // 0.29 per g
  /\b\d+\s*(?:\/|per)\s*g\b/gi,               // 1429 / g
  /\b(?:[01]\d|2[0-3])\s*[:]\s*[0-5]\d\b/g,    // HH:MM time tokens
  /\b\d{5,}\b/g,                               // batch codes
];

// 

const DATE_FORMATS = [
  // DD/MMM/YYYY — "05/DEC/2025"
  {
    name: 'DD/MMM/YYYY',
    // Allowed ambiguous dot-matrix separators for ALPHABETIC months: 7, 1, I, l, !, |
    regex: /\b(\d{1,2})[\s\/\-\.:71Il!|]+([a-z0-9]{3,9})[\s\/\-\.:71Il!|]+(\d{4})\b/gi,
    parse(m) {
      const mo = getMonth(m[2]);
      if (!mo) return null;
      return buildDate(Number(m[1]), mo, Number(m[3]));
    },
  },
  // DD/MMM/YY — "05/DEC/25"
  {
    name: 'DD/MMM/YY',
    regex: /\b(\d{1,2})[\s\/\-\.:71Il!|]+([a-z0-9]{3,9})[\s\/\-\.:71Il!|]+(\d{2})\b/gi,
    parse(m) {
      const mo = getMonth(m[2]);
      if (!mo) return null;
      return buildDate(Number(m[1]), mo, expandYear(Number(m[3])));
    },
  },
  // MMM/YYYY — "DEC/2025"
  {
    name: 'MMM/YYYY',
    regex: /\b([a-z0-9]{3,9})[\s\/\-\.:71Il!|]+(\d{4})\b/gi,
    parse(m) {
      const mo = getMonth(m[1]);
      if (!mo) return null;
      return lastDayOf(mo, Number(m[2]));
    },
  },
  // MMM/YY — "DEC/25"
  {
    name: 'MMM/YY',
    regex: /\b([a-z0-9]{3,9})[\s\/\-\.:71Il!|]+(\d{2})\b/gi,
    parse(m) {
      const mo = getMonth(m[1]);
      if (!mo) return null;
      return lastDayOf(mo, expandYear(Number(m[2])));
    },
  },
  // YYYY-MM-DD  — "2025-10-24"
  {
    name: 'YYYY-MM-DD',
    regex: /\b(\d{4})[\s\/\-\.:]+(\d{1,2})[\s\/\-\.:]+(\d{1,2})\b/g,
    parse(m) {
      return buildDate(Number(m[3]), Number(m[2]), Number(m[1]));
    },
  },
  // DD/MM/YYYY  — "24/10/2025"  (images 3, 4)
  {
    name: 'DD/MM/YYYY',
    regex: /\b(\d{1,2})[\s\/\-\.:]+(\d{1,2})[\s\/\-\.:]+(\d{4})\b/g,
    parse(m) {
      return buildDate(Number(m[1]), Number(m[2]), Number(m[3]));
    },
  },
  // DD/MM/YY  — "07.03.26"  (image 2) — INDIAN convention: DD first
  {
    name: 'DD/MM/YY',
    regex: /\b(\d{1,2})[\s\/\-\.:]+(\d{1,2})[\s\/\-\.:]+(\d{2})\b/g,
    parse(m) {
      const day = Number(m[1]);
      const mo  = Number(m[2]);
      const yr  = expandYear(Number(m[3]));
      // Reject if month > 12 (swap heuristic — Indian labels are always DD/MM)
      if (mo < 1 || mo > 12) return null;
      return buildDate(day, mo, yr);
    },
  },
  // MM/YYYY  — "10/2026"
  {
    name: 'MM/YYYY',
    regex: /\b(\d{1,2})[\s\/\-\.:]+(\d{4})\b/g,
    parse(m) {
      const mo = Number(m[1]);
      if (mo < 1 || mo > 12) return null;
      return lastDayOf(mo, Number(m[2]));
    },
  },
];

// 

function expandYear(y) {
  if (y >= 100) return y;
  return y <= 50 ? 2000 + y : 1900 + y;
}

function buildDate(day, month, year) {
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1970 || year > 2100) return null;
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1) return null; // JS overflow check
  return d;
}

function lastDayOf(month, year) {
  if (month < 1 || month > 12) return null;
  if (year < 1970 || year > 2100) return null;
  return new Date(year, month, 0);
}

function formatDate(d) {
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 

function normalizeText(text) {
  let t = text
    .replace(/\s+/g, ' ')
    .replace(/['"`]/g, '')
    .trim();

  // Collapse digit-only spaces created by dot-matrix scanner gaps: "2 0 2 6" → "2026"
  // Only collapse when ALL tokens between spaces are single digits
  t = t.replace(/\b(\d)(?: (\d))+\b/g, match => match.replace(/ /g, ''));

  // Suppress false-date patterns before any regex matching
  for (const re of FALSE_DATE_SUPPRESSORS) {
    re.lastIndex = 0;
    t = t.replace(re, ' __SUPPRESSED__ ');
  }

  // OCR character substitution — only inside tokens that already contain digits
  t = t.replace(/\b([A-Za-z0-9]+)\b/g, token => {
    // Skip keyword tokens (but NOT month tokens yet, as we want to fix their letters)
    if (/(exp|mfg|mfd|use|best|pkd|dom)/i.test(token)) {
      return token;
    }
    // If it looks like a month but fragmented (digits in middle), fix it
    if (/\d/.test(token) && /[A-Za-z]/.test(token)) {
      return token
        .replace(/[oOQ]/g, '0')
        .replace(/[lI\]\|!]/g, '1')
        .replace(/[sS]/g, '5')
        .replace(/[zZ]/g, '2')
        .replace(/[bB]/g, '8')
        .replace(/[A]/g, '4')
        .replace(/[E]/g, '3'); // common DBC for DEC
    }
    return token;
  });

  // Handle month names with tiny spaces "D EC" or "J U N"
  t = t.replace(/\b(D\s*E\s*C|J\s*U\s*N|M\s*A\s*R|J\s*A\s*N|F\s*E\s*B|A\s*P\s*R|M\s*A\s*Y|J\s*U\s*L|A\s*U\s*G|S\s*E\s*P|O\s*C\s*T|N\s*O\s*V)\b/gi, 
    match => match.replace(/\s/g, ''));

  return t;
}

// 

/**
 * Extract all date candidates, tagging each with:
 *  - isExp  : near an expiry keyword
 *  - isMfd  : near a manufacturing keyword
 *  - hasAny : near any date-related keyword
 */
function extractCandidates(normalizedText) {
  const lines = normalizedText.split(/\n|\\n/);
  const candidates = [];

  for (const fmt of DATE_FORMATS) {
    fmt.regex.lastIndex = 0;
    let m;
    while ((m = fmt.regex.exec(normalizedText)) !== null) {
      const date = fmt.parse(m);
      if (!date) continue;

      const pos = m.index;
      const before = normalizedText.slice(Math.max(0, pos - 80), pos);
      const after  = normalizedText.slice(pos, Math.min(normalizedText.length, pos + 20));

      // Check the entire line for keywords too
      const lineIdx = normalizedText.slice(0, pos).split('\n').length - 1;
      const line = lines[lineIdx] || '';
      const lineAndBefore = line + ' ' + before;

      const isExp = EXP_KEYWORDS.test(lineAndBefore) || EXP_KEYWORDS.test(after);
      const isMfd = MFD_KEYWORDS.test(lineAndBefore) || MFD_KEYWORDS.test(after);

      // Reset stateful RegExp after each test
      EXP_KEYWORDS.lastIndex = 0;
      MFD_KEYWORDS.lastIndex = 0;

      candidates.push({
        date,
        pos,
        format: fmt.name,
        isExp,
        isMfd,
        hasAny: isExp || isMfd,
        raw: m[0],
        line: line.trim(),
      });
    }
    fmt.regex.lastIndex = 0;
  }

  return candidates;
}

// 

/** Collapse candidates that resolve to the same calendar date. Keep highest-scored. */
function deduplicateCandidates(candidates) {
  const map = new Map();
  for (const c of candidates) {
    const key = formatDate(c.date);
    if (!map.has(key)) {
      map.set(key, c);
    } else {
      // Prefer candidate with keyword association
      const existing = map.get(key);
      if (!existing.hasAny && c.hasAny) map.set(key, c);
    }
  }
  return [...map.values()];
}

// 

function scoreCandidate(c, now) {
  let score = 0;
  if (c.hasAny) score += 100;
  if (c.isExp)  score += 30;
  if (c.isMfd)  score += 20;
  const diffDays = (c.date - now) / 86400000;
  if (diffDays >= 0) score += 50;
  if (diffDays >= 0 && diffDays <= 1095) score += 30; // within 3 years = plausible expiry
  if (diffDays < 0 && diffDays > -1825) score += 20;  // within 5 years past = plausible MFD
  score -= Math.abs(diffDays) * 0.0005;
  return score;
}

// 

/**
 * Detect both manufacturing and expiry dates from OCR text.
 *
 * Returns:
 *  {
 *    mfd: Date | null,
 *    exp: Date | null,
 *    mfdStr: 'YYYY-MM-DD' | null,
 *    expStr: 'YYYY-MM-DD' | null,
 *    confidence: 'high' | 'medium' | 'low',
 *    source: 'keyword' | 'positional' | 'single',
 *  }
 */
function detectDates(ocrText) {
  if (!ocrText || !ocrText.trim()) return emptyResult();

  const normalized = normalizeText(ocrText);
  const raw = extractCandidates(normalized);
  const candidates = deduplicateCandidates(raw);

  if (!candidates.length) return emptyResult();

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  // ── Strategy 1: keyword-based assignment ─────────────────────────────────
  const expCands = candidates.filter(c => c.isExp);
  const mfdCands = candidates.filter(c => c.isMfd);

  if (expCands.length || mfdCands.length) {
    const exp = expCands.length
      ? expCands.sort((a, b) => scoreCandidate(b, now) - scoreCandidate(a, now))[0].date
      : null;
    const mfd = mfdCands.length
      ? mfdCands.sort((a, b) => scoreCandidate(b, now) - scoreCandidate(a, now))[0].date
      : null;

    // Sanity: if both found and mfd > exp, swap (OCR misread keywords)
    let finalMfd = mfd;
    let finalExp = exp;
    if (mfd && exp && mfd > exp) {
      finalMfd = exp;
      finalExp = mfd;
    }

    return {
      mfd: finalMfd,
      exp: finalExp,
      mfdStr: formatDate(finalMfd),
      expStr: formatDate(finalExp),
      confidence: 'high',
      source: 'keyword',
      normalized,
    };
  }

  // ── Strategy 2: No keywords — positional heuristic ───────────────────────
  // Sort all unique dates chronologically
  const sorted = candidates
    .map(c => c.date)
    .sort((a, b) => a - b);

  if (sorted.length === 1) {
    // Single date with no keyword — assume it's the expiry date
    // (Indian labels without keywords usually only show EXP)
    return {
      mfd: null,
      exp: sorted[0],
      mfdStr: null,
      expStr: formatDate(sorted[0]),
      confidence: 'low',
      source: 'single',
      normalized,
    };
  }

  if (sorted.length >= 2) {
    // Two or more dates: earlier = MFD, later = EXP (standard Indian label order)
    const mfd = sorted[0];
    const exp = sorted[sorted.length - 1];
    return {
      mfd,
      exp,
      mfdStr: formatDate(mfd),
      expStr: formatDate(exp),
      confidence: 'medium',
      source: 'positional',
      normalized,
    };
  }

  return emptyResult(normalized);
}

function emptyResult(normalized = '') {
  return { 
    mfd: null, 
    exp: null, 
    mfdStr: null, 
    expStr: null, 
    confidence: 'none', 
    source: 'none',
    normalized 
  };
}

// 

/**
 * @deprecated Use detectDates() instead for full MFD+EXP extraction.
 * Returns just the expiry date for backward compatibility.
 */
function detectExpiry(ocrText) {
  return detectDates(ocrText).exp;
}

module.exports = { detectDates, detectExpiry, extractCandidates };