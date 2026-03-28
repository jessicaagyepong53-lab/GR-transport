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
    maintenanceCost: { type: Number, default: 0 }
  },
  endOfTerm: {
    active: { type: Boolean, default: false },
    date: { type: String, default: '' }
  }
}, { timestamps: true });

module.exports = mongoose.model('Truck', truckSchema);
