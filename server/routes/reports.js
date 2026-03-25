const router = require('express').Router();
const YearEntry = require('../models/YearEntry');
const MonthlyEntry = require('../models/MonthlyEntry');
const Truck = require('../models/Truck');
const ExpenseBreakdown = require('../models/ExpenseBreakdown');

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

    const entries = await YearEntry.find(filter);
    const trucks = await Truck.find();

    let totalGross = 0, totalExp = 0, totalNet = 0;
    const truckSummary = {};

    entries.forEach(e => {
      totalGross += e.gross;
      totalExp += e.exp;
      totalNet += e.net;
      if (!truckSummary[e.truckId]) truckSummary[e.truckId] = { gross: 0, exp: 0, net: 0 };
      truckSummary[e.truckId].gross += e.gross;
      truckSummary[e.truckId].exp += e.exp;
      truckSummary[e.truckId].net += e.net;
    });

    const ranked = Object.entries(truckSummary)
      .map(([id, s]) => ({ truckId: id, ...s }))
      .sort((a, b) => b.net - a.net);

    res.json({
      totalGross,
      totalExp,
      totalNet,
      truckCount: trucks.length,
      topPerformer: ranked[0] || null,
      bottomPerformer: ranked[ranked.length - 1] || null,
      truckRanking: ranked
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
