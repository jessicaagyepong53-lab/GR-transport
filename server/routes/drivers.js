const router = require('express').Router();
const Truck = require('../models/Truck');
const { requireAdmin } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errors');

// GET /api/drivers — all driver assignments
router.get('/', asyncHandler(async (req, res) => {
  const trucks = await Truck.find().sort('truckId');
  const drivers = trucks.map(t => ({
    truckId: t.truckId,
    driver: t.driver || '',
    driverNotes: t.driverNotes || ''
  }));
  res.json(drivers);
}));

// GET /api/drivers/:truckId
router.get('/:truckId', asyncHandler(async (req, res) => {
  const truck = await Truck.findOne({ truckId: req.params.truckId });
  if (!truck) throw new AppError('Truck not found', 404);
  res.json({ truckId: truck.truckId, driver: truck.driver });
}));

// PUT /api/drivers/:truckId — update driver assignment
router.put('/:truckId', requireAdmin, asyncHandler(async (req, res) => {
  const { driver, driverNotes, startDates, endOfTerm } = req.body;
  const update = { driver: driver !== undefined ? String(driver).trim() : '' };
  if (driverNotes !== undefined) update.driverNotes = String(driverNotes);
  if (startDates !== undefined) {
    if (typeof startDates !== 'object' || startDates === null || Array.isArray(startDates)) {
      throw new AppError('startDates must be an object keyed by year', 400);
    }
    update.startDates = startDates;
  }
  if (endOfTerm !== undefined) update.endOfTerm = endOfTerm;

  const truck = await Truck.findOneAndUpdate({ truckId: req.params.truckId }, update, { new: true });
  if (!truck) throw new AppError('Truck not found', 404);
  res.json({ truckId: truck.truckId, driver: truck.driver, driverNotes: truck.driverNotes || '' });
}));

module.exports = router;