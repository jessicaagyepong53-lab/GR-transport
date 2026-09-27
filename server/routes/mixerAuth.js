// ─── CONCRETE MIXER AUTH ─────────────────────────────────────────────────
// Completely separate login from the truck dashboard's admin PIN.
// Set MIXER_PIN and MIXER_JWT_SECRET in your .env file.

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const AppSettings = require('../models/AppSettings');
const { AppError } = require('../utils/errors');
const {
  assertNotLocked,
  recordFailure,
  recordSuccess,
  getClientIdentifier,
  formatDuration
} = require('../middleware/rateLimit');
const router = express.Router();

const COOKIE_NAME = 'mixerAuthToken';
const MIXER_JWT_SECRET = process.env.MIXER_JWT_SECRET || 'change-this-mixer-secret';
const MIXER_PIN = process.env.MIXER_PIN || '';

router.get('/status', (req, res) => {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.json({ isAdmin: false });
    jwt.verify(token, MIXER_JWT_SECRET);
    res.json({ isAdmin: true });
  } catch {
    res.json({ isAdmin: false });
  }
});

// Rate-limited exactly like the Truck Dashboard's own PIN (§10.2 of the
// README): 3 wrong attempts locks the IP out for 15 minutes, escalating to
// 24 hours on a repeat lockout. Uses its own 'mixerlogin' scope key so this
// never shares a counter with the Truck Dashboard's 'login' scope.
router.post('/verify', async (req, res, next) => {
  try {
    const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : req.body?.pin;
    if (!pin) return next(new AppError('PIN is required', 400));

    const identifier = getClientIdentifier(req, 'mixerlogin');
    await assertNotLocked(identifier);

    const setting = await AppSettings.findOne({ key: 'mixerPinHash' });
    const valid = setting?.value
      ? await bcrypt.compare(String(pin), setting.value)
      : Boolean(MIXER_PIN) && String(pin) === String(MIXER_PIN);

    if (!valid) {
      const { remaining, lockedMs } = await recordFailure(identifier, { escalate: true });
      if (remaining <= 0) {
        return next(new AppError(`Too many failed attempts. Try again in ${formatDuration(lockedMs)}.`, 429));
      }
      return next(new AppError(`Invalid PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`, 401));
    }

    await recordSuccess(identifier);
    const token = jwt.sign({ scope: 'mixer-admin' }, MIXER_JWT_SECRET, { expiresIn: '30d' });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ success: true });
});

// Exported so equipment-routes.js, contract-routes.js, and mixer-recovery.js
// can protect write operations. Errors flow through next(err) into the same
// globalErrorHandler every other route uses, instead of writing the 401
// response directly — same JSON shape either way, but now consistent with
// requireAdmin's pattern for the Truck Dashboard.
function requireMixerAdmin(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return next(new AppError('Equipment Hire login required', 401));
    jwt.verify(token, MIXER_JWT_SECRET);
    next();
  } catch {
    next(new AppError('Equipment Hire login required', 401));
  }
}

module.exports = router;
module.exports.requireMixerAdmin = requireMixerAdmin;