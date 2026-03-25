const mongoose = require('mongoose');

const trashSchema = new mongoose.Schema({
  type: { type: String, required: true },
  label: { type: String, default: '' },
  data: { type: mongoose.Schema.Types.Mixed },
  deletedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date }
}, { timestamps: true });

// Auto-set expiresAt to 30 days from deletedAt
trashSchema.pre('save', function (next) {
  if (!this.expiresAt) {
    this.expiresAt = new Date(this.deletedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
  next();
});

// TTL index: MongoDB auto-deletes documents when expiresAt passes
trashSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Trash', trashSchema);
