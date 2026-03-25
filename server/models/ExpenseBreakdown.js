const mongoose = require('mongoose');

const expenseBreakdownSchema = new mongoose.Schema({
  year: { type: Number, required: true, unique: true },
  maint: { type: Number, default: 0 },
  other: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('ExpenseBreakdown', expenseBreakdownSchema);
