const router = require('express').Router();
const Trash = require('../models/Trash');
const Truck = require('../models/Truck');
const YearEntry = require('../models/YearEntry');
const { requireAdmin } = require('../middleware/auth');

// GET /api/recovery — list trashed items
router.get('/', async (req, res) => {
  try {
    const items = await Trash.find().sort('-deletedAt');
    const result = items.map(item => {
      const daysLeft = Math.max(0, Math.ceil((item.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
      return {
        _id: item._id,
        type: item.type,
        label: item.label,
        data: item.data,
        deletedAt: item.deletedAt,
        daysLeft
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/recovery/:id/restore — restore trashed item
router.post('/:id/restore', requireAdmin, async (req, res) => {
  try {
    const item = await Trash.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Trash item not found' });

    if (item.type === 'truck') {
      const truckData = item.data.truck;
      const yearEntries = item.data.yearEntries || [];

      // Restore truck
      await Truck.findOneAndUpdate(
        { truckId: truckData.truckId },
        {
          truckId: truckData.truckId,
          driver: truckData.driver,
          cost: truckData.cost,
          endOfTerm: truckData.endOfTerm
        },
        { upsert: true }
      );

      // Restore year entries
      for (const ye of yearEntries) {
        await YearEntry.findOneAndUpdate(
          { truckId: ye.truckId, year: ye.year },
          { gross: ye.gross, exp: ye.exp, net: ye.net, weeks: ye.weeks },
          { upsert: true }
        );
      }
    } else if (item.type === 'yearEntry') {
      const ye = item.data;
      await YearEntry.findOneAndUpdate(
        { truckId: ye.truckId, year: ye.year },
        { gross: ye.gross, exp: ye.exp, net: ye.net, weeks: ye.weeks },
        { upsert: true }
      );
    }

    await item.deleteOne();
    res.json({ success: true, message: `${item.label} restored` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recovery/:id — permanently delete
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const item = await Trash.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Trash item not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/recovery — purge all expired
router.delete('/', requireAdmin, async (req, res) => {
  try {
    const result = await Trash.deleteMany({});
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
