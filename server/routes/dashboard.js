const router = require('express').Router();
const YearEntry = require('../models/YearEntry');
const MonthlyEntry = require('../models/MonthlyEntry');
const ExpenseBreakdown = require('../models/ExpenseBreakdown');
const Truck = require('../models/Truck');
const WeeklyEntry = require('../models/WeeklyEntry');
const SalaryPayment = require('../models/SalaryPayment');
const QuarterlyTax = require('../models/QuarterlyTax');
const { getLastSaved } = require('../middleware/auth');
const { asyncHandler, toYear } = require('../utils/errors');

// GET /api/dashboard/kpis?year= — computed KPIs
router.get('/kpis', asyncHandler(async (req, res) => {
  const yearParam = req.query.year;
  const yearNum = yearParam && yearParam !== 'all' ? toYear(yearParam) : null;
  const filter = yearNum ? { year: yearNum } : {};

  const [entries, expBreakdowns, salaryPayments, quarterlyTaxes] = await Promise.all([
    YearEntry.find(filter),
    ExpenseBreakdown.find(filter),
    SalaryPayment.find(filter).lean(),
    QuarterlyTax.find({ truckId: '_fleet', ...filter }).lean()
  ]);

  let gross = 0, exp = 0, net = 0, weeks = 0;
  entries.forEach(e => {
    gross += e.gross;
    exp += e.exp;
    net += e.net;   // truck-level net
    weeks += e.weeks;
  });

  // Add fleet-level costs to expenditure only — net stays as truck-level figure
  const salaryByYear = {};
  salaryPayments.forEach(p => {
    if (!salaryByYear[p.year]) salaryByYear[p.year] = 0;
    salaryByYear[p.year] += (p.amount || 0);
  });
  let supervisorSalary = 0, incomeTax = 0;
  expBreakdowns.forEach(e => {
    supervisorSalary += salaryByYear[e.year] !== undefined
      ? salaryByYear[e.year]
      : (e.supervisorSalary || 0);
  });
  quarterlyTaxes.forEach(t => { incomeTax += (t.amount || 0); });
  // Add supervisor salary only — income tax is already in YearEntry exp from Excel.
  // Salary is intentionally added to expenditure ONLY, not subtracted from net.
  exp += supervisorSalary;

  const eff = gross ? Math.round(net / gross * 100) : 0;
  const avgWeek = weeks ? Math.round(gross / weeks) : 0;

  res.json({ gross, exp, net, weeks, eff, avgWeek });
}));

// GET /api/dashboard/yearly-totals — yearly totals
router.get('/yearly-totals', asyncHandler(async (req, res) => {
  const entries = await YearEntry.find();
  const totals = {};
  entries.forEach(e => {
    if (!totals[e.year]) totals[e.year] = { gross: 0, exp: 0, net: 0 };
    totals[e.year].gross += e.gross;
    totals[e.year].exp += e.exp;
    totals[e.year].net += e.net;
  });
  res.json(totals);
}));

// GET /api/dashboard/heatmap — Truck×Year net matrix
router.get('/heatmap', asyncHandler(async (req, res) => {
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
}));

// GET /api/dashboard/full — full dashboard data in one call
router.get('/full', asyncHandler(async (req, res) => {
  const [trucks, yearEntries, monthlyEntries, expenses, salaryPayments, quarterlyTaxes, weeklyDaysAgg, lastSaved] = await Promise.all([
    Truck.find().sort('truckId'),
    YearEntry.find(),
    MonthlyEntry.find().sort('year month'),
    ExpenseBreakdown.find().sort('year'),
    SalaryPayment.find().sort('year datePaid'),
    QuarterlyTax.find({ truckId: '_fleet' }).lean(),
    WeeklyEntry.aggregate([
      { $group: { _id: { truckId: '$truckId', year: '$year' }, weeksWorked: { $sum: 1 } } }
    ]),
    getLastSaved()
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
      truckCostObj[t.truckId] = {
        ...(t.cost.toObject ? t.cost.toObject() : t.cost),
        paymentEntries: t.paymentEntries || []
      };
    }
    if (t.endOfTerm?.active) {
      endOfTermObj[t.truckId] = { date: t.endOfTerm.date };
    }
  });

  yearEntries.forEach(ye => {
    if (!trucksObj[ye.truckId]) trucksObj[ye.truckId] = {};
    trucksObj[ye.truckId][ye.year] = { gross: ye.gross, exp: ye.exp, net: ye.net, weeks: ye.weeks };
  });

  // Build weeksWorked map from weekly entries aggregation
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

  // Build yearly totals (operational only first)
  const yearlyTotals = {};
  yearEntries.forEach(ye => {
    if (!yearlyTotals[ye.year]) yearlyTotals[ye.year] = { gross: 0, exp: 0, net: 0 };
    yearlyTotals[ye.year].gross += ye.gross;
    yearlyTotals[ye.year].exp += ye.exp;
    yearlyTotals[ye.year].net += ye.net;
  });

  const salaryTotals = {};
  expenses.forEach(e => {
    const payments = salaryPayments.filter(p => p.year === e.year);
    salaryTotals[e.year] = payments.length
      ? payments.reduce((sum, p) => sum + (p.amount || 0), 0)
      : (e.supervisorSalary || 0);
  });
  salaryTotals.all = Object.values(salaryTotals).reduce((sum, value) => sum + (value || 0), 0);

  // Build income tax totals per year
  const incomeTaxTotals = {};
  quarterlyTaxes.forEach(t => {
    if (!incomeTaxTotals[t.year]) incomeTaxTotals[t.year] = 0;
    incomeTaxTotals[t.year] += (t.amount || 0);
  });
  incomeTaxTotals.all = Object.values(incomeTaxTotals).reduce((sum, v) => sum + v, 0);

  // Build expense breakdown
  const expBreakdown = {};
  let allMaint = 0, allOther = 0, allSupervisorSalary = 0;
  expenses.forEach(e => {
    expBreakdown[e.year] = {
      maint: e.maint,
      other: e.other,
      supervisorSalary: salaryTotals[e.year] || 0
    };
    allMaint += e.maint;
    allOther += e.other;
    allSupervisorSalary += salaryTotals[e.year] || 0;
  });
  expBreakdown.all = { maint: allMaint, other: allOther, supervisorSalary: allSupervisorSalary };

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
    salaryTotals,
    incomeTaxTotals,
    expBreakdown,
    lastSaved
  });
}));

module.exports = router;