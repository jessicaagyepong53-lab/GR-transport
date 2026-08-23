const router = require('express').Router();
const QuarterlyTax = require('../models/QuarterlyTax');
const { requireAdmin, touchLastSaved } = require('../middleware/auth');
const { asyncHandler, toYear, toQuarter, toNumber } = require('../utils/errors');

// GET /api/quarterly-tax/years/:truckId — list available years for quarterly tax entries
router.get('/years/:truckId', asyncHandler(async (req, res) => {
  const years = await QuarterlyTax.distinct('year', { truckId: req.params.truckId });
  years.sort((a, b) => a - b);
  res.json(years);
}));

// GET /api/quarterly-tax/:truckId/:year — returns { 1: n, 2: n, 3: n, 4: n }
router.get('/:truckId/:year', asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const entries = await QuarterlyTax.find({ truckId: req.params.truckId, year });
  const result = { 1: 0, 2: 0, 3: 0, 4: 0 };
  entries.forEach(e => { result[e.quarter] = e.amount; });
  res.json(result);
}));

// PUT /api/quarterly-tax/:truckId/:year/:quarter — upsert a quarter's tax amount
router.put('/:truckId/:year/:quarter', requireAdmin, asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const quarter = toQuarter(req.params.quarter);
  const amount = toNumber(req.body.amount, 'amount', { allowNegative: false });

  const entry = await QuarterlyTax.findOneAndUpdate(
    { truckId: req.params.truckId, year, quarter },
    { amount },
    { upsert: true, new: true }
  );
  await touchLastSaved();
  res.json(entry);
}));

module.exports = router;