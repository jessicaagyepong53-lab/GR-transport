const jwt = require('jsonwebtoken');
const AppSettings = require('../models/AppSettings');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret';
const COOKIE_NAME = 'gr_auth';

// Middleware: require admin JWT cookie for mutations
function requireAdmin(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Admin authentication required' });
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.isAdmin) return next();
    return res.status(401).json({ error: 'Admin authentication required' });
  } catch {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
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

// Record a global last-saved timestamp in the DB (called after any data write)
async function touchLastSaved() {
  try {
    await AppSettings.findOneAndUpdate(
      { key: 'lastSaved' },
      { value: new Date().toISOString() },
      { upsert: true }
    );
  } catch { /* non-critical — don't fail the request */ }
}

// Read the global last-saved timestamp from the DB
async function getLastSaved() {
  try {
    const doc = await AppSettings.findOne({ key: 'lastSaved' });
    return doc ? doc.value : null;
  } catch { return null; }
}

module.exports = { requireAdmin, getAdminPin, setAdminPin, touchLastSaved, getLastSaved };
