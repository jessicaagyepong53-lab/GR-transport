const router = require('express').Router();
const jwt = require('jsonwebtoken');
const { requireAdmin, getAdminPin, setAdminPin } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret';
const COOKIE_NAME = 'gr_auth';
const isProduction = process.env.NODE_ENV === 'production';

// GET /api/settings — get app settings
router.get('/', (req, res) => {
  res.json({
    currency: 'GHS',
    appName: 'GR-Transport Fleet Dashboard'
  });
});

// POST /api/settings/pin/reset — reset PIN using recovery key
router.post('/pin/reset', async (req, res) => {
  try {
    const { recoveryKey, newPin } = req.body;
    if (!recoveryKey || !newPin) {
      return res.status(400).json({ error: 'Recovery key and new PIN required' });
    }
    if (String(newPin).length < 4) {
      return res.status(400).json({ error: 'PIN must be at least 4 characters' });
    }

    const validKey = process.env.RECOVERY_KEY;
    if (!validKey) {
      return res.status(503).json({ error: 'Recovery key not configured on server' });
    }
    if (String(recoveryKey) !== String(validKey)) {
      return res.status(401).json({ error: 'Invalid recovery key' });
    }

    await setAdminPin(newPin);

    // Grant admin cookie after successful reset
    const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '24h' });
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });
    res.json({ success: true, message: 'PIN has been reset' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
