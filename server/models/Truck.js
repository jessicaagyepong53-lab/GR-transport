const mongoose = require('mongoose');

const truckSchema = new mongoose.Schema({
  truckId: { type: String, required: true, unique: true, trim: true },
  driver: { type: String, default: '' },
  driverNotes: { type: String, default: '' },
  startDates: { type: mongoose.Schema.Types.Mixed, default: {} },
  purchaseYear: { type: Number },
  cost: {
    initialValue: { type: Number, default: 0 },
    pricePaid: { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    maintenanceCost: { type: Number, default: 0 },
    paymentsMade: { type: Number, default: 0 },
    initialPayment: { type: Number, default: 0 },
    initialPaymentNotes: { type: String, default: '' }
  },
  paymentEntries: {
    type: [{
      label: { type: String, default: '' },
      amount: { type: Number, default: 0 },
      notes: { type: String, default: '' }
    }],
    default: []
  },
  sheetNotes: { type: [String], default: [] },
  endOfTerm: {
    active: { type: Boolean, default: false },
    date: { type: String, default: '' }
  }
}, { timestamps: true });

module.exports = mongoose.model('Truck', truckSchema);
