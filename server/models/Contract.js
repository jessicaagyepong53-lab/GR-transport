// ─── CONTRACT MODEL ───────────────────────────────────────────────────────
// A hire agreement with a client, covering one or more pieces of equipment.
const mongoose = require('mongoose');

const contractItemSchema = new mongoose.Schema({
  category: { type: String, required: true },   // mixer, scaffold, compactor, gutter-mould
  equipmentId: { type: String, default: '' },    // specific unit, if known
  description: { type: String, default: '' },    // free text if not tied to a specific unit yet
  quantity: { type: Number, default: 1 },
}, { _id: false });

// One entry per payment received against a contract — the source of truth
// for paymentStatus/balance, replacing the old single paymentStatus flag
// that couldn't show partial-payment history.
const paymentSchema = new mongoose.Schema({
  date: { type: String, required: true },    // ISO date, e.g. '2026-09-01'
  amount: { type: Number, required: true },
  method: { type: String, default: '' },     // cash, cheque, transfer, etc.
  note: { type: String, default: '' },
}, { timestamps: true });

const contractSchema = new mongoose.Schema({
  clientName: { type: String, required: true },
  clientPhone: { type: String, default: '' },
  clientAddress: { type: String, default: '' },
  items: [contractItemSchema],
  startDate: { type: String, required: true },   // ISO date, e.g. '2026-09-01'
  endDate: { type: String, required: true },
  rate: { type: Number, default: 0 },
  rateUnit: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
  totalValue: { type: Number, default: 0 },
  deposit: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['unpaid', 'partial', 'paid'], default: 'unpaid' },
  payments: { type: [paymentSchema], default: [] },
  paymentDueDate: { type: String, default: '' },
  returned: { type: Boolean, default: false },
  returnedDate: { type: String, default: '' },
  returnNotes: { type: String, default: '' },
  // Captured together in one step when a contract is returned (see the
  // PUT /:id/return route) — condition drives whether the equipment goes
  // back to "available" or gets routed to "maintenance" automatically.
  conditionStatus: { type: String, enum: ['good', 'minor-wear', 'damaged', ''], default: '' },
  depositRefund: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

// Recovered contracts are retained for 30 days, then MongoDB removes them automatically.
contractSchema.index({ deletedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Contract', contractSchema);