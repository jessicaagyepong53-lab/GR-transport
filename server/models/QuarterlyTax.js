const mongoose = require('mongoose');

const quarterlyTaxSchema = new mongoose.Schema({
  truckId: { type: String, required: true, index: true },
  year:    { type: Number, required: true },
  quarter: { type: Number, required: true, min: 1, max: 4 },
  amount:  { type: Number, default: 0 }
}, { timestamps: true });

quarterlyTaxSchema.index({ truckId: 1, year: 1, quarter: 1 }, { unique: true });

module.exports = mongoose.model('QuarterlyTax', quarterlyTaxSchema);
