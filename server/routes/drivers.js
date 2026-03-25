const router = require('express').Router();
const Truck = require('../models/Truck');
const { requireAdmin } = require('../middleware/auth');

// GET /api/drivers — all driver assignments
router.get('/', async (req, res) => {
  try {
    const trucks = await Truck.find().sort('truckId');
    const drivers = trucks.map(t => ({
      truckId: t.truckId,
      driver: t.driver || ''
    }));
    res.json(drivers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/drivers/:truckId
router.get('/:truckId', async (req, res) => {
  try {
    const truck = await Truck.findOne({ truckId: req.params.truckId });
    if (!truck) return res.status(404).json({ error: 'Truck not found' });
    res.json({ truckId: truck.truckId, driver: truck.driver });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/drivers/:truckId — update driver assignment
router.put('/:truckId', requireAdmin, async (req, res) => {
  try {
    const { driver } = req.body;
    const truck = await Truck.findOneAndUpdate(
      { truckId: req.params.truckId },
      { driver: driver || '' },
      { new: true }
    );
    if (!truck) return res.status(404).json({ error: 'Truck not found' });
    res.json({ truckId: truck.truckId, driver: truck.driver });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
