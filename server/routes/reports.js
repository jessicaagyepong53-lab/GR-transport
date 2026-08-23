const router = require('express').Router();
const YearEntry = require('../models/YearEntry');
const MonthlyEntry = require('../models/MonthlyEntry');
const Truck = require('../models/Truck');
const ExpenseBreakdown = require('../models/ExpenseBreakdown');
const SalaryPayment = require('../models/SalaryPayment');
const QuarterlyTax = require('../models/QuarterlyTax');
const { asyncHandler, toYear } = require('../utils/errors');

// GET /api/reports/export?format=csv|json&year=
router.get('/export', asyncHandler(async (req, res) => {
  const format = req.query.format || 'json';
  const yearFilter = req.query.year && req.query.year !== 'all' ? toYear(req.query.year) : null;

  const [trucks, yearEntries, monthlyEntries, expenses, salaryPayments, quarterlyTaxes] = await Promise.all([
    Truck.find().sort('truckId').lean(),
    yearFilter ? YearEntry.find({ year: yearFilter }).lean() : YearEntry.find().lean(),
    yearFilter ? MonthlyEntry.find({ year: yearFilter }).lean() : MonthlyEntry.find().lean(),
    yearFilter ? ExpenseBreakdown.find({ year: yearFilter }).lean() : ExpenseBreakdown.find().lean(),
    yearFilter ? SalaryPayment.find({ year: yearFilter }).sort('datePaid').lean() : SalaryPayment.find().sort('year datePaid').lean(),
    yearFilter
      ? QuarterlyTax.find({ truckId: '_fleet', year: yearFilter }).sort('quarter').lean()
      : QuarterlyTax.find({ truckId: '_fleet' }).sort('year quarter').lean()
  ]);

  if (format === 'csv') {
    let csv = 'Section,TruckID,Year,Month,Week,Date,Gross,Expenditure,Net,Weeks,Amount\n';

    yearEntries.forEach(e => {
      csv += `YearEntry,${e.truckId},${e.year},,,,${e.gross},${e.exp},${e.net},${e.weeks},\n`;
    });

    monthlyEntries.forEach(e => {
      csv += `Monthly,${e.truckId || '_fleet'},${e.year},${e.month},,,${e.gross},${e.exp},,,\n`;
    });

    expenses.forEach(e => {
      csv += `Expense,,${e.year},,,,${e.maint},${e.other},,,\n`;
    });

    salaryPayments.forEach(e => {
      const datePaid = e.datePaid || '';
      const week = e.week || '';
      csv += `SalaryPayment,_fleet,${e.year || ''},,${week},${datePaid},,,,,${e.amount || 0}\n`;
    });

    quarterlyTaxes.forEach(e => {
      csv += `IncomeTax,_fleet,${e.year || ''},,Q${e.quarter || ''},,,,,,${e.amount || 0}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=gr-transport-report${yearFilter ? '-' + yearFilter : ''}.csv`);
    return res.send(csv);
  }

  // JSON export
  res.json({ trucks, yearEntries, monthlyEntries, expenses, salaryPayments, quarterlyTaxes });
}));

// GET /api/reports/summary?year=
router.get('/summary', asyncHandler(async (req, res) => {
  const yearFilter = req.query.year && req.query.year !== 'all' ? toYear(req.query.year) : null;
  const filter = yearFilter ? { year: yearFilter } : {};

  const [entries, trucks, expBreakdowns, salaryPayments, quarterlyTaxes] = await Promise.all([
    YearEntry.find(filter),
    Truck.find().lean(),
    ExpenseBreakdown.find(filter),
    SalaryPayment.find(yearFilter ? { year: yearFilter } : {}).lean(),
    QuarterlyTax.find(yearFilter ? { truckId: '_fleet', year: yearFilter } : { truckId: '_fleet' }).lean()
  ]);

  let totalGross = 0, totalExp = 0, totalNet = 0;
  const truckSummary = {};

  entries.forEach(e => {
    if (!truckSummary[e.truckId]) truckSummary[e.truckId] = { gross: 0, exp: 0, net: 0, weeks: 0 };
    truckSummary[e.truckId].gross += e.gross;
    truckSummary[e.truckId].exp += e.exp;
    truckSummary[e.truckId].net += e.net;
    truckSummary[e.truckId].weeks += (e.weeks || 0);
  });

  // Build truck cost lookup and EOT lookup (year-aware)
  const truckCostMap = {};
  const truckEOTMap = {};
  trucks.forEach(t => {
    if (t.cost) truckCostMap[t.truckId] = t.cost;
    if (t.endOfTerm?.active && t.endOfTerm.date) {
      const eotYear = parseInt(t.endOfTerm.date.slice(0, 4));
      if (!yearFilter || yearFilter >= eotYear) {
        truckEOTMap[t.truckId] = true;
      }
    } else if (t.endOfTerm?.active) {
      truckEOTMap[t.truckId] = true;
    }
  });

  // Compute ratio for ranking (lower ratio = better)
  const ranked = Object.entries(truckSummary)
    .map(([id, s]) => {
      const totalAmount = s.gross;
      const pctExp = totalAmount ? Math.round(s.exp / totalAmount * 100) : 0;
      const pctIncome = totalAmount ? Math.round(s.net / totalAmount * 100) : 0;
      const ratio = s.net ? parseFloat((s.exp / s.net).toFixed(2)) : 0;
      const avgIncome = s.weeks ? parseFloat((s.net / s.weeks).toFixed(2)) : 0;
      const cost = truckCostMap[id] || null;
      const eot = !!truckEOTMap[id];
      return { truckId: id, ...s, totalAmount, pctExp, pctIncome, ratio, avgIncome, cost, eot };
    })
    .sort((a, b) => a.ratio - b.ratio);

  // Assign ranks — all trucks get ranked (EOT trucks still contributed data)
  ranked.forEach((t, i) => { t.rank = i + 1; });

  // Compute fleet totals including ALL trucks (EOT trucks still have real data)
  ranked.forEach(t => {
    totalGross += t.gross;
    totalExp += t.exp;
    totalNet += t.net;
  });

  const eotCount = ranked.filter(t => t.eot).length;
  const activeCount = ranked.length - eotCount;

  // Expense breakdown (fleet-wide)
  let totalMaint = 0, totalOther = 0, totalSupervisorSalary = 0, totalIncomeTax = 0;
  const salaryPaymentsByYear = {};
  salaryPayments.forEach(p => {
    if (!salaryPaymentsByYear[p.year]) salaryPaymentsByYear[p.year] = [];
    salaryPaymentsByYear[p.year].push(p);
  });
  expBreakdowns.forEach(e => {
    const payments = salaryPaymentsByYear[e.year] || [];
    const yearSalaryTotal = payments.length
      ? payments.reduce((sum, p) => sum + (p.amount || 0), 0)
      : (e.supervisorSalary || 0);
    totalMaint += (e.maint || 0);
    totalOther += (e.other || 0);
    totalSupervisorSalary += yearSalaryTotal;
  });

  quarterlyTaxes.forEach(t => {
    totalIncomeTax += (t.amount || 0);
  });

  // Add supervisor salary to expenditure (separate fleet cost not in YearEntry data).
  // Income tax is already included in YearEntry exp from Excel — do NOT add again.
  // Salary is only ever added to expenditure here — it is intentionally NOT
  // subtracted from totalNet, so Total Net Income stays as the sum of each
  // truck's own operating net (matching the per-truck rows shown in Reports).
  totalExp += totalSupervisorSalary;

  // Allocate minor/major per truck proportionally
  ranked.forEach(t => {
    if (totalExp > 0) {
      const share = t.exp / totalExp;
      t.minorExp = Math.round(totalMaint * share);
      t.majorExp = Math.round(totalOther * share);
    } else {
      t.minorExp = 0;
      t.majorExp = 0;
    }
  });

  res.json({
    totalGross,
    totalExp,
    totalNet,
    truckCount: trucks.length,
    activeCount,
    eotCount,
    topPerformer: ranked[0] || null,
    bottomPerformer: ranked[ranked.length - 1] || null,
    truckRanking: ranked,
    expBreakdown: {
      maint: totalMaint,
      other: totalOther,
      supervisorSalary: totalSupervisorSalary,
      incomeTax: totalIncomeTax
    }
  });
}));

module.exports = router;