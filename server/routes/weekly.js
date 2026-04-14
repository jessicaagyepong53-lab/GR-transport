const router = require('express').Router();
const WeeklyEntry = require('../models/WeeklyEntry');
const YearEntry = require('../models/YearEntry');
const ExpenseBreakdown = require('../models/ExpenseBreakdown');
const MonthlyEntry = require('../models/MonthlyEntry');
const { requireAdmin } = require('../middleware/auth');

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function getWeekMonth(year, week) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const w1Monday = new Date(jan4);
  w1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(w1Monday);
  monday.setDate(w1Monday.getDate() + (week - 1) * 7);
  return MONTH_NAMES[monday.getMonth()];
}

// Recompute YearEntry, ExpenseBreakdown, and MonthlyEntry for a truck+year from weekly data
async function recomputeYearFromWeekly(truckId, year) {
  const entries = await WeeklyEntry.find({ truckId, year });

  // If no entries left, clean up YearEntry for this truck+year
  if (entries.length === 0) {
    await YearEntry.deleteOne({ truckId, year });
  } else {
    let gross = 0, maint = 0, other = 0, weeks = 0;
    entries.forEach(e => {
      gross += e.gross || 0;
      maint += e.maint || 0;
      other += e.other || 0;
      weeks++;
    });
    const exp = maint + other;
    const net = gross - exp;

    await YearEntry.findOneAndUpdate(
      { truckId, year },
      { gross, exp, net, weeks },
      { upsert: true, new: true }
    );
  }

  // Recompute fleet-wide expense breakdown for this year
  const allWeekly = await WeeklyEntry.aggregate([
    { $match: { year } },
    { $group: { _id: null, maint: { $sum: '$maint' }, other: { $sum: '$other' } } }
  ]);
  if (allWeekly.length) {
    await ExpenseBreakdown.findOneAndUpdate(
      { year },
      { maint: allWeekly[0].maint, other: allWeekly[0].other },
      { upsert: true }
    );
  } else {
    await ExpenseBreakdown.deleteOne({ year });
  }

  // Recompute fleet-wide monthly entries for this year using upserts (race-safe)
  const allEntries = await WeeklyEntry.find({ year });
  const monthMap = {};
  allEntries.forEach(e => {
    const mon = getWeekMonth(year, e.week);
    if (!monthMap[mon]) monthMap[mon] = { gross: 0, exp: 0 };
    monthMap[mon].gross += e.gross || 0;
    monthMap[mon].exp += (e.maint || 0) + (e.other || 0);
  });
  const activeMonths = Object.keys(monthMap);
  if (activeMonths.length) {
    const ops = activeMonths.map(month => ({
      updateOne: {
        filter: { year, month, truckId: '_fleet' },
        update: { $set: { gross: monthMap[month].gross, exp: monthMap[month].exp } },
        upsert: true
      }
    }));
    await MonthlyEntry.bulkWrite(ops);
  }
  // Remove months that no longer have data
  await MonthlyEntry.deleteMany({ year, truckId: '_fleet', month: { $nin: activeMonths } });
}

// GET /api/weekly/year/:year — all weekly entries for ALL trucks in a year (for data management)
// NOTE: Must be before /:truckId/:year so 'year' isn't matched as truckId
router.get('/year/:year', async (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const Truck = require('../models/Truck');
    const [entries, trucks] = await Promise.all([
      WeeklyEntry.find({ year }).sort('truckId week'),
      Truck.find().select('truckId driver')
    ]);
    const driverMap = {};
    trucks.forEach(t => { driverMap[t.truckId] = t.driver || ''; });
    const result = entries.map(e => ({
      _id: e._id,
      truck: e.truckId,
      week: e.week,
      year: e.year,
      daysWorked: e.daysWorked,
      gross: e.gross,
      expenses: (e.maint || 0) + (e.other || 0),
      maint: e.maint || 0,
      other: e.other || 0,
      driver: driverMap[e.truckId] || '',
      notes: e.notes || '',
      remarks: e.remarks || ''
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    const { daysWorked, gross, maint, other, notes, remarks } = req.body;
    const entry = await WeeklyEntry.findOneAndUpdate(
      {
        truckId: req.params.truckId,
        year: parseInt(req.params.year),
        week: parseInt(req.params.week)
      },
      {
        daysWorked: daysWorked != null ? daysWorked : null,
        gross: gross || 0,
        maint: maint || 0,
        other: other || 0,
        notes: notes || '',
        remarks: remarks || ''
      },
      { upsert: true, new: true }
    );

    // Auto-rollup: recompute YearEntry + ExpenseBreakdown
    await recomputeYearFromWeekly(req.params.truckId, parseInt(req.params.year));

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

    // Save to trash for recovery
    const Trash = require('../models/Trash');
    await Trash.create({
      type: 'weeklyEntry',
      label: `${req.params.truckId} / ${req.params.year} / Week ${req.params.week}`,
      data: entry.toObject()
    });

    // Auto-rollup: recompute YearEntry + ExpenseBreakdown
    await recomputeYearFromWeekly(req.params.truckId, parseInt(req.params.year));

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.recomputeYearFromWeekly = recomputeYearFromWeekly;
