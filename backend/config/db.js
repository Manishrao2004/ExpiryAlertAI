const mongoose = require('mongoose');

async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/expiryalert';
    await mongoose.connect(uri);
    console.log('[DB] MongoDB connected');
  } catch (err) {
    console.error('[DB] MongoDB error:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
