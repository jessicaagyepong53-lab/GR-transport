const router = require('express').Router();
const ExpenseBreakdown = require('../models/ExpenseBreakdown');
const { requireAdmin, touchLastSaved } = require('../middleware/auth');
const { asyncHandler, toYear, toNumber } = require('../utils/errors');

// GET /api/expenses/:year
router.get('/:year', asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const entry = await ExpenseBreakdown.findOne({ year });
  res.json(entry || { year, maint: 0, other: 0, supervisorSalary: 0 });
}));

// GET /api/expenses — all years
router.get('/', asyncHandler(async (req, res) => {
  const entries = await ExpenseBreakdown.find().sort('year');
  const result = {};
  let allMaint = 0, allOther = 0;
  entries.forEach(e => {
    result[e.year] = { maint: e.maint, other: e.other };
    allMaint += e.maint;
    allOther += e.other;
  });
  result.all = { maint: allMaint, other: allOther };
  res.json(result);
}));

// PUT /api/expenses/:year
router.put('/:year', requireAdmin, asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const maint = toNumber(req.body.maint, 'maint', { allowNegative: false });
  const other = toNumber(req.body.other, 'other', { allowNegative: false });
  const supervisorSalary = toNumber(req.body.supervisorSalary, 'supervisorSalary', { allowNegative: false });

  const entry = await ExpenseBreakdown.findOneAndUpdate(
    { year },
    { maint, other, supervisorSalary },
    { upsert: true, new: true }
  );
  await touchLastSaved();
  res.json(entry);
}));

module.exports = router;