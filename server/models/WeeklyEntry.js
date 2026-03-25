const mongoose = require('mongoose');

const daySchema = new mongoose.Schema({
  day: { type: String, required: true },
  gross: { type: Number, default: 0 },
  exp: { type: Number, default: 0 }
}, { _id: false });

const weeklyEntrySchema = new mongoose.Schema({
  truckId: { type: String, required: true, index: true },
  year: { type: Number, required: true },
  week: { type: Number, required: true },
  days: [daySchema],
  notes: { type: String, default: '' }
}, { timestamps: true });

weeklyEntrySchema.index({ truckId: 1, year: 1, week: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyEntry', weeklyEntrySchema);
