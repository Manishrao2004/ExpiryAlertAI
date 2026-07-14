require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

// 
const connectDB = require('./config/db');
const corsMiddleware = require('./config/cors');
const initVapid = require('./config/vapid');
const { apiLimiter } = require('./middleware/rateLimiter');
const { initCronJobs, checkAndNotify } = require('./jobs/cronJobs');
const { initWorkers } = require('./utils/ocrProcessor');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// 
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// 
app.options('*', corsMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use('/api/', apiLimiter);

// ── Health / root routes (always available, even before DB connects) ──────
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.get('/', (req, res) => res.send('ExpiryAlert AI Backend is running!'));

// ── App routes ────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/notifications', require('./routes/notifications'));

app.post('/api/admin/check-notify', async (req, res) => {
  await checkAndNotify();
  res.json({ message: 'Notification check triggered' });
});

// ── Start listening FIRST, then init services ─────────────────────────────
// This ensures HF Spaces health-check on port 7860 passes immediately.
// DB, VAPID, and OCR workers initialise in the background.
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[System] ExpiryAlert AI backend: http://0.0.0.0:${PORT}`);
});

// ── Async service initialisation (non-blocking) ──────────────────────────
(async () => {
  // 1. VAPID keys (synchronous but can throw if FS is broken)
  try {
    const { webpush, vapidPublicKey } = initVapid();
    app.locals.webpush = webpush;
    app.locals.vapidPublicKey = vapidPublicKey;
    console.log(`[System] VAPID Public Key: ${vapidPublicKey}`);
  } catch (err) {
    console.error('[System] ⚠ VAPID init failed — push notifications disabled:', err.message);
  }

  // 2. MongoDB
  try {
    await connectDB();
  } catch (err) {
    console.error('[System] ⚠ MongoDB init error (server stays alive):', err.message);
  }

  // 3. Cron jobs (need DB, but node-cron itself is safe to start)
  try {
    initCronJobs();
  } catch (err) {
    console.error('[System] ⚠ Cron init failed:', err.message);
  }

  // 4. OCR workers (can be slow — runs in background)
  initWorkers().catch(e => console.error('[System] ⚠ OCR worker init failed:', e.message));
})();
