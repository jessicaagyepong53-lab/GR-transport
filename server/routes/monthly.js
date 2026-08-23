const router = require('express').Router();
const MonthlyEntry = require('../models/MonthlyEntry');
const { requireAdmin, touchLastSaved } = require('../middleware/auth');
const { asyncHandler, AppError, toYear, toMonth, toNumber, MONTH_ORDER } = require('../utils/errors');

// GET /api/monthly/:year — all monthly entries for a year
router.get('/:year', asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const entries = await MonthlyEntry.find({ year }).sort('month');
  const sorted = entries.sort((a, b) => MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month));

  res.json({
    year,
    labels: sorted.map(e => e.month),
    gross: sorted.map(e => e.gross),
    exp: sorted.map(e => e.exp)
  });
}));

// GET /api/monthly — all monthly entries grouped by year
router.get('/', asyncHandler(async (req, res) => {
  const entries = await MonthlyEntry.find().sort('year month');

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
}));

// PUT /api/monthly/bulk/:year — bulk upsert monthly entries for a year
// NOTE: Must be BEFORE /:truckId/:year/:month so 'bulk' isn't matched as truckId
router.put('/bulk/:year', requireAdmin, asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const { entries } = req.body;

  if (!Array.isArray(entries)) {
    throw new AppError('entries must be an array', 400);
  }

  const docs = entries.map((e, i) => ({
    truckId: '_fleet',
    year,
    month: toMonth(e.month, `entries[${i}].month`),
    gross: toNumber(e.gross, `entries[${i}].gross`, { allowNegative: false }),
    exp: toNumber(e.exp, `entries[${i}].exp`, { allowNegative: false })
  }));

  // Delete existing entries for this year (fleet-level)
  await MonthlyEntry.deleteMany({ year, truckId: '_fleet' });

  if (docs.length) await MonthlyEntry.insertMany(docs);

  await touchLastSaved();
  res.json({ success: true, count: docs.length });
}));

// PUT /api/monthly/:truckId/:year/:month — upsert monthly entry
router.put('/:truckId/:year/:month', requireAdmin, asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const month = toMonth(req.params.month);
  const gross = toNumber(req.body.gross, 'gross', { allowNegative: false });
  const exp = toNumber(req.body.exp, 'exp', { allowNegative: false });

  const entry = await MonthlyEntry.findOneAndUpdate(
    { truckId: req.params.truckId, year, month },
    { gross, exp },
    { upsert: true, new: true }
  );
  await touchLastSaved();
  res.json(entry);
}));

module.exports = router;