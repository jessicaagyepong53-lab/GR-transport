const mongoose = require('mongoose');

// One doc per (scope + IP) identifier, e.g. "login:203.0.113.4" or
// "pinreset:203.0.113.4". Stored in the DB (not memory) so lockouts survive
// server restarts and work correctly in serverless/multi-instance deployments.
const loginAttemptSchema = new mongoose.Schema({
  identifier: { type: String, required: true, unique: true },
  failedAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  // Stale records (nobody's tried from this identifier in a week) are
  // auto-purged by MongoDB's TTL monitor so this collection doesn't grow
  // forever — there's no need to remember someone's failed attempts from
  // months ago once their lockout window is long past.
  lastAttemptAt: { type: Date, default: Date.now, expires: '7d' }
});

module.exports = mongoose.model('LoginAttempt', loginAttemptSchema);