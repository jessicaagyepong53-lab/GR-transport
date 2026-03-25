const mongoose = require('mongoose');

const yearEntrySchema = new mongoose.Schema({
  truckId: { type: String, required: true, index: true },
  year: { type: Number, required: true },
  gross: { type: Number, default: 0 },
  exp: { type: Number, default: 0 },
  net: { type: Number, default: 0 },
  weeks: { type: Number, default: 0 }
}, { timestamps: true });

yearEntrySchema.index({ truckId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('YearEntry', yearEntrySchema);
