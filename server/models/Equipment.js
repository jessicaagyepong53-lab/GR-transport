// ─── EQUIPMENT MODEL ──────────────────────────────────────────────────────
// Covers all hire equipment: concrete mixers, scaffold, compactors, gutter moulds.
const mongoose = require('mongoose');

const CATEGORIES = ['mixer', 'scaffold', 'compactor', 'gutter-mould'];

const maintenanceSchema = new mongoose.Schema({
  date: String,
  description: String,
  cost: { type: Number, default: 0 },
}, { _id: true, timestamps: true });

const equipmentSchema = new mongoose.Schema({
  equipmentId: { type: String, required: true, unique: true, trim: true },
  category: { type: String, enum: CATEGORIES, required: true },
  model: { type: String, default: '' },       // e.g. "Belle Mini Mix 150"
  status: { type: String, enum: ['available', 'on-hire', 'maintenance', 'retired'], default: 'available' },
  cost: {
    pricePaid: { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    maintenanceCost: { type: Number, default: 0 }, // running total, auto-updated from maintenanceLog
  },
  maintenanceLog: [maintenanceSchema],
  notes: { type: String, default: '' },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

equipmentSchema.statics.CATEGORIES = CATEGORIES;

// Recovered equipment is retained for 30 days, then MongoDB removes it automatically.
equipmentSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Equipment', equipmentSchema);