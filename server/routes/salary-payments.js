const router = require('express').Router();
const SalaryPayment = require('../models/SalaryPayment');
const Trash = require('../models/Trash');
const { requireAdmin, touchLastSaved } = require('../middleware/auth');
const { asyncHandler, AppError, toYear, toNumber, toDateString, toObjectId } = require('../utils/errors');

// GET /api/salary-payments/:truckId/:year — list salary payments for a year
router.get('/:truckId/:year', asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const entries = await SalaryPayment.find({ truckId: req.params.truckId, year }).sort({ datePaid: 1, createdAt: 1 });
  res.json(entries);
}));

// POST /api/salary-payments/:truckId/:year — create a new payment
router.post('/:truckId/:year', requireAdmin, asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const datePaid = toDateString(req.body.datePaid, 'datePaid');
  const amount = toNumber(req.body.amount, 'amount', { allowNegative: false });
  const note = req.body.note ? String(req.body.note) : '';

  const entry = await SalaryPayment.create({
    truckId: req.params.truckId,
    year,
    datePaid,
    amount,
    note
  });
  await touchLastSaved();
  res.json(entry);
}));

// PUT /api/salary-payments/:truckId/:year/:id — update a payment
router.put('/:truckId/:year/:id', requireAdmin, asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const id = toObjectId(req.params.id);
  const datePaid = toDateString(req.body.datePaid, 'datePaid');
  const amount = toNumber(req.body.amount, 'amount', { allowNegative: false });
  const note = req.body.note ? String(req.body.note) : '';

  const entry = await SalaryPayment.findOneAndUpdate(
    { _id: id, truckId: req.params.truckId, year },
    { datePaid, amount, note },
    { new: true }
  );
  if (!entry) throw new AppError('Payment not found', 404);
  await touchLastSaved();
  res.json(entry);
}));

// DELETE /api/salary-payments/:truckId/:year/:id — delete a payment (soft-delete to trash)
router.delete('/:truckId/:year/:id', requireAdmin, asyncHandler(async (req, res) => {
  const year = toYear(req.params.year);
  const id = toObjectId(req.params.id);

  const entry = await SalaryPayment.findOneAndDelete({ _id: id, truckId: req.params.truckId, year });
  if (!entry) throw new AppError('Payment not found', 404);

  const truckLabel = req.params.truckId === '_fleet' ? 'Fleet' : req.params.truckId;
  await Trash.create({
    type: 'salaryPayment',
    label: `Salary Payment — ${truckLabel} / ${year} / GHS ${(entry.amount || 0).toLocaleString()}`,
    data: entry.toObject()
  });

  await touchLastSaved();
  res.json({ success: true });
}));

module.exports = router;