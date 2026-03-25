const mongoose = require('mongoose');

const monthlyEntrySchema = new mongoose.Schema({
  truckId: { type: String, default: '_fleet' },
  year: { type: Number, required: true },
  month: { type: String, required: true },
  gross: { type: Number, default: 0 },
  exp: { type: Number, default: 0 }
}, { timestamps: true });

monthlyEntrySchema.index({ year: 1, month: 1, truckId: 1 }, { unique: true });

module.exports = mongoose.model('MonthlyEntry', monthlyEntrySchema);
