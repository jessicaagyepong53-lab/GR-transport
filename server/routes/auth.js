const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { getAdminPin } = require('../middleware/auth');

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

// POST /api/auth/verify — verify admin PIN
router.post('/verify', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN required' });

    const adminPin = await getAdminPin();
    if (String(pin) !== String(adminPin)) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    setAuthCookie(res, { isAdmin: true });
    res.json({ success: true, message: 'Admin access granted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/status — check admin status
router.get('/status', (req, res) => {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.json({ isAdmin: false });
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ isAdmin: decoded.isAdmin === true });
  } catch {
    res.json({ isAdmin: false });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ success: true });
});

module.exports = router;
