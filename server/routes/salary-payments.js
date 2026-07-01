const router = require('express').Router();
const SalaryPayment = require('../models/SalaryPayment');
const { requireAdmin, touchLastSaved } = require('../middleware/auth');

// GET /api/salary-payments/:truckId/:year — list salary payments for a year
router.get('/:truckId/:year', async (req, res) => {
  try {
    const entries = await SalaryPayment.find({
      truckId: req.params.truckId,
      year: parseInt(req.params.year)
    }).sort({ datePaid: 1, createdAt: 1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/salary-payments/:truckId/:year — create a new payment
router.post('/:truckId/:year', requireAdmin, async (req, res) => {
  try {
    const { datePaid, amount, note } = req.body;
    if (!datePaid) {
      return res.status(400).json({ error: 'Date paid is required' });
    }
    const entry = await SalaryPayment.create({
      truckId: req.params.truckId,
      year: parseInt(req.params.year),
      datePaid,
      amount: amount || 0,
      note: note || ''
    });
    await touchLastSaved();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/salary-payments/:truckId/:year/:id — update a payment
router.put('/:truckId/:year/:id', requireAdmin, async (req, res) => {
  try {
    const { datePaid, amount, note } = req.body;
    const entry = await SalaryPayment.findOneAndUpdate(
      {
        _id: req.params.id,
        truckId: req.params.truckId,
        year: parseInt(req.params.year)
      },
      {
        datePaid,
        amount: amount || 0,
        note: note || ''
      },
      { new: true }
    );
    if (!entry) return res.status(404).json({ error: 'Payment not found' });
    await touchLastSaved();
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/salary-payments/:truckId/:year/:id — delete a payment
router.delete('/:truckId/:year/:id', requireAdmin, async (req, res) => {
  try {
    const entry = await SalaryPayment.findOneAndDelete({
      _id: req.params.id,
      truckId: req.params.truckId,
      year: parseInt(req.params.year)
    });
    if (!entry) return res.status(404).json({ error: 'Payment not found' });
    await touchLastSaved();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;