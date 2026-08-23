const LoginAttempt = require('../models/LoginAttempt');
const { AppError } = require('../utils/errors');

const MAX_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;

function minutesRemaining(lockedUntil) {
  return Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60000));
}

// Builds a per-IP, per-purpose identifier so login lockouts and PIN-reset
// lockouts are tracked independently, and one visitor's failures never
// affect anyone else's.
function getClientIdentifier(req, scope) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  return `${scope}:${ip}`;
}

// Throws a 429 AppError if this identifier is currently locked out.
// Call this BEFORE checking the submitted PIN/answer so a locked-out
// attacker can't keep guessing even once more while locked.
async function assertNotLocked(identifier) {
  const record = await LoginAttempt.findOne({ identifier });
  if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
    throw new AppError(
      `Too many failed attempts. Try again in ${minutesRemaining(record.lockedUntil)} minute(s).`,
      429
    );
  }
}

// Records a failed attempt. Locks the identifier out for LOCKOUT_MINUTES
// once MAX_ATTEMPTS is reached. Returns the number of attempts remaining
// before lockout (0 means this failure just triggered the lockout).
async function recordFailure(identifier) {
  const record = await LoginAttempt.findOneAndUpdate(
    { identifier },
    { $inc: { failedAttempts: 1 }, $set: { lastAttemptAt: new Date() } },
    { upsert: true, new: true }
  );

  if (record.failedAttempts >= MAX_ATTEMPTS) {
    record.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    await record.save();
    return 0;
  }
  return MAX_ATTEMPTS - record.failedAttempts;
}

// Clears the failure count for this identifier after a successful attempt.
async function recordSuccess(identifier) {
  await LoginAttempt.findOneAndUpdate(
    { identifier },
    { failedAttempts: 0, lockedUntil: null, lastAttemptAt: new Date() },
    { upsert: true }
  );
}

module.exports = {
  assertNotLocked,
  recordFailure,
  recordSuccess,
  getClientIdentifier,
  MAX_ATTEMPTS,
  LOCKOUT_MINUTES
};