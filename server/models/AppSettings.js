const mongoose = require('mongoose');

const appSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('AppSettings', appSettingsSchema);
