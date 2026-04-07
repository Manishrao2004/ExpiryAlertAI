const express = require('express');
const router = express.Router();
const Subscription = require('../models/Subscription');

// GET VAPID public key
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: req.app.locals.vapidPublicKey });
});

// POST subscribe
router.post('/subscribe', async (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ success: false, error: 'Invalid subscription payload' });
  }

  try {
    const sub = await Subscription.findOneAndUpdate(
      { endpoint },
      { endpoint, keys, userAgent: req.headers['user-agent'] },
      { upsert: true, new: true }
    );
    res.json({ success: true, message: 'Subscribed to push notifications', id: sub._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE unsubscribe
router.post('/unsubscribe', async (req, res) => {
  const { endpoint } = req.body;
  try {
    await Subscription.deleteOne({ endpoint });
    res.json({ success: true, message: 'Unsubscribed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST send test notification
router.post('/test', async (req, res) => {
  const { endpoint } = req.body;
  const webpush = req.app.locals.webpush;

  try {
    const sub = await Subscription.findOne({ endpoint });
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify({
        title: '✅ ExpiryAlert AI',
        body: 'Push notifications are working! You\'ll be alerted before items expire.',
        icon: '/icon-192.png',
        badge: '/badge-96.png',
        tag: 'test-notification',
        data: { url: '/' }
      })
    );

    res.json({ success: true, message: 'Test notification sent' });
  } catch (err) {
    if (err.statusCode === 410) {
      await Subscription.deleteOne({ endpoint });
      return res.status(410).json({ success: false, error: 'Subscription expired' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET count of subscriptions
router.get('/count', async (req, res) => {
  const count = await Subscription.countDocuments();
  res.json({ count });
});

module.exports = router;
