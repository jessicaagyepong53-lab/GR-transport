const mongoose = require('mongoose');

const referenceFileSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  content: { type: Buffer, required: true },
  category: { type: String, default: 'General' },
  subheading: { type: String, default: '' },
  notes: { type: String, default: '' },
  uploadedBy: { type: String, default: 'admin' }
}, { timestamps: true });

module.exports = mongoose.model('ReferenceFile', referenceFileSchema);