const router = require('express').Router();
const { requireAdmin } = require('../middleware/auth');

// GET /api/settings — get app settings
router.get('/', (req, res) => {
  res.json({
    currency: 'GHS',
    appName: 'GR-Transport Fleet Dashboard'
  });
});

// PUT /api/settings/pin — change admin PIN
router.put('/pin', requireAdmin, async (req, res) => {
  try {
    const { currentPin, newPin } = req.body;
    if (!currentPin || !newPin) {
      return res.status(400).json({ error: 'Current and new PIN required' });
    }
    if (String(newPin).length < 4) {
      return res.status(400).json({ error: 'PIN must be at least 4 characters' });
    }

    const adminPin = process.env.ADMIN_PIN || '1234';
    if (String(currentPin) !== String(adminPin)) {
      return res.status(401).json({ error: 'Current PIN is incorrect' });
    }

    // Note: PIN change persists only in memory for this session.
    // For permanent change, update the .env file or environment variable.
    process.env.ADMIN_PIN = String(newPin);

    res.json({ success: true, message: 'PIN updated for current session' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
