const cors = require('cors');

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173', // Vite preview
  process.env.FRONTEND_URL
].filter(Boolean); // removes undefined

const corsOptions = {
  origin: '*',
};

module.exports = cors(corsOptions);
