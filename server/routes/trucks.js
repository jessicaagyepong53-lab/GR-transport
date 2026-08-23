const router = require('express').Router();
const Truck = require('../models/Truck');
const YearEntry = require('../models/YearEntry');
const MonthlyEntry = require('../models/MonthlyEntry');
const WeeklyEntry = require('../models/WeeklyEntry');
const ExpenseBreakdown = require('../models/ExpenseBreakdown');
const Trash = require('../models/Trash');
const { requireAdmin, touchLastSaved } = require('../middleware/auth');
const { asyncHandler, AppError, requireFields, toYear, toTruckId, toNumber } = require('../utils/errors');

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

// Validates/normalizes a cost object — never trusts raw client numbers.
function parseCost(cost = {}) {
  return {
    initialValue: toNumber(cost.initialValue, 'cost.initialValue', { allowNegative: false }),
    pricePaid: toNumber(cost.pricePaid, 'cost.pricePaid', { allowNegative: false }),
    insurance: toNumber(cost.insurance, 'cost.insurance', { allowNegative: false }),
    maintenanceCost: toNumber(cost.maintenanceCost, 'cost.maintenanceCost', { allowNegative: false }),
    initialPayment: toNumber(cost.initialPayment, 'cost.initialPayment', { allowNegative: false }),
    initialPaymentNotes: cost.initialPaymentNotes ? String(cost.initialPaymentNotes) : '',
    paymentsMade: toNumber(cost.paymentsMade, 'cost.paymentsMade', { allowNegative: false })
  };
}

// Recompute fleet-wide ExpenseBreakdown + MonthlyEntry for a year
async function recomputeFleetAggregates(year) {
  const allWeekly = await WeeklyEntry.aggregate([
    { $match: { year } },
    { $group: { _id: null, maint: { $sum: '$maint' }, other: { $sum: '$other' } } }
  ]);
  if (allWeekly.length) {
    await ExpenseBreakdown.findOneAndUpdate({ year }, { maint: allWeekly[0].maint, other: allWeekly[0].other }, { upsert: true });
  } else {
    await ExpenseBreakdown.deleteOne({ year });
  }

  const allEntries = await WeeklyEntry.find({ year });
  const monthMap = {};
  allEntries.forEach(e => {
    const mon = getWeekMonth(year, e.week);
    if (!monthMap[mon]) monthMap[mon] = { gross: 0, exp: 0 };
    monthMap[mon].gross += e.gross || 0;
    monthMap[mon].exp += (e.maint || 0) + (e.other || 0);
  });

  await MonthlyEntry.deleteMany({ year, truckId: '_fleet', month: { $nin: Object.keys(monthMap) } });
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
}

// GET /api/trucks — list all trucks
router.get('/', asyncHandler(async (req, res) => {
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
      purchaseYear: t.purchaseYear,
      cost: t.cost,
      paymentEntries: t.paymentEntries || [],
      endOfTerm: t.endOfTerm,
      sheetNotes: t.sheetNotes || [],
      years
    };
  });

  res.json(result);
}));

// POST /api/trucks — add a truck
router.post('/', requireAdmin, asyncHandler(async (req, res) => {
  requireFields(req.body, ['truckId']);
  const truckId = toTruckId(req.body.truckId);
  const driver = req.body.driver ? String(req.body.driver).trim() : '';
  const cost = req.body.cost
    ? parseCost(req.body.cost)
    : { initialValue: 0, pricePaid: 0, insurance: 0, maintenanceCost: 0 };
  const endOfTerm = req.body.endOfTerm || { active: false, date: '' };
  const { yearEntry } = req.body;

  const existing = await Truck.findOne({ truckId });
  if (existing) throw new AppError('A truck with that ID already exists', 409);

  const truck = await Truck.create({ truckId, driver, cost, endOfTerm });

  // Optionally create initial year entry
  if (yearEntry && yearEntry.year) {
    const year = toYear(yearEntry.year);
    const gross = toNumber(yearEntry.gross, 'yearEntry.gross', { allowNegative: false });
    const exp = toNumber(yearEntry.exp, 'yearEntry.exp', { allowNegative: false });
    const weeks = toNumber(yearEntry.weeks, 'yearEntry.weeks', { allowNegative: false, max: 53 });
    await YearEntry.create({ truckId, year, gross, exp, net: gross - exp, weeks });
  }

  await touchLastSaved();
  res.status(201).json(truck);
}));

// GET /api/trucks/:id — get single truck with all year data
router.get('/:id', asyncHandler(async (req, res) => {
  const truck = await Truck.findOne({ truckId: req.params.id });
  if (!truck) throw new AppError('Truck not found', 404);

  const yearEntries = await YearEntry.find({ truckId: truck.truckId }).sort('year');
  const years = {};
  yearEntries.forEach(ye => {
    years[ye.year] = { gross: ye.gross, exp: ye.exp, net: ye.net, weeks: ye.weeks };
  });

  res.json({ ...truck.toObject(), years });
}));

// PUT /api/trucks/:id — update truck settings (including rename)
router.put('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const { driver, cost, endOfTerm, newTruckId } = req.body;
  const truck = await Truck.findOne({ truckId: req.params.id });
  if (!truck) throw new AppError('Truck not found', 404);

  // Handle rename
  if (newTruckId !== undefined) {
    const cleanId = toTruckId(newTruckId, 'newTruckId');
    if (cleanId !== truck.truckId) {
      const existing = await Truck.findOne({ truckId: cleanId });
      if (existing) throw new AppError('A truck with that name already exists', 409);
      const oldId = truck.truckId;
      // Update truckId in ALL related collections
      await YearEntry.updateMany({ truckId: oldId }, { truckId: cleanId });
      await MonthlyEntry.updateMany({ truckId: oldId }, { truckId: cleanId });
      await WeeklyEntry.updateMany({ truckId: oldId }, { truckId: cleanId });
      truck.truckId = cleanId;
    }
  }

  if (driver !== undefined) truck.driver = String(driver).trim();
  if (cost) {
    const existingCost = truck.cost?.toObject?.() || truck.cost || {};
    truck.cost = parseCost({ ...existingCost, ...cost });
  }
  if (req.body.paymentEntries !== undefined) {
    if (!Array.isArray(req.body.paymentEntries)) throw new AppError('paymentEntries must be an array', 400);
    truck.paymentEntries = req.body.paymentEntries.map((e, i) => ({
      label: e.label ? String(e.label) : `Payment ${i + 1}`,
      amount: toNumber(e.amount, `paymentEntries[${i}].amount`, { allowNegative: false }),
      notes: e.notes ? String(e.notes) : ''
    }));
  }
  if (req.body.sheetNotes !== undefined) {
    if (!Array.isArray(req.body.sheetNotes)) throw new AppError('sheetNotes must be an array', 400);
    truck.sheetNotes = req.body.sheetNotes.map(String);
  }
  if (endOfTerm !== undefined) truck.endOfTerm = endOfTerm;

  await truck.save();
  await touchLastSaved();
  res.json(truck);
}));

// DELETE /api/trucks/:id — soft-delete to trash
router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const truck = await Truck.findOne({ truckId: req.params.id });
  if (!truck) throw new AppError('Truck not found', 404);

  const yearEntries = await YearEntry.find({ truckId: truck.truckId });
  const weeklyEntries = await WeeklyEntry.find({ truckId: truck.truckId });

  await Trash.create({
    type: 'truck',
    label: truck.truckId,
    data: {
      truck: truck.toObject(),
      yearEntries: yearEntries.map(ye => ye.toObject()),
      weeklyEntries: weeklyEntries.map(we => we.toObject())
    }
  });

  // Collect affected years before deleting
  const affectedYears = [...new Set(weeklyEntries.map(e => e.year))];

  await YearEntry.deleteMany({ truckId: truck.truckId });
  await WeeklyEntry.deleteMany({ truckId: truck.truckId });
  await truck.deleteOne();

  // Recompute fleet-wide aggregates for each affected year
  for (const year of affectedYears) {
    await recomputeFleetAggregates(year);
  }

  await touchLastSaved();
  res.json({ success: true, message: `Truck ${req.params.id} moved to trash` });
}));

// GET /api/trucks/:id/years — get truck's year entries
router.get('/:id/years', asyncHandler(async (req, res) => {
  const entries = await YearEntry.find({ truckId: req.params.id }).sort('year');
  res.json(entries);
}));

// POST /api/trucks/:id/years — add year entry
router.post('/:id/years', requireAdmin, asyncHandler(async (req, res) => {
  requireFields(req.body, ['year']);
  const year = toYear(req.body.year);
  const gross = toNumber(req.body.gross, 'gross', { allowNegative: false });
  const exp = toNumber(req.body.exp, 'exp', { allowNegative: false });
  const update = { gross, exp, net: gross - exp };
  if (req.body.weeks !== undefined) {
    update.weeks = toNumber(req.body.weeks, 'weeks', { allowNegative: false, max: 53 });
  }

  const entry = await YearEntry.findOneAndUpdate(
    { truckId: req.params.id, year },
    update,
    { upsert: true, new: true }
  );

  await touchLastSaved();
  res.status(201).json(entry);
}));

// PUT /api/trucks/:id/years/:year — update year entry
router.put('/:id/years/:year', requireAdmin, asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const gross = toNumber(req.body.gross, 'gross', { allowNegative: false });
  const exp = toNumber(req.body.exp, 'exp', { allowNegative: false });
  const update = { gross, exp, net: gross - exp };
  if (req.body.weeks !== undefined) {
    update.weeks = toNumber(req.body.weeks, 'weeks', { allowNegative: false, max: 53 });
  }

  const entry = await YearEntry.findOneAndUpdate(
    { truckId: req.params.id, year },
    update,
    { new: true }
  );

  if (!entry) throw new AppError('Year entry not found', 404);
  await touchLastSaved();
  res.json(entry);
}));

// DELETE /api/trucks/:id/years/:year — delete year entry
router.delete('/:id/years/:year', requireAdmin, asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const entry = await YearEntry.findOneAndDelete({ truckId: req.params.id, year });

  if (!entry) throw new AppError('Year entry not found', 404);

  await Trash.create({
    type: 'yearEntry',
    label: `${req.params.id} / ${year}`,
    data: entry.toObject()
  });

  res.json({ success: true });
}));

module.exports = router;