const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [200, 'Name too long']
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required']
  },
  status: {
    type: String,
    enum: ['Safe', 'Expiring Soon', 'Expired'],
    default: 'Safe'
  },
  imagePath: {
    type: String,
    default: null
  },
  imagePublicId: {
    type: String,
    default: null
  },
  ocrText: {
    type: String,
    default: null
  },
  detectedByOCR: {
    type: Boolean,
    default: false
  },
  // Notification tracking flags (reset daily by cron)
  notifiedExpired: { type: Boolean, default: false },
  notifiedToday:   { type: Boolean, default: false },
  notifiedTomorrow:{ type: Boolean, default: false },
  notified2Days:   { type: Boolean, default: false },
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Compute status before save
itemSchema.pre('save', function () {
  this.status = computeStatus(this.expiryDate);
});

itemSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate();
  if (update.expiryDate) {
    update.status = computeStatus(update.expiryDate);
  }
});

function computeStatus(expiryDate) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expiryDate);
  exp.setHours(0, 0, 0, 0);
  const diffMs = exp - now;
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays < 0) return 'Expired';
  if (diffDays <= 2) return 'Expiring Soon';
  return 'Safe';
}

module.exports = mongoose.model('Item', itemSchema);
