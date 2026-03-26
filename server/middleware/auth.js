const AppSettings = require('../models/AppSettings');

// Middleware: require admin session for mutations
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Admin authentication required' });
}

// Get the current admin PIN (DB first, then env fallback)
async function getAdminPin() {
  try {
    const doc = await AppSettings.findOne({ key: 'adminPin' });
    if (doc) return doc.value;
  } catch { /* fall through */ }
  return process.env.ADMIN_PIN || '1234';
}

// Save PIN to the database
async function setAdminPin(newPin) {
  await AppSettings.findOneAndUpdate(
    { key: 'adminPin' },
    { value: String(newPin) },
    { upsert: true }
  );
}

module.exports = { requireAdmin, getAdminPin, setAdminPin };
