const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const path = require('path');
const fs = require('fs');

// GET all items sorted by expiry date
router.get('/', async (req, res) => {
  try {
    const items = await Item.find({}).sort({ expiryDate: 1 });
    const updated = items.map(item => {
      const doc = item.toObject();
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
    });
    res.json({ success: true, items: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET stats
router.get('/stats/summary', async (req, res) => {
  try {
    const all = await Item.find({});
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

// GET single item
router.get('/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST create item
router.post('/', async (req, res) => {
  try {
    const { name, expiryDate, imagePath, ocrText, detectedByOCR } = req.body;
    if (!name || !expiryDate) {
      return res.status(400).json({ success: false, error: 'Name and expiry date are required' });
    }
    const item = new Item({ name, expiryDate, imagePath, ocrText, detectedByOCR });
    await item.save();
    res.status(201).json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// PUT update item
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
    const item = await Item.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    res.json({ success: true, item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE item
router.delete('/:id', async (req, res) => {
  try {
    const item = await Item.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
    // Clean up uploaded image
    if (item.imagePath) {
      const imgPath = path.join(__dirname, '..', item.imagePath);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    res.json({ success: true, message: 'Item deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


module.exports = router;
