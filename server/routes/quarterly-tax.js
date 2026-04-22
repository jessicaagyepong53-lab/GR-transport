const router = require('express').Router();
const QuarterlyTax = require('../models/QuarterlyTax');
const { requireAdmin, touchLastSaved } = require('../middleware/auth');

// GET /api/quarterly-tax/:truckId/:year — returns { 1: n, 2: n, 3: n, 4: n }
router.get('/:truckId/:year', async (req, res) => {
  try {
    const entries = await QuarterlyTax.find({
      truckId: req.params.truckId,
      year: parseInt(req.params.year)
    });
    const result = { 1: 0, 2: 0, 3: 0, 4: 0 };
    entries.forEach(e => { result[e.quarter] = e.amount; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/quarterly-tax/:truckId/:year/:quarter — upsert a quarter's tax amount
router.put('/:truckId/:year/:quarter', requireAdmin, async (req, res) => {
  try {
    const { amount } = req.body;
    const entry = await QuarterlyTax.findOneAndUpdate(
      {
        truckId: req.params.truckId,
        year: parseInt(req.params.year),
        quarter: parseInt(req.params.quarter)
      },
      { amount: amount || 0 },
      { upsert: true, new: true }
    );
    await touchLastSaved();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
