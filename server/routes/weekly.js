const router = require('express').Router();
const WeeklyEntry = require('../models/WeeklyEntry');
const YearEntry = require('../models/YearEntry');
const ExpenseBreakdown = require('../models/ExpenseBreakdown');
const MonthlyEntry = require('../models/MonthlyEntry');
const { requireAdmin, touchLastSaved } = require('../middleware/auth');

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

function buildRangeMap(rows) {
  const grouped = {};
  rows.forEach(r => {
    const wk = parseInt(r.week);
    if (!grouped[wk]) grouped[wk] = [];
    grouped[wk].push(Number(r.gross || 0));
  });

  const out = {};
  Object.keys(grouped).forEach(wk => {
    const vals = grouped[wk].sort((a, b) => a - b);
    if (!vals.length) return;
    const sum = vals.reduce((s, n) => s + n, 0);
    out[wk] = {
      min: vals[0],
      max: vals[vals.length - 1],
      avg: sum / vals.length,
      samples: vals.length
    };
  });
  return out;
}

function buildWeekComparisonMap(weekGrossMap) {
  const out = {};
  for (let wk = 1; wk <= 53; wk++) {
    if (weekGrossMap[wk] == null) continue;
    const gross = Number(weekGrossMap[wk] || 0);
    const prevGross = weekGrossMap[wk - 1] != null ? Number(weekGrossMap[wk - 1] || 0) : null;
    const delta = prevGross == null ? null : gross - prevGross;
    const pct = (prevGross == null || prevGross === 0) ? null : (delta / prevGross) * 100;
    out[wk] = {
      gross,
      prevGross,
      delta,
      pct,
      status: prevGross == null ? 'na' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'
    };
  }
  return out;
}

function buildSimpleRange(values) {
  const nums = (values || []).map(v => Number(v || 0));
  if (!nums.length) {
    return { min: 0, max: 0, avg: 0, range: 0, samples: 0 };
  }
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const avg = nums.reduce((sum, n) => sum + n, 0) / nums.length;
  return {
    min,
    max,
    avg,
    range: max - min,
    samples: nums.length
  };
}

// Recompute YearEntry, ExpenseBreakdown, and MonthlyEntry for a truck+year from weekly data
async function recomputeYearFromWeekly(truckId, year) {
  const entries = await WeeklyEntry.find({ truckId, year });
  const existingExpense = await ExpenseBreakdown.findOne({ year });
  const supervisorSalary = existingExpense?.supervisorSalary || 0;

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
      { maint: allWeekly[0].maint, other: allWeekly[0].other, supervisorSalary },
      { upsert: true }
    );
  } else {
    if (supervisorSalary > 0) {
      await ExpenseBreakdown.findOneAndUpdate(
        { year },
        { maint: 0, other: 0, supervisorSalary },
        { upsert: true }
      );
    } else {
      await ExpenseBreakdown.deleteOne({ year });
    }
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
// GET /api/weekly/compare?scope=truck|fleet&truckId=...&year=YYYY
router.get('/compare', async (req, res) => {
  try {
    const scope = (req.query.scope || 'truck').toLowerCase();
    const year = req.query.year ? parseInt(req.query.year) : null;
    if (!year || isNaN(year)) return res.status(400).json({ error: 'year is required' });

    if (scope === 'fleet') {
      const grouped = await WeeklyEntry.aggregate([
        { $match: { year } },
        { $group: { _id: '$week', gross: { $sum: '$gross' } } },
        { $sort: { _id: 1 } }
      ]);
      const weekGrossMap = {};
      grouped.forEach(r => { weekGrossMap[r._id] = Number(r.gross || 0); });
      return res.json({ scope: 'fleet', year, weeks: buildWeekComparisonMap(weekGrossMap) });
    }

    const truckId = req.query.truckId;
    if (!truckId) return res.status(400).json({ error: 'truckId is required for truck scope' });

    const entries = await WeeklyEntry.find({ truckId, year }).select('week gross').sort('week').lean();
    const weekGrossMap = {};
    entries.forEach(e => { weekGrossMap[e.week] = Number(e.gross || 0); });

    return res.json({
      scope: 'truck',
      truckId,
      year,
      weeks: buildWeekComparisonMap(weekGrossMap)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/weekly/ranges?scope=truck|fleet&truckId=...&year=YYYY
router.get('/ranges', async (req, res) => {
  try {
    const scope = (req.query.scope || 'truck').toLowerCase();
    const year = req.query.year ? parseInt(req.query.year) : null;

    if (scope === 'fleet') {
      const grouped = await WeeklyEntry.aggregate([
        {
          $group: {
            _id: { year: '$year', week: '$week' },
            gross: { $sum: '$gross' }
          }
        }
      ]);

      const allRows = grouped.map(r => ({ year: r._id.year, week: r._id.week, gross: r.gross || 0 }));
      let baselineRows = year ? allRows.filter(r => r.year !== year) : allRows;
      if (!baselineRows.length) baselineRows = allRows;
      const currentYearWeeks = year
        ? allRows.filter(r => r.year === year).reduce((acc, r) => {
            acc[r.week] = Number(r.gross || 0);
            return acc;
          }, {})
        : {};

      return res.json({
        scope: 'fleet',
        year,
        weeks: buildRangeMap(baselineRows),
        currentYearWeeks
      });
    }

    const truckId = req.query.truckId;
    if (!truckId) return res.status(400).json({ error: 'truckId is required for truck scope' });

    const entries = await WeeklyEntry.find({ truckId }).select('year week gross').lean();
    let baselineRows = year ? entries.filter(e => e.year !== year) : entries;
    if (!baselineRows.length) baselineRows = entries;
    const currentYearWeeks = year
      ? entries.filter(e => e.year === year).reduce((acc, e) => {
          acc[e.week] = Number(e.gross || 0);
          return acc;
        }, {})
      : {};

    return res.json({
      scope: 'truck',
      truckId,
      year,
      weeks: buildRangeMap(baselineRows),
      currentYearWeeks
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/weekly/current-vs-range?scope=truck|fleet&truckId=...&year=YYYY&week=WW
router.get('/current-vs-range', async (req, res) => {
  try {
    const scope = (req.query.scope || 'truck').toLowerCase();
    const year = req.query.year ? parseInt(req.query.year) : null;
    const week = req.query.week ? parseInt(req.query.week) : null;
    if (!year || isNaN(year)) return res.status(400).json({ error: 'year is required' });
    if (!week || isNaN(week)) return res.status(400).json({ error: 'week is required' });

    if (scope === 'fleet') {
      const grouped = await WeeklyEntry.aggregate([
        { $match: { year } },
        { $group: { _id: '$week', gross: { $sum: '$gross' } } },
        { $sort: { _id: 1 } }
      ]);

      const weekRows = grouped.map(r => ({ week: Number(r._id), gross: Number(r.gross || 0) }));
      const weekMap = weekRows.reduce((acc, row) => {
        acc[row.week] = row.gross;
        return acc;
      }, {});
      const stats = buildSimpleRange(weekRows.map(r => r.gross));
      const currentGross = Number(weekMap[week] || 0);
      const status = stats.samples === 0
        ? 'na'
        : currentGross < stats.min
          ? 'low'
          : currentGross > stats.max
            ? 'high'
            : 'in';

      return res.json({
        scope: 'fleet',
        year,
        week,
        currentGross,
        min: stats.min,
        max: stats.max,
        avg: stats.avg,
        range: stats.range,
        samples: stats.samples,
        status
      });
    }

    const truckId = req.query.truckId;
    if (!truckId) return res.status(400).json({ error: 'truckId is required for truck scope' });

    const entries = await WeeklyEntry.find({ truckId, year }).select('week gross').lean();
    const weekMap = entries.reduce((acc, e) => {
      acc[e.week] = Number(e.gross || 0);
      return acc;
    }, {});
    const stats = buildSimpleRange(entries.map(e => Number(e.gross || 0)));
    const currentGross = Number(weekMap[week] || 0);
    const status = stats.samples === 0
      ? 'na'
      : currentGross < stats.min
        ? 'low'
        : currentGross > stats.max
          ? 'high'
          : 'in';

    return res.json({
      scope: 'truck',
      truckId,
      year,
      week,
      currentGross,
      min: stats.min,
      max: stats.max,
      avg: stats.avg,
      range: stats.range,
      samples: stats.samples,
      status
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

    await touchLastSaved();
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

    await touchLastSaved();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.recomputeYearFromWeekly = recomputeYearFromWeekly;
