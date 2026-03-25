const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { getHashedPin } = require('../middleware/auth');

// POST /api/auth/verify — verify admin PIN
router.post('/verify', async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ error: 'PIN required' });

    const adminPin = process.env.ADMIN_PIN || '1234';
    if (String(pin) !== String(adminPin)) {
      return res.status(401).json({ error: 'Invalid PIN' });
    }

    req.session.isAdmin = true;
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'Session save failed' });
      res.json({ success: true, message: 'Admin access granted' });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/status — check admin status
router.get('/status', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

module.exports = router;
