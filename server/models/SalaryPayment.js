const mongoose = require('mongoose');

const salaryPaymentSchema = new mongoose.Schema({
  truckId: { type: String, required: true, index: true },
  year: { type: Number, required: true, index: true },
  datePaid: { type: String, required: true },
  amount: { type: Number, default: 0 },
  note: { type: String, default: '' }
}, { timestamps: true });

salaryPaymentSchema.index({ truckId: 1, year: 1, datePaid: 1 });

module.exports = mongoose.model('SalaryPayment', salaryPaymentSchema);