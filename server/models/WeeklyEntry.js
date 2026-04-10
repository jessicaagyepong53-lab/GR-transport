const mongoose = require('mongoose');

const weeklyEntrySchema = new mongoose.Schema({
  truckId: { type: String, required: true, index: true },
  year: { type: Number, required: true },
  week: { type: Number, required: true },
  daysWorked: { type: Number, default: null },
  gross: { type: Number, default: 0 },
  maint: { type: Number, default: 0 },
  other: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  remarks: { type: String, default: '' }
}, { timestamps: true });

weeklyEntrySchema.index({ truckId: 1, year: 1, week: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyEntry', weeklyEntrySchema);
