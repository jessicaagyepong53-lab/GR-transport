const router = require('express').Router();
const YearEntry = require('../models/YearEntry');
const MonthlyEntry = require('../models/MonthlyEntry');
const Truck = require('../models/Truck');
const ExpenseBreakdown = require('../models/ExpenseBreakdown');
const QuarterlyTax = require('../models/QuarterlyTax');

// GET /api/reports/export?format=csv|json&year=
router.get('/export', async (req, res) => {
  try {
    const format = req.query.format || 'json';
    const yearFilter = req.query.year && req.query.year !== 'all' ? parseInt(req.query.year) : null;

    const [trucks, yearEntries, monthlyEntries, expenses] = await Promise.all([
      Truck.find().sort('truckId').lean(),
      yearFilter ? YearEntry.find({ year: yearFilter }).lean() : YearEntry.find().lean(),
      yearFilter ? MonthlyEntry.find({ year: yearFilter }).lean() : MonthlyEntry.find().lean(),
      yearFilter ? ExpenseBreakdown.find({ year: yearFilter }).lean() : ExpenseBreakdown.find().lean()
    ]);

    if (format === 'csv') {
      let csv = 'Section,TruckID,Year,Month,Gross,Expenditure,Net,Weeks\n';

      yearEntries.forEach(e => {
        csv += `YearEntry,${e.truckId},${e.year},,${e.gross},${e.exp},${e.net},${e.weeks}\n`;
      });

      monthlyEntries.forEach(e => {
        csv += `Monthly,${e.truckId || '_fleet'},${e.year},${e.month},${e.gross},${e.exp},,\n`;
      });

      expenses.forEach(e => {
        csv += `Expense,,${e.year},,${e.maint},${e.other},,\n`;
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=gr-transport-report${yearFilter ? '-' + yearFilter : ''}.csv`);
      return res.send(csv);
    }

    // JSON export
    res.json({ trucks, yearEntries, monthlyEntries, expenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/reports/summary?year=
router.get('/summary', async (req, res) => {
  try {
    const yearFilter = req.query.year && req.query.year !== 'all' ? parseInt(req.query.year) : null;
    const filter = yearFilter ? { year: yearFilter } : {};

    const [entries, trucks, expBreakdowns, qTaxEntries] = await Promise.all([
      YearEntry.find(filter),
      Truck.find().lean(),
      ExpenseBreakdown.find(filter),
      QuarterlyTax.find({ truckId: '_fleet', ...filter })
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
        // Only mark as EOT if viewing that year or later (or all years)
        if (!yearFilter || yearFilter >= eotYear) {
          truckEOTMap[t.truckId] = true;
        }
      } else if (t.endOfTerm?.active) {
        // No date — fallback to always EOT
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

    // Add quarterly income tax as a fleet-level expenditure
    let totalQTax = 0;
    qTaxEntries.forEach(e => { totalQTax += e.amount || 0; });
    totalExp += totalQTax;
    totalNet -= totalQTax;
    const eotCount = ranked.filter(t => t.eot).length;
    const activeCount = ranked.length - eotCount;

    // Expense breakdown (fleet-wide)
    let totalMaint = 0, totalOther = 0;
    expBreakdowns.forEach(e => {
      totalMaint += (e.maint || 0);
      totalOther += (e.other || 0);
    });

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
      totalQTax,
      truckCount: trucks.length,
      activeCount,
      eotCount,
      topPerformer: ranked[0] || null,
      bottomPerformer: ranked[ranked.length - 1] || null,
      truckRanking: ranked,
      expBreakdown: { maint: totalMaint, other: totalOther }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
