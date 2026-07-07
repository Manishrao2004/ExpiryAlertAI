const cron = require('node-cron');
const webpush = require('web-push');
const Item = require('../models/Item');
const Subscription = require('../models/Subscription');

function formatDate(date) {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}

async function sendPush(sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload)
    );
  } catch (err) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      await Subscription.deleteOne({ endpoint: sub.endpoint });
      console.log(`[Cron] Removed stale subscription`);
    }
  }
}

async function checkAndNotify() {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d1 = new Date(now); d1.setDate(d1.getDate() + 1);
    const d2 = new Date(now); d2.setDate(d2.getDate() + 2);
    const d3 = new Date(now); d3.setDate(d3.getDate() + 3);

    // Build list of items that need notification (all users)
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

    let notified = 0;
    for (const group of groups) {
      for (const item of group.items) {
        // ── Only notify subscriptions belonging to THIS item's owner ──────────
        const userSubs = await Subscription.find({ userId: item.userId });
        if (!userSubs.length) {
          // Owner has no push subscriptions — still mark as notified to avoid re-check
          await Item.findByIdAndUpdate(item._id, { [group.flag]: true });
          continue;
        }

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

        for (const sub of userSubs) {
          await sendPush(sub, payload);
          notified++;
        }

        // Mark as notified so we don't spam
        await Item.findByIdAndUpdate(item._id, { [group.flag]: true });
      }
    }

    console.log(`[Cron] Expiry notifications sent (${notified} push(es)).`);
  } catch (err) {
    console.error('[Error] Cron notification error:', err.message);
  }
}

function initCronJobs() {
  // 
  cron.schedule('0 8 * * *', () => {
    console.log('[Cron] Running daily expiry check at 8 AM...');
    checkAndNotify();
  });

  // 
  cron.schedule('0 * * * *', () => {
    checkAndNotify();
  });
  
  console.log('[System] Cron jobs initialized');
}

module.exports = { initCronJobs, checkAndNotify };
