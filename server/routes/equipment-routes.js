// ─── EQUIPMENT ROUTES ─────────────────────────────────────────────────────
const express = require('express');
const router = express.Router();
const Equipment = require('../models/Equipment');
const Contract = require('../models/Contract');
const { requireMixerAdmin } = require('./mixerAuth');
const { computeUtilization } = require('../utils/equipmentHelpers');
const { asyncHandler, AppError, toNumber, requireFields } = require('../utils/errors');

function parseEquipmentCost(cost = {}) {
  return {
    pricePaid: toNumber(cost.pricePaid, 'cost.pricePaid', { allowNegative: false }),
    insurance: toNumber(cost.insurance, 'cost.insurance', { allowNegative: false }),
    maintenanceCost: toNumber(cost.maintenanceCost, 'cost.maintenanceCost', { allowNegative: false }),
  };
}

// GET all equipment, optionally filtered by ?category=mixer|scaffold|compactor|gutter-mould
router.get('/', asyncHandler(async (req, res) => {
  const filter = { deletedAt: null };
  if (req.query.category) filter.category = req.query.category;
  const equipment = await Equipment.find(filter).sort({ category: 1, equipmentId: 1 });
  res.json(equipment);
}));

// GET /api/equipment/utilization?days=90 — days-on-hire %, and income, per
// unit. Registered BEFORE /:id so "utilization" is never swallowed as an id.
router.get('/utilization', asyncHandler(async (req, res) => {
  const [equipment, contracts] = await Promise.all([
    Equipment.find({ deletedAt: null }).lean(),
    Contract.find({ deletedAt: null }).lean()
  ]);
  let rangeStart;
  if (req.query.days !== undefined) {
    const days = toNumber(req.query.days, 'days', { allowNegative: false });
    if (days > 0) rangeStart = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  res.json(computeUtilization(equipment, contracts, { rangeStart }));
}));

// GET one
router.get('/:id', asyncHandler(async (req, res) => {
  const item = await Equipment.findOne({ equipmentId: req.params.id, deletedAt: null });
  if (!item) throw new AppError('Equipment not found', 404);
  res.json(item);
}));

// CREATE
router.post('/', requireMixerAdmin, asyncHandler(async (req, res) => {
  requireFields(req.body, ['equipmentId', 'category']);
  const equipmentId = String(req.body.equipmentId).trim();
  const category = String(req.body.category).trim();
  if (!equipmentId) throw new AppError('equipmentId is required', 400);
  if (!Equipment.CATEGORIES.includes(category)) {
    throw new AppError(`category must be one of: ${Equipment.CATEGORIES.join(', ')}`, 400);
  }
  const exists = await Equipment.findOne({ equipmentId });
  if (exists) throw new AppError('That equipment ID already exists', 409);

  const item = await Equipment.create({
    equipmentId,
    category,
    model: req.body.model ? String(req.body.model).trim() : '',
    notes: req.body.notes ? String(req.body.notes).trim() : '',
    cost: req.body.cost ? parseEquipmentCost(req.body.cost) : undefined
  });
  res.status(201).json(item);
}));

// UPDATE
router.put('/:id', requireMixerAdmin, asyncHandler(async (req, res) => {
  const update = {};
  if (req.body.category !== undefined) {
    if (!Equipment.CATEGORIES.includes(req.body.category)) {
      throw new AppError(`category must be one of: ${Equipment.CATEGORIES.join(', ')}`, 400);
    }
    update.category = req.body.category;
  }
  if (req.body.model !== undefined) update.model = String(req.body.model).trim();
  if (req.body.notes !== undefined) update.notes = String(req.body.notes).trim();
  if (req.body.status !== undefined) {
    const validStatuses = ['available', 'on-hire', 'maintenance', 'retired'];
    if (!validStatuses.includes(req.body.status)) {
      throw new AppError(`status must be one of: ${validStatuses.join(', ')}`, 400);
    }
    update.status = req.body.status;
  }
  if (req.body.cost) update.cost = parseEquipmentCost(req.body.cost);

  const item = await Equipment.findOneAndUpdate({ equipmentId: req.params.id }, { $set: update }, { new: true });
  if (!item) throw new AppError('Equipment not found', 404);
  res.json(item);
}));

// DELETE (soft-delete — recoverable for 30 days, same as everywhere else)
router.delete('/:id', requireMixerAdmin, asyncHandler(async (req, res) => {
  const result = await Equipment.updateOne(
    { equipmentId: req.params.id, deletedAt: null },
    { $set: { deletedAt: new Date(), status: 'retired' } }
  );
  if (!result.modifiedCount) throw new AppError('Equipment not found', 404);
  res.json({ success: true });
}));

// ADD maintenance entry (auto-adds cost to equipment.cost.maintenanceCost)
router.post('/:id/maintenance', requireMixerAdmin, asyncHandler(async (req, res) => {
  const item = await Equipment.findOne({ equipmentId: req.params.id });
  if (!item) throw new AppError('Equipment not found', 404);
  if (!req.body.date) throw new AppError('date is required', 400);
  const cost = toNumber(req.body.cost, 'cost', { allowNegative: false });

  item.maintenanceLog.push({
    date: req.body.date,
    description: req.body.description ? String(req.body.description).trim() : '',
    cost
  });
  item.cost.maintenanceCost = (item.cost.maintenanceCost || 0) + cost;
  await item.save();
  res.json(item);
}));

// DELETE maintenance entry
router.delete('/:id/maintenance/:entryId', requireMixerAdmin, asyncHandler(async (req, res) => {
  const item = await Equipment.findOne({ equipmentId: req.params.id });
  if (!item) throw new AppError('Equipment not found', 404);
  const entry = item.maintenanceLog.id(req.params.entryId);
  if (entry) {
    item.cost.maintenanceCost = Math.max(0, (item.cost.maintenanceCost || 0) - (entry.cost || 0));
    entry.deleteOne();
  }
  await item.save();
  res.json(item);
}));

module.exports = router;