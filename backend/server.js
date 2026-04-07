require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const webpush = require('web-push');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── VAPID Keys (auto-generate & persist) ───────────────────────────────────
const vapidPath = path.join(__dirname, 'vapid.json');
let vapidKeys;
if (fs.existsSync(vapidPath)) {
  vapidKeys = JSON.parse(fs.readFileSync(vapidPath, 'utf8'));
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys, null, 2));
  console.log('✅ Generated new VAPID keys');
}

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL || 'admin@expiryalert.app'}`,
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// ─── Ensure upload directory ─────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: '*' })); // Extremely permissive CORS per user request
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

// ─── MongoDB ─────────────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/expiryalert')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ─── Share webpush + vapidPublicKey with routes ───────────────────────────────
app.locals.webpush = webpush;
app.locals.vapidPublicKey = vapidKeys.publicKey;

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/items', require('./routes/items'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/notifications', require('./routes/notifications'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ─── Notification Helpers ─────────────────────────────────────────────────────
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

async function sendPush(sub, payload) {
  const Subscription = require('./models/Subscription');
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload)
    );
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await Subscription.deleteOne({ endpoint: sub.endpoint });
      console.log(`Removed stale subscription`);
    }
  }
}

async function checkAndNotify() {
  const Item = require('./models/Item');
  const Subscription = require('./models/Subscription');

  try {
    const subs = await Subscription.find({});
    if (!subs.length) {
      console.log('No push subscriptions found, skipping notification check.');
      return;
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d1 = new Date(now); d1.setDate(d1.getDate() + 1);
    const d2 = new Date(now); d2.setDate(d2.getDate() + 2);
    const d3 = new Date(now); d3.setDate(d3.getDate() + 3);

    const groups = [
      {
        items: await Item.find({ expiryDate: { $lt: now }, notifiedExpired: { $ne: true } }),
        make: (item) => ({
          title: `🚨 EXPIRED: ${item.name}`,
          body: `${item.name} expired on ${formatDate(item.expiryDate)}. Please discard immediately!`,
          tag: `expired-${item._id}`,
          urgency: 'high'
        }),
        flag: 'notifiedExpired'
      },
      {
        items: await Item.find({ expiryDate: { $gte: now, $lt: d1 }, notifiedToday: { $ne: true } }),
        make: (item) => ({
          title: `⚠️ Expires TODAY: ${item.name}`,
          body: `${item.name} expires TODAY (${formatDate(item.expiryDate)}). Use it now!`,
          tag: `today-${item._id}`,
          urgency: 'high'
        }),
        flag: 'notifiedToday'
      },
      {
        items: await Item.find({ expiryDate: { $gte: d1, $lt: d2 }, notifiedTomorrow: { $ne: true } }),
        make: (item) => ({
          title: `⏰ Expires Tomorrow: ${item.name}`,
          body: `${item.name} expires TOMORROW (${formatDate(item.expiryDate)}). Don't forget!`,
          tag: `tomorrow-${item._id}`,
          urgency: 'high'
        }),
        flag: 'notifiedTomorrow'
      },
      {
        items: await Item.find({ expiryDate: { $gte: d2, $lt: d3 }, notified2Days: { $ne: true } }),
        make: (item) => ({
          title: `📅 2 Days Left: ${item.name}`,
          body: `${item.name} expires in 2 days on ${formatDate(item.expiryDate)}.`,
          tag: `2days-${item._id}`,
          urgency: 'normal'
        }),
        flag: 'notified2Days'
      }
    ];

    for (const group of groups) {
      for (const item of group.items) {
        const payload = {
          ...group.make(item),
          icon: '/icon-192.png',
          badge: '/badge-96.png',
          data: { itemId: item._id.toString(), url: '/' },
          actions: [
            { action: 'view', title: 'View Items' },
            { action: 'dismiss', title: 'Dismiss' }
          ]
        };

        for (const sub of subs) {
          await sendPush(sub, payload);
        }

        // Mark as notified so we don't spam
        await Item.findByIdAndUpdate(item._id, { [group.flag]: true });
      }
    }

    console.log('✅ Expiry notifications sent.');
  } catch (err) {
    console.error('Cron notification error:', err.message);
  }
}

// ─── Cron: Daily 8 AM check ───────────────────────────────────────────────────
cron.schedule('0 8 * * *', () => {
  console.log('⏰ Running daily expiry check at 8 AM...');
  checkAndNotify();
});

// ─── Also check every hour for items that haven't been notified ───────────────
cron.schedule('0 * * * *', () => {
  checkAndNotify();
});

// Expose for manual trigger via API
app.post('/api/admin/check-notify', async (req, res) => {
  await checkAndNotify();
  res.json({ message: 'Notification check triggered' });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 ExpiryAlert AI backend: http://localhost:${PORT}`);
  console.log(`📢 VAPID Public Key: ${vapidKeys.publicKey}`);
});
