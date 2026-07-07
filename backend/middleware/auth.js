const jwt = require('jsonwebtoken');

/**
 * Express middleware: Verifies JWT in Authorization header.
 * Attaches req.user = { id, email, name } on success.
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, email: payload.email, name: payload.name };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired', expired: true });
    }
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
}

module.exports = { authenticateToken };
