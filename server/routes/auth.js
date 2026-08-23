const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getAdminPin } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errors');
const {
  assertNotLocked,
  recordFailure,
  recordSuccess,
  getClientIdentifier,
  LOCKOUT_MINUTES
} = require('../middleware/rateLimit');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret';
const COOKIE_NAME = 'gr_auth';
const isProduction = process.env.NODE_ENV === 'production';

function setAuthCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  });
}

// POST /api/auth/verify — verify admin PIN (rate-limited: 3 tries, then a
// 15-minute lockout, tracked per IP so only the guesser is blocked)
router.post('/verify', asyncHandler(async (req, res) => {
  const pin = typeof req.body?.pin === 'string' ? req.body.pin.trim() : req.body?.pin;
  if (!pin) throw new AppError('PIN is required', 400);

  const identifier = getClientIdentifier(req, 'login');
  await assertNotLocked(identifier);

  const adminPin = await getAdminPin();
  if (String(pin) !== String(adminPin)) {
    const remaining = await recordFailure(identifier);
    if (remaining <= 0) {
      throw new AppError(`Too many failed attempts. Try again in ${LOCKOUT_MINUTES} minute(s).`, 429);
    }
    throw new AppError(`Invalid PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`, 401);
  }

  await recordSuccess(identifier);
  setAuthCookie(res, { isAdmin: true });
  res.json({ success: true, message: 'Admin access granted' });
}));

// GET /api/auth/status — check admin status
router.get('/status', (req, res) => {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.json({ isAdmin: false });
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ isAdmin: decoded.isAdmin === true });
  } catch {
    // Missing/expired/invalid token just means "not logged in" — not a server error.
    res.json({ isAdmin: false });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

module.exports = router;