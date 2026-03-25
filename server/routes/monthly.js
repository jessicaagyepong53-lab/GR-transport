const router = require('express').Router();
const MonthlyEntry = require('../models/MonthlyEntry');
const { requireAdmin } = require('../middleware/auth');

// GET /api/monthly/:year — all monthly entries for a year
router.get('/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const entries = await MonthlyEntry.find({ year }).sort('month');

    // Format for frontend: { labels, gross, exp }
    const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const sorted = entries.sort((a, b) => MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month));

    res.json({
      year,
      labels: sorted.map(e => e.month),
      gross: sorted.map(e => e.gross),
      exp: sorted.map(e => e.exp)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/monthly — all monthly entries grouped by year
router.get('/', async (req, res) => {
  try {
    const entries = await MonthlyEntry.find().sort('year month');
    const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    const byYear = {};
    entries.forEach(e => {
      if (!byYear[e.year]) byYear[e.year] = [];
      byYear[e.year].push(e);
    });

    const result = {};
    for (const year in byYear) {
      const sorted = byYear[year].sort((a, b) => MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month));
      result[year] = {
        labels: sorted.map(e => e.month),
        gross: sorted.map(e => e.gross),
        exp: sorted.map(e => e.exp)
      };
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/monthly/:truckId/:year/:month — upsert monthly entry
router.put('/:truckId/:year/:month', requireAdmin, async (req, res) => {
  try {
    const { gross, exp } = req.body;
    const entry = await MonthlyEntry.findOneAndUpdate(
      { truckId: req.params.truckId, year: parseInt(req.params.year), month: req.params.month },
      { gross: gross || 0, exp: exp || 0 },
      { upsert: true, new: true }
    );
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/monthly/bulk — bulk upsert monthly entries for a year
router.put('/bulk/:year', requireAdmin, async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const { entries } = req.body; // [{ month, gross, exp }]

    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: 'entries array required' });
    }

    // Delete existing entries for this year (fleet-level)
    await MonthlyEntry.deleteMany({ year, truckId: '_fleet' });

    // Insert new
    const docs = entries.map(e => ({
      truckId: '_fleet',
      year,
      month: e.month,
      gross: e.gross || 0,
      exp: e.exp || 0
    }));

    if (docs.length) await MonthlyEntry.insertMany(docs);

    res.json({ success: true, count: docs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
