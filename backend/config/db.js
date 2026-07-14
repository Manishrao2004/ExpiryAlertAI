const mongoose = require('mongoose');

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 3000; // 3s, 6s, 12s, 24s, 48s

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/expiryalert';

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000, // fail fast per attempt (10s)
      });
      console.log('[DB] MongoDB connected');
      return; // success — exit the loop
    } catch (err) {
      console.error(`[DB] MongoDB connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}`);

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[DB] Retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  // All retries exhausted — log but DO NOT crash.
  // The server stays alive so HF health-check passes.
  // Mongoose will keep trying to reconnect in the background automatically.
  console.error('[DB] ⚠ All MongoDB connection attempts failed. Server will stay alive — Mongoose auto-reconnects in the background.');
}

module.exports = connectDB;
