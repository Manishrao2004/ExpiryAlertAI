/**
 * Run this once: node scripts/generateIcons.js
 * Generates PWA icons in frontend/public/
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const outputDir = path.join(__dirname, '../../frontend/public');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

function appIconSVG(size) {
  const r = size * 0.18;
  const fontSize = size * 0.38;
  const textY = size * 0.63;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#bg)"/>
  <circle cx="${size * 0.5}" cy="${size * 0.42}" r="${size * 0.22}" fill="none" stroke="white" stroke-width="${size * 0.04}"/>
  <line x1="${size * 0.5}" y1="${size * 0.20}" x2="${size * 0.5}" y2="${size * 0.25}" stroke="white" stroke-width="${size * 0.04}" stroke-linecap="round"/>
  <line x1="${size * 0.5}" y1="${size * 0.59}" x2="${size * 0.5}" y2="${size * 0.64}" stroke="white" stroke-width="${size * 0.04}" stroke-linecap="round"/>
  <line x1="${size * 0.28}" y1="${size * 0.42}" x2="${size * 0.33}" y2="${size * 0.42}" stroke="white" stroke-width="${size * 0.04}" stroke-linecap="round"/>
  <line x1="${size * 0.67}" y1="${size * 0.42}" x2="${size * 0.72}" y2="${size * 0.42}" stroke="white" stroke-width="${size * 0.04}" stroke-linecap="round"/>
  <line x1="${size * 0.5}" y1="${size * 0.42}" x2="${size * 0.62}" y2="${size * 0.35}" stroke="white" stroke-width="${size * 0.035}" stroke-linecap="round"/>
  <line x1="${size * 0.5}" y1="${size * 0.42}" x2="${size * 0.5}" y2="${size * 0.30}" stroke="white" stroke-width="${size * 0.03}" stroke-linecap="round"/>
  <text x="${size * 0.5}" y="${size * 0.88}" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${size * 0.13}" text-anchor="middle" fill="white" letter-spacing="1">EXPIRY</text>
</svg>`;
}

function badgeSVG() {
  return `<svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
  <circle cx="48" cy="48" r="48" fill="#ef4444"/>
  <rect x="44" y="24" width="8" height="32" rx="4" fill="white"/>
  <circle cx="48" cy="68" r="5" fill="white"/>
</svg>`;
}

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function run() {
  console.log('Generating PWA icons...');

  for (const size of sizes) {
    const svg = Buffer.from(appIconSVG(size));
    await sharp(svg)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, `icon-${size}.png`));
    console.log(`  ✓ icon-${size}.png`);
  }

  // Badge
  await sharp(Buffer.from(badgeSVG()))
    .resize(96, 96)
    .png()
    .toFile(path.join(outputDir, 'badge-96.png'));
  console.log('  ✓ badge-96.png');

  // Apple touch icon (180x180)
  await sharp(Buffer.from(appIconSVG(180)))
    .resize(180, 180)
    .png()
    .toFile(path.join(outputDir, 'apple-touch-icon.png'));
  console.log('  ✓ apple-touch-icon.png');

  console.log('\n✅ All icons generated successfully!');
}

run().catch(err => {
  console.error('Icon generation failed:', err.message);
  process.exit(1);
});
