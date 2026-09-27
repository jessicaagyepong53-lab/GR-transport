// ─── CONTRACT ROUTES ──────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const Contract = require('../models/Contract');
const Equipment = require('../models/Equipment');
const { requireMixerAdmin } = require('./mixerAuth');
const { asyncHandler, AppError, toNumber, toDateString, toObjectId, requireFields } = require('../utils/errors');
const { computePaymentTotals, buildClientHistory, validateContractItems } = require('../utils/contractHelpers');

// GET all contracts, ending soonest first
router.get('/', asyncHandler(async (req, res) => {
  const contracts = await Contract.find({ deletedAt: null }).sort({ endDate: 1 });
  res.json(contracts);
}));

// GET /api/contracts/clients/history — per-client aggregation for
// mixer-clients.html. Registered BEFORE /:id so "clients" is never
// swallowed as a contract id.
//
// buildClientHistory() (contractHelpers.js) returns semantically-named
// fields (totalBalance, contractCount, status) that its own tests check
// directly. This route reshapes that into the field names mixer-clients.html
// actually reads (totalOwed, totalContracts, paymentStatus, lastContractEnd)
// — keeping the shaping here means the tested helper's contract never has
// to bend to match one page's markup.
router.get('/clients/history', asyncHandler(async (req, res) => {
  const contracts = await Contract.find({ deletedAt: null }).lean();
  const history = buildClientHistory(contracts);

  const shaped = history.map(g => {
    const sortedContracts = g.contracts.slice().sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)));
    return {
      clientName: g.clientName,
      clientPhone: g.clientPhone,
      flagged: g.flagged,
      totalContracts: g.contractCount,
      totalValue: g.totalValue,
      totalPaid: g.totalPaid,
      totalOwed: g.totalBalance,
      lastContractEnd: sortedContracts[0]?.endDate || '',
      contracts: sortedContracts.map(c => ({
        startDate: c.startDate,
        endDate: c.endDate,
        totalValue: c.totalValue,
        paid: c.totalPaid,
        paymentStatus: c.status,
        overdue: c.overdue,
        returned: c.returned,
        conditionStatus: c.conditionStatus || '',
      })),
    };
  });

  res.json(shaped);
}));

// GET one
router.get('/:id', asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const contract = await Contract.findOne({ _id: id, deletedAt: null });
  if (!contract) throw new AppError('Contract not found', 404);
  res.json(contract);
}));

// CREATE
router.post('/', requireMixerAdmin, asyncHandler(async (req, res) => {
  requireFields(req.body, ['clientName', 'startDate', 'endDate', 'items']);
  const startDate = toDateString(req.body.startDate, 'startDate');
  const endDate = toDateString(req.body.endDate, 'endDate');
  if (endDate < startDate) throw new AppError('endDate cannot be before startDate', 400);

  let items;
  try {
    items = validateContractItems(req.body.items);
  } catch (err) {
    throw new AppError(err.message, 400);
  }

  const contract = await Contract.create({
    clientName: String(req.body.clientName).trim(),
    clientPhone: req.body.clientPhone ? String(req.body.clientPhone).trim() : '',
    clientAddress: req.body.clientAddress ? String(req.body.clientAddress).trim() : '',
    items,
    startDate, endDate,
    rate: toNumber(req.body.rate, 'rate', { allowNegative: false }),
    rateUnit: ['daily', 'weekly', 'monthly'].includes(req.body.rateUnit) ? req.body.rateUnit : 'weekly',
    totalValue: toNumber(req.body.totalValue, 'totalValue', { allowNegative: false }),
    deposit: toNumber(req.body.deposit, 'deposit', { allowNegative: false }),
    paymentDueDate: req.body.paymentDueDate ? toDateString(req.body.paymentDueDate, 'paymentDueDate') : '',
    notes: req.body.notes ? String(req.body.notes).trim() : ''
  });

  for (const item of contract.items) {
    if (item.equipmentId) {
      await Equipment.updateOne({ equipmentId: item.equipmentId }, { $set: { status: 'on-hire' } });
    }
  }
  res.status(201).json(contract);
}));

// UPDATE (edit details, mark paid, etc. — use PUT /:id/return for the
// return-with-condition flow, and the payments endpoints below for payments)
router.put('/:id', requireMixerAdmin, asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const update = { ...req.body };

  if (update.items !== undefined) {
    try {
      update.items = validateContractItems(update.items);
    } catch (err) {
      throw new AppError(err.message, 400);
    }
  }
  if (update.startDate !== undefined) update.startDate = toDateString(update.startDate, 'startDate');
  if (update.endDate !== undefined) update.endDate = toDateString(update.endDate, 'endDate');
  if (update.startDate && update.endDate && update.endDate < update.startDate) {
    throw new AppError('endDate cannot be before startDate', 400);
  }
  // Payments are managed only through the dedicated ledger endpoints below —
  // never overwritten wholesale via a generic PUT.
  delete update.payments;

  const contract = await Contract.findOneAndUpdate({ _id: id, deletedAt: null }, { $set: update }, { new: true });
  if (!contract) throw new AppError('Contract not found', 404);

  if (req.body.returned === true) {
    for (const item of contract.items || []) {
      if (item.equipmentId) {
        await Equipment.updateOne({ equipmentId: item.equipmentId }, { $set: { status: 'available' } });
      }
    }
  }
  res.json(contract);
}));

// POST /api/contracts/:id/payments — add a payment to the ledger
router.post('/:id/payments', requireMixerAdmin, asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const date = toDateString(req.body.date, 'date');
  const amount = toNumber(req.body.amount, 'amount', { required: true, allowNegative: false });
  if (amount <= 0) throw new AppError('amount must be greater than zero', 400);

  const contract = await Contract.findOne({ _id: id, deletedAt: null });
  if (!contract) throw new AppError('Contract not found', 404);

  contract.payments.push({
    date, amount,
    method: req.body.method ? String(req.body.method).trim() : '',
    note: req.body.note ? String(req.body.note).trim() : ''
  });
  const totals = computePaymentTotals(contract);
  contract.paymentStatus = totals.status === 'overpaid' ? 'paid' : totals.status;
  await contract.save();
  res.status(201).json(contract);
}));

// DELETE /api/contracts/:id/payments/:paymentId — remove a payment entry
router.delete('/:id/payments/:paymentId', requireMixerAdmin, asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const paymentId = toObjectId(req.params.paymentId, 'paymentId');

  const contract = await Contract.findOne({ _id: id, deletedAt: null });
  if (!contract) throw new AppError('Contract not found', 404);
  const payment = contract.payments.id(paymentId);
  if (!payment) throw new AppError('Payment not found', 404);
  payment.deleteOne();

  const totals = computePaymentTotals(contract);
  contract.paymentStatus = totals.status === 'overpaid' ? 'paid' : totals.status;
  await contract.save();
  res.json(contract);
}));

// PUT /api/contracts/:id/return — mark returned + capture condition +
// deposit refund in one step, and route the equipment straight to
// maintenance automatically if damage was recorded.
router.put('/:id/return', requireMixerAdmin, asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const validConditions = ['good', 'minor-wear', 'damaged'];
  const conditionStatus = req.body.conditionStatus;
  if (!validConditions.includes(conditionStatus)) {
    throw new AppError(`conditionStatus must be one of: ${validConditions.join(', ')}`, 400);
  }

  const contract = await Contract.findOne({ _id: id, deletedAt: null });
  if (!contract) throw new AppError('Contract not found', 404);

  const depositRefund = req.body.depositRefund !== undefined
    ? toNumber(req.body.depositRefund, 'depositRefund', { allowNegative: false })
    : (contract.deposit || 0);

  contract.returned = true;
  contract.returnedDate = req.body.returnedDate ? toDateString(req.body.returnedDate, 'returnedDate') : new Date().toISOString().slice(0, 10);
  contract.conditionStatus = conditionStatus;
  contract.depositRefund = Math.min(depositRefund, contract.deposit || 0);
  if (req.body.returnNotes !== undefined) contract.returnNotes = String(req.body.returnNotes).trim();
  await contract.save();

  for (const item of contract.items || []) {
    if (item.equipmentId) {
      await Equipment.updateOne(
        { equipmentId: item.equipmentId },
        { $set: { status: conditionStatus === 'damaged' ? 'maintenance' : 'available' } }
      );
    }
  }
  res.json(contract);
}));

// DELETE (soft-delete — recoverable for 30 days)
router.delete('/:id', requireMixerAdmin, asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const result = await Contract.findOneAndUpdate({ _id: id, deletedAt: null }, { $set: { deletedAt: new Date() } }, { new: true });
  if (!result) throw new AppError('Contract not found', 404);
  res.json({ success: true });
}));

module.exports = router;