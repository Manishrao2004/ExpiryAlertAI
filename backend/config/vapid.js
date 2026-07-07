const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

function initVapid() {
  const vapidPath = path.join(__dirname, '..', 'vapid.json');
  let vapidKeys;

  if (fs.existsSync(vapidPath)) {
    vapidKeys = JSON.parse(fs.readFileSync(vapidPath, 'utf8'));
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidPath, JSON.stringify(vapidKeys, null, 2));
    console.log('[System] Generated new VAPID keys');
  }

  webpush.setVapidDetails(
    `mailto:${process.env.VAPID_EMAIL || 'admin@expiryalert.app'}`,
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  return { webpush, vapidPublicKey: vapidKeys.publicKey };
}

module.exports = initVapid;
