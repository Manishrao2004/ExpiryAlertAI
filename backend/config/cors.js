const cors = require('cors');

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173', // Vite preview
  process.env.FRONTEND_URL
].filter(Boolean); // removes undefined

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or Postman)
    if (!origin) return callback(null, true);

    // Dynamic origin matching
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from unauthorized origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

module.exports = cors(corsOptions);
