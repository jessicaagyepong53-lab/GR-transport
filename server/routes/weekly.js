const router = require('express').Router();
const WeeklyEntry = require('../models/WeeklyEntry');
const { requireAdmin } = require('../middleware/auth');

// GET /api/weekly/:truckId/:year — get all weekly entries for truck+year
router.get('/:truckId/:year', async (req, res) => {
  try {
    const entries = await WeeklyEntry.find({
      truckId: req.params.truckId,
      year: parseInt(req.params.year)
    }).sort('week');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/weekly/:truckId — all weekly entries for a truck
router.get('/:truckId', async (req, res) => {
  try {
    const entries = await WeeklyEntry.find({ truckId: req.params.truckId }).sort('year week');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/weekly/:truckId/:year/:week — upsert weekly entry
router.put('/:truckId/:year/:week', requireAdmin, async (req, res) => {
  try {
    const { days, notes } = req.body;
    const entry = await WeeklyEntry.findOneAndUpdate(
      {
        truckId: req.params.truckId,
        year: parseInt(req.params.year),
        week: parseInt(req.params.week)
      },
      { days: days || [], notes: notes || '' },
      { upsert: true, new: true }
    );
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/weekly/:truckId/:year/:week
router.delete('/:truckId/:year/:week', requireAdmin, async (req, res) => {
  try {
    const entry = await WeeklyEntry.findOneAndDelete({
      truckId: req.params.truckId,
      year: parseInt(req.params.year),
      week: parseInt(req.params.week)
    });
    if (!entry) return res.status(404).json({ error: 'Entry not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
