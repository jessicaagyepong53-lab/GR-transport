const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const Contract = require('../models/Contract');
const { requireMixerAdmin } = require('./mixerAuth');

router.get('/', async (req, res) => {
  try {
    const [equipment, contracts] = await Promise.all([
      Equipment.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }),
      Contract.find({ deletedAt: { $ne: null } }).sort({ deletedAt: -1 }),
    ]);
    res.json({ equipment, contracts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/equipment/:id', requireMixerAdmin, async (req, res) => {
  const item = await Equipment.findOneAndDelete({ equipmentId: req.params.id, deletedAt: { $ne: null } });
  if (!item) return res.status(404).json({ error: 'Deleted equipment not found' });
  res.json({ success: true });
});

router.delete('/contracts/:id', requireMixerAdmin, async (req, res) => {
  const item = await Contract.findOneAndDelete({ _id: req.params.id, deletedAt: { $ne: null } });
  if (!item) return res.status(404).json({ error: 'Deleted contract not found' });
  res.json({ success: true });
});

router.delete('/', requireMixerAdmin, async (req, res) => {
  const [equipment, contracts] = await Promise.all([
    Equipment.deleteMany({ deletedAt: { $ne: null } }),
    Contract.deleteMany({ deletedAt: { $ne: null } }),
  ]);
  res.json({ success: true, deleted: equipment.deletedCount + contracts.deletedCount });
});

router.post('/equipment/:id/restore', requireMixerAdmin, async (req, res) => {
  const item = await Equipment.findOneAndUpdate(
    { equipmentId: req.params.id, deletedAt: { $ne: null } },
    { $set: { deletedAt: null, status: 'available' } },
    { new: true }
  );
  if (!item) return res.status(404).json({ error: 'Deleted equipment not found' });
  res.json(item);
});

router.post('/contracts/:id/restore', requireMixerAdmin, async (req, res) => {
  const contract = await Contract.findOneAndUpdate(
    { _id: req.params.id, deletedAt: { $ne: null } },
    { $set: { deletedAt: null } },
    { new: true }
  );
  if (!contract) return res.status(404).json({ error: 'Deleted contract not found' });
  res.json(contract);
});

module.exports = router;