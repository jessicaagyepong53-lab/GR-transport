const bcrypt = require('bcryptjs');

// Middleware: require admin session for mutations
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Admin authentication required' });
}

// Hash PIN on startup (cached)
let hashedPin = null;
async function getHashedPin() {
  if (!hashedPin) {
    const pin = process.env.ADMIN_PIN || '1234';
    hashedPin = await bcrypt.hash(pin, 10);
  }
  return hashedPin;
}

// Re-hash when PIN changes
function clearPinCache() {
  hashedPin = null;
}

module.exports = { requireAdmin, getHashedPin, clearPinCache };
