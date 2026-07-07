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
connectDB();
const { webpush, vapidPublicKey } = initVapid();
initCronJobs();
initWorkers().catch(e => console.error('Failed to init OCR workers:', e));

// 
app.locals.webpush = webpush;
app.locals.vapidPublicKey = vapidPublicKey;

// 
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// 
app.options('*', corsMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));
app.use('/api/', apiLimiter);

// 
app.use('/api/auth', require('./routes/auth'));
app.use('/api/items', require('./routes/items'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/notifications', require('./routes/notifications'));

// 
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));
app.post('/api/admin/check-notify', async (req, res) => {
  await checkAndNotify();
  res.json({ message: 'Notification check triggered' });
});

// 
app.listen(PORT, () => {
  console.log(`[System] ExpiryAlert AI backend: http://localhost:${PORT}`);
  console.log(`[System] VAPID Public Key: ${vapidPublicKey}`);
});

