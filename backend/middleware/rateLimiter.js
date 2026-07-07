const rateLimit = require('express-rate-limit');

// 
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Limit each IP to 500 requests per windowMs
  skip: (req, res) => process.env.NODE_ENV !== 'production', // Unlimited in local dev
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 login/register requests per window
  skip: (req, res) => process.env.NODE_ENV !== 'production', // Unlimited in local dev
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 
const uploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 100, // Limit each IP to 100 OCR requests per day
  skip: (req, res) => process.env.NODE_ENV !== 'production', // Unlimited in local dev
  message: { error: 'Scan limit reached (100/day). Please try again tomorrow.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter, authLimiter, uploadLimiter };
