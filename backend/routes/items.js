const express = require('express');
const router = express.Router();
const multer = require('multer');
const Item = require('../models/Item');
const { authenticateToken } = require('../middleware/auth');
const { saveImage, deleteImage } = require('../utils/storage');

// Multer for optional image on POST /api/items
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// All item routes require authentication
router.use(authenticateToken);

// 
function withStatus(item) {
  const doc = item.toObject ? item.toObject() : { ...item };
  const now = new Date(); now.setHours(0, 0, 0, 0);
  let diff = 0;
  if (item.expiryDate) {
    const exp = new Date(item.expiryDate);
    if (!isNaN(exp)) {
      exp.setHours(0, 0, 0, 0);
      diff = Math.floor((exp - now) / 86400000);
    }
  }
  doc.status = diff < 0 ? 'Expired' : diff <= 2 ? 'Expiring Soon' : 'Safe';
  doc.daysLeft = diff;
  return doc;
}

// 
router.get('/', async (req, res) => {
  try {
    const items = await Item.find({ userId: req.user.id }).sort({ expiryDate: 1 });
    res.json({ success: true, items: items.map(withStatus) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 
router.get('/stats/summary', async (req, res) => {
  try {
    const all = await Item.find({ userId: req.user.id });
    const now = new Date(); now.setHours(0, 0, 0, 0);
    let safe = 0, expiringSoon = 0, expired = 0;
    for (const item of all) {
      if (!item.expiryDate) continue;
      const exp = new Date(item.expiryDate);
      if (isNaN(exp)) continue;
      exp.setHours(0, 0, 0, 0);
      const diff = Math.floor((exp - now) / 86400000);
      if (diff < 0) expired++;
      else if (diff <= 2) expiringSoon++;
      else safe++;
    }
    res.json({ success: true, stats: { total: all.length, safe, expiringSoon, expired } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 
router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findOne({ _id: req.params.id, userId: req.user.id });
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, item: withStatus(item) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 
// Accepts multipart/form-data: image (optional) + name + expiryDate + ocrText + detectedByOCR
// This is the moment the image is permanently saved (local or Cloudinary)
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const { name, expiryDate, ocrText, detectedByOCR } = req.body;
    if (!name || !expiryDate) {
      return res.status(400).json({ success: false, error: 'Name and expiry date are required' });
    }

    // ── Save image NOW (user clicked Save to Inventory) ────────────────────
    let imagePath = null;
    let imagePublicId = null;
    if (req.file) {
      try {
        const saved = await saveImage(req.file.buffer, req.file.originalname, req.file.mimetype);
        imagePath     = saved.url;
        imagePublicId = saved.publicId;
      } catch (saveErr) {
        console.error('Image save error (non-fatal):', saveErr.message);
        // Non-fatal: item still created, just without an image
      }
    }

    const item = new Item({
      userId: req.user.id,
      name: name.trim(),
      expiryDate,
      imagePath,
      imagePublicId: imagePublicId || null,
      ocrText:       ocrText || null,
      detectedByOCR: detectedByOCR === 'true' || detectedByOCR === true,
    });
    await item.save();
    res.status(201).json({ success: true, item: withStatus(item) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 
router.put('/:id', async (req, res) => {
  try {
    const { name, expiryDate } = req.body;
    const update = {};
    if (name) update.name = name;
    if (expiryDate) {
      update.expiryDate = expiryDate;
      // Reset notification flags when date changes
      update.notifiedExpired = false;
      update.notifiedToday = false;
      update.notifiedTomorrow = false;
      update.notified2Days = false;
    }
    const item = await Item.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      update,
      { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, item: withStatus(item) });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 
router.delete('/:id', async (req, res) => {
  try {
    const item = await Item.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    // Clean up image from storage
    if (item.imagePath) {
      await deleteImage(item.imagePath, item.imagePublicId);
    }
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
