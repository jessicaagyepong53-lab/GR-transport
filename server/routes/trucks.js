const router = require('express').Router();
const Truck = require('../models/Truck');
const YearEntry = require('../models/YearEntry');
const MonthlyEntry = require('../models/MonthlyEntry');
const WeeklyEntry = require('../models/WeeklyEntry');
const Trash = require('../models/Trash');
const { requireAdmin } = require('../middleware/auth');

// GET /api/trucks — list all trucks
router.get('/', async (req, res) => {
  try {
    const trucks = await Truck.find().sort('truckId');
    const yearEntries = await YearEntry.find();

    const result = trucks.map(t => {
      const years = {};
      yearEntries
        .filter(ye => ye.truckId === t.truckId)
        .forEach(ye => {
          years[ye.year] = { gross: ye.gross, exp: ye.exp, net: ye.net, weeks: ye.weeks };
        });
      return {
        truckId: t.truckId,
        driver: t.driver,
        driverNotes: t.driverNotes || '',
        startDates: t.startDates || {},
        cost: t.cost,
        endOfTerm: t.endOfTerm,
        years
      };
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trucks — add a truck
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { truckId, driver, cost, endOfTerm, yearEntry } = req.body;
    if (!truckId) return res.status(400).json({ error: 'truckId required' });

    const existing = await Truck.findOne({ truckId: truckId.trim().toUpperCase() });
    if (existing) return res.status(409).json({ error: 'Truck already exists' });

    const truck = await Truck.create({
      truckId: truckId.trim().toUpperCase(),
      driver: driver || '',
      cost: cost || { initialValue: 0, pricePaid: 0, maintenanceCost: 0 },
      endOfTerm: endOfTerm || { active: false, date: '' }
    });

    // Optionally create initial year entry
    if (yearEntry && yearEntry.year) {
      await YearEntry.create({
        truckId: truck.truckId,
        year: yearEntry.year,
        gross: yearEntry.gross || 0,
        exp: yearEntry.exp || 0,
        net: (yearEntry.gross || 0) - (yearEntry.exp || 0),
        weeks: yearEntry.weeks || 0
      });
    }

    res.status(201).json(truck);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trucks/:id — get single truck with all year data
router.get('/:id', async (req, res) => {
  try {
    const truck = await Truck.findOne({ truckId: req.params.id });
    if (!truck) return res.status(404).json({ error: 'Truck not found' });

    const yearEntries = await YearEntry.find({ truckId: truck.truckId }).sort('year');
    const years = {};
    yearEntries.forEach(ye => {
      years[ye.year] = { gross: ye.gross, exp: ye.exp, net: ye.net, weeks: ye.weeks };
    });

    res.json({ ...truck.toObject(), years });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/trucks/:id — update truck settings (including rename)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { driver, cost, endOfTerm, newTruckId } = req.body;
    const truck = await Truck.findOne({ truckId: req.params.id });
    if (!truck) return res.status(404).json({ error: 'Truck not found' });

    // Handle rename
    if (newTruckId && newTruckId.trim().toUpperCase() !== truck.truckId) {
      const cleanId = newTruckId.trim().toUpperCase();
      const existing = await Truck.findOne({ truckId: cleanId });
      if (existing) return res.status(409).json({ error: 'A truck with that name already exists' });
      const oldId = truck.truckId;
      // Update truckId in ALL related collections
      await YearEntry.updateMany({ truckId: oldId }, { truckId: cleanId });
      await MonthlyEntry.updateMany({ truckId: oldId }, { truckId: cleanId });
      await WeeklyEntry.updateMany({ truckId: oldId }, { truckId: cleanId });
      truck.truckId = cleanId;
    }

    if (driver !== undefined) truck.driver = driver;
    if (cost) truck.cost = { ...truck.cost.toObject?.() || truck.cost, ...cost };
    if (endOfTerm !== undefined) truck.endOfTerm = endOfTerm;

    await truck.save();
    res.json(truck);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trucks/:id — soft-delete to trash
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const truck = await Truck.findOne({ truckId: req.params.id });
    if (!truck) return res.status(404).json({ error: 'Truck not found' });

    const yearEntries = await YearEntry.find({ truckId: truck.truckId });

    await Trash.create({
      type: 'truck',
      label: truck.truckId,
      data: {
        truck: truck.toObject(),
        yearEntries: yearEntries.map(ye => ye.toObject())
      }
    });

    await YearEntry.deleteMany({ truckId: truck.truckId });
    await truck.deleteOne();

    res.json({ success: true, message: `Truck ${req.params.id} moved to trash` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/trucks/:id/years — get truck's year entries
router.get('/:id/years', async (req, res) => {
  try {
    const entries = await YearEntry.find({ truckId: req.params.id }).sort('year');
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/trucks/:id/years — add year entry
router.post('/:id/years', requireAdmin, async (req, res) => {
  try {
    const { year, gross, exp, weeks } = req.body;
    if (!year) return res.status(400).json({ error: 'year required' });

    const entry = await YearEntry.findOneAndUpdate(
      { truckId: req.params.id, year },
      { gross: gross || 0, exp: exp || 0, net: (gross || 0) - (exp || 0), weeks: weeks || 0 },
      { upsert: true, new: true }
    );

    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/trucks/:id/years/:year — update year entry
router.put('/:id/years/:year', requireAdmin, async (req, res) => {
  try {
    const { gross, exp, weeks } = req.body;
    const entry = await YearEntry.findOneAndUpdate(
      { truckId: req.params.id, year: parseInt(req.params.year) },
      { gross: gross || 0, exp: exp || 0, net: (gross || 0) - (exp || 0), weeks: weeks || 0 },
      { new: true }
    );

    if (!entry) return res.status(404).json({ error: 'Year entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/trucks/:id/years/:year — delete year entry
router.delete('/:id/years/:year', requireAdmin, async (req, res) => {
  try {
    const entry = await YearEntry.findOneAndDelete({
      truckId: req.params.id,
      year: parseInt(req.params.year)
    });

    if (!entry) return res.status(404).json({ error: 'Year entry not found' });

    await Trash.create({
      type: 'yearEntry',
      label: `${req.params.id} / ${req.params.year}`,
      data: entry.toObject()
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
