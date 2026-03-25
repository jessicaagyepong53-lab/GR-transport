const router = require('express').Router();
const ExpenseBreakdown = require('../models/ExpenseBreakdown');
const { requireAdmin } = require('../middleware/auth');

// GET /api/expenses/:year
router.get('/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const entry = await ExpenseBreakdown.findOne({ year });
    res.json(entry || { year, maint: 0, other: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/expenses — all years
router.get('/', async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:year
router.put('/:year', requireAdmin, async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const { maint, other } = req.body;
    const entry = await ExpenseBreakdown.findOneAndUpdate(
      { year },
      { maint: maint || 0, other: other || 0 },
      { upsert: true, new: true }
    );
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
