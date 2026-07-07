const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  endpoint: {
    type: String,
    required: true,
    unique: true
  },
  keys: {
    p256dh: { type: String, required: true },
    auth:   { type: String, required: true }
  },
  userAgent: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
