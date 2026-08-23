const jwt = require('jsonwebtoken');
const AppSettings = require('../models/AppSettings');
const { AppError } = require('../utils/errors');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret';
const COOKIE_NAME = 'gr_auth';

// Middleware: require admin JWT cookie for mutations.
// Uses next(new AppError(...)) instead of writing the response directly so
// every 401 from this middleware goes through the same global error handler
// (and JSON shape) as every other error in the app.
function requireAdmin(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return next(new AppError('Admin authentication required', 401));
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.isAdmin) return next();
    return next(new AppError('Admin authentication required', 401));
  } catch {
    // Expired/invalid/malformed token — same "please log in" response either way
    return next(new AppError('Admin authentication required', 401));
  }
}

// Get the current admin PIN (DB first, then env fallback)
async function getAdminPin() {
  try {
    const doc = await AppSettings.findOne({ key: 'adminPin' });
    if (doc) return doc.value;
  } catch (err) {
    // DB read failed — log it so a real outage doesn't vanish silently,
    // then fall back to the env-configured PIN rather than locking everyone out.
    console.error('Failed to read admin PIN from DB, falling back to env:', err.message);
  }
  return process.env.ADMIN_PIN || '1234';
}

// Save PIN to the database
async function setAdminPin(newPin) {
  const pin = String(newPin || '').trim();
  if (!pin) {
    throw new AppError('PIN cannot be empty', 400);
  }
  await AppSettings.findOneAndUpdate(
    { key: 'adminPin' },
    { value: pin },
    { upsert: true }
  );
}

// Record a global last-saved timestamp in the DB (called after any data write).
// Failure here is genuinely non-critical (it only affects the "Last saved"
// display) so it must never fail the request that triggered it — but it's
// still logged so a persistent DB problem is visible somewhere.
async function touchLastSaved() {
  try {
    await AppSettings.findOneAndUpdate(
      { key: 'lastSaved' },
      { value: new Date().toISOString() },
      { upsert: true }
    );
  } catch (err) {
    console.error('Failed to update lastSaved timestamp:', err.message);
  }
}

// Read the global last-saved timestamp from the DB
async function getLastSaved() {
  try {
    const doc = await AppSettings.findOne({ key: 'lastSaved' });
    return doc ? doc.value : null;
  } catch (err) {
    console.error('Failed to read lastSaved timestamp:', err.message);
    return null;
  }
}

module.exports = { requireAdmin, getAdminPin, setAdminPin, touchLastSaved, getLastSaved };