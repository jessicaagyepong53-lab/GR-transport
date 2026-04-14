const router = require('express').Router();
const YearEntry = require('../models/YearEntry');
const MonthlyEntry = require('../models/MonthlyEntry');
const ExpenseBreakdown = require('../models/ExpenseBreakdown');
const Truck = require('../models/Truck');
const WeeklyEntry = require('../models/WeeklyEntry');


// GET /api/dashboard/kpis?year= — computed KPIs
router.get('/kpis', async (req, res) => {
  try {
    const year = req.query.year;
    let filter = {};
    if (year && year !== 'all') {
      filter.year = parseInt(year);
    }

    const entries = await YearEntry.find(filter);
    let gross = 0, exp = 0, net = 0, weeks = 0;
    entries.forEach(e => {
      gross += e.gross;
      exp += e.exp;
      net += e.net;
      weeks += e.weeks;
    });

    const eff = gross ? Math.round(net / gross * 100) : 0;
    const avgWeek = weeks ? Math.round(gross / weeks) : 0;

    res.json({ gross, exp, net, weeks, eff, avgWeek });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/yearly-totals — yearly totals
router.get('/yearly-totals', async (req, res) => {
  try {
    const entries = await YearEntry.find();
    const totals = {};
    entries.forEach(e => {
      if (!totals[e.year]) totals[e.year] = { gross: 0, exp: 0, net: 0 };
      totals[e.year].gross += e.gross;
      totals[e.year].exp += e.exp;
      totals[e.year].net += e.net;
    });
    res.json(totals);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/heatmap — Truck×Year net matrix
router.get('/heatmap', async (req, res) => {
  try {
    const trucks = await Truck.find().sort('truckId');
    const entries = await YearEntry.find();

    const years = [...new Set(entries.map(e => e.year))].sort();
    const matrix = trucks.map(t => {
      const row = { truckId: t.truckId, driver: t.driver, endOfTerm: t.endOfTerm?.active };
      years.forEach(y => {
        const e = entries.find(e => e.truckId === t.truckId && e.year === y);
        row[y] = e ? { gross: e.gross, exp: e.exp, net: e.net, weeks: e.weeks } : null;
      });
      return row;
    });

    res.json({ years, matrix });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/full — full dashboard data in one call
router.get('/full', async (req, res) => {
  try {
    const [trucks, yearEntries, monthlyEntries, expenses, weeklyDaysAgg] = await Promise.all([
      Truck.find().sort('truckId'),
      YearEntry.find(),
      MonthlyEntry.find().sort('year month'),
      ExpenseBreakdown.find().sort('year'),
      WeeklyEntry.aggregate([
        { $group: { _id: { truckId: '$truckId', year: '$year' }, weeksWorked: { $sum: 1 } } }
      ])
    ]);

    // Build trucks object
    const trucksObj = {};
    const driversObj = {};
    const truckCostObj = {};
    const endOfTermObj = {};

    trucks.forEach(t => {
      trucksObj[t.truckId] = {};
      driversObj[t.truckId] = t.driver || '';
      if (t.cost) {
        truckCostObj[t.truckId] = t.cost;
      }
      if (t.endOfTerm?.active) {
        endOfTermObj[t.truckId] = { date: t.endOfTerm.date };
      }
    });

    yearEntries.forEach(ye => {
      if (!trucksObj[ye.truckId]) trucksObj[ye.truckId] = {};
      trucksObj[ye.truckId][ye.year] = { gross: ye.gross, exp: ye.exp, net: ye.net, weeks: ye.weeks };
    });

    // Build weeksWorked map from weekly entries aggregation (count of weeks where daysWorked is not N/A)
    const weeksWorkedMap = {};
    weeklyDaysAgg.forEach(d => {
      if (!weeksWorkedMap[d._id.truckId]) weeksWorkedMap[d._id.truckId] = {};
      weeksWorkedMap[d._id.truckId][d._id.year] = d.weeksWorked;
    });

    // Build monthly object
    const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const monthlyObj = {};
    monthlyEntries.forEach(me => {
      if (!monthlyObj[me.year]) monthlyObj[me.year] = [];
      monthlyObj[me.year].push(me);
    });

    const monthly = {};
    for (const y in monthlyObj) {
      const sorted = monthlyObj[y].sort((a, b) => MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month));
      monthly[y] = {
        labels: sorted.map(e => e.month),
        gross: sorted.map(e => e.gross),
        exp: sorted.map(e => e.exp)
      };
    }

    // Build yearly totals
    const yearlyTotals = {};
    yearEntries.forEach(ye => {
      if (!yearlyTotals[ye.year]) yearlyTotals[ye.year] = { gross: 0, exp: 0, net: 0 };
      yearlyTotals[ye.year].gross += ye.gross;
      yearlyTotals[ye.year].exp += ye.exp;
      yearlyTotals[ye.year].net += ye.net;
    });

    // Build expense breakdown
    const expBreakdown = {};
    let allMaint = 0, allOther = 0;
    expenses.forEach(e => {
      expBreakdown[e.year] = { maint: e.maint, other: e.other };
      allMaint += e.maint;
      allOther += e.other;
    });
    expBreakdown.all = { maint: allMaint, other: allOther };

    // Build combined monthly for 'all'
    const allLabels = [], allGross = [], allExp = [];
    const sortedYears = Object.keys(monthly).sort();
    sortedYears.forEach(y => {
      const m = monthly[y];
      const suffix = " '" + String(y).slice(-2);
      m.labels.forEach((l, i) => {
        allLabels.push(l + suffix);
        allGross.push(m.gross[i]);
        allExp.push(m.exp[i]);
      });
    });
    monthly.all = { labels: allLabels, gross: allGross, exp: allExp };

    res.json({
      trucks: trucksObj,
      drivers: driversObj,
      truckCost: truckCostObj,
      endOfTerm: endOfTermObj,
      weeksWorked: weeksWorkedMap,
      monthly,
      yearlyTotals,
      expBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
