const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

function initVapid() {
  // Try multiple paths in order of preference:
  //   1. /app/vapid.json   (next to server.js — works in Docker + local)
  //   2. /tmp/vapid.json   (writable fallback on HF Spaces if /app is read-only)
  const primaryPath = path.join(__dirname, '..', 'vapid.json');
  const fallbackPath = path.join(require('os').tmpdir(), 'vapid.json');

  let vapidKeys = null;

  // ── Try reading from existing file ──────────────────────────────────────
  for (const p of [primaryPath, fallbackPath]) {
    try {
      if (fs.existsSync(p)) {
        vapidKeys = JSON.parse(fs.readFileSync(p, 'utf8'));
        console.log(`[System] Loaded VAPID keys from ${p}`);
        break;
      }
    } catch (err) {
      console.warn(`[System] Could not read VAPID keys from ${p}: ${err.message}`);
    }
  }

  // ── Generate new keys if none found ─────────────────────────────────────
  if (!vapidKeys) {
    vapidKeys = webpush.generateVAPIDKeys();
    console.log('[System] Generated new VAPID keys');

    // Try to persist — try primary path first, then fallback
    let saved = false;
    for (const p of [primaryPath, fallbackPath]) {
      try {
        fs.writeFileSync(p, JSON.stringify(vapidKeys, null, 2));
        console.log(`[System] Saved VAPID keys to ${p}`);
        saved = true;
        break;
      } catch (err) {
        console.warn(`[System] Could not save VAPID keys to ${p}: ${err.message}`);
      }
    }
    if (!saved) {
      console.warn('[System] ⚠ VAPID keys generated but could not be persisted. They will be regenerated on restart.');
    }
  }

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@expiryalert.app'}`,
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  return { webpush, vapidPublicKey: vapidKeys.publicKey };
}

module.exports = initVapid;
