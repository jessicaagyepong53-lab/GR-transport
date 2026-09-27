const express = require('express');
const bcrypt = require('bcryptjs');
const AppSettings = require('../models/AppSettings');
const { requireMixerAdmin } = require('./mixerAuth');
const {
  assertNotLocked,
  recordFailure,
  recordSuccess,
  getClientIdentifier,
  formatDuration
} = require('../middleware/rateLimit');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const pin = await AppSettings.findOne({ key: 'mixerPinHash' }).lean();
    res.json({ pinConfigured: Boolean(pin || process.env.MIXER_PIN) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/', requireMixerAdmin, async (req, res) => {
  try {
    const pin = String(req.body.pin || '').trim();
    if (pin.length < 4) return res.status(400).json({ error: 'Mixer PIN must be at least 4 characters' });
    const hash = await bcrypt.hash(pin, 12);
    await AppSettings.findOneAndUpdate({ key: 'mixerPinHash' }, { key: 'mixerPinHash', value: hash }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/recovery-pin', requireMixerAdmin, async (req, res) => {
  try {
    const pin = String(req.body.pin || '').trim();
    if (pin.length < 4) return res.status(400).json({ error: 'Recovery PIN must be at least 4 characters' });
    const hash = await bcrypt.hash(pin, 12);
    await AppSettings.findOneAndUpdate({ key: 'mixerRecoveryPinHash' }, { key: 'mixerRecoveryPinHash', value: hash }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Rate-limited the same way as the truck dashboard's PIN reset
// (server/routes/settings.js): 3 failed verification attempts locks that IP
// out for 15 minutes. Uses `escalate: false` like the truck reset flow, so
// this stays a same-day recovery path even during a longer login lockout,
// and its own scope ('mixerpinreset') keeps it independent of mixer login
// attempts and of the truck dashboard's own reset flow.
router.post('/pin/reset', async (req, res) => {
  try {
    const recoveryPin = String(req.body.recoveryPin || '').trim();
    const newPin = String(req.body.newPin || '').trim();
    if (newPin.length < 4) return res.status(400).json({ error: 'Mixer PIN must be at least 4 characters' });

    const identifier = getClientIdentifier(req, 'mixerpinreset');
    await assertNotLocked(identifier);

    const setting = await AppSettings.findOne({ key: 'mixerRecoveryPinHash' }).lean();
    const valid = setting?.value
      ? await bcrypt.compare(recoveryPin, setting.value)
      : Boolean(process.env.MIXER_RECOVERY_PIN) && recoveryPin === String(process.env.MIXER_RECOVERY_PIN);

    if (!valid) {
      const { remaining, lockedMs } = await recordFailure(identifier);
      if (remaining <= 0) {
        return res.status(429).json({ error: `Too many failed attempts. Try again in ${formatDuration(lockedMs)}.` });
      }
      return res.status(401).json({ error: `Invalid mixer recovery PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.` });
    }

    await recordSuccess(identifier);
    const hash = await bcrypt.hash(newPin, 12);
    await AppSettings.findOneAndUpdate({ key: 'mixerPinHash' }, { key: 'mixerPinHash', value: hash }, { upsert: true, new: true, setDefaultsOnInsert: true });
    res.json({ success: true });
  } catch (e) {
    const status = e.statusCode || 500;
    res.status(status).json({ error: e.message });
  }
});

module.exports = router;