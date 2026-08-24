const LoginAttempt = require('../models/LoginAttempt');
const { AppError } = require('../utils/errors');

const MAX_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;
const ESCALATED_LOCKOUT_HOURS = 24;

function formatDuration(ms) {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hrs = Math.ceil(mins / 60);
  return `${hrs} hour${hrs === 1 ? '' : 's'}`;
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
// attacker (or a locked-out owner) can't sneak in one more guess while locked.
async function assertNotLocked(identifier) {
  const record = await LoginAttempt.findOne({ identifier });
  if (record?.lockedUntil && record.lockedUntil.getTime() > Date.now()) {
    const remainingMs = record.lockedUntil.getTime() - Date.now();
    throw new AppError(`Too many failed attempts. Try again in ${formatDuration(remainingMs)}.`, 429);
  }
}

// Records a failed attempt. Once MAX_ATTEMPTS is reached, locks the
// identifier out.
//
// - The FIRST lockout is always LOCKOUT_MINUTES (15 min), regardless of scope.
// - If `escalate: true` (used only for login, never for PIN reset) and this
//   identifier gets locked out AGAIN after that first lockout has already
//   expired, the lockout jumps to ESCALATED_LOCKOUT_HOURS (24 hr) and stays
//   there for any further repeat lockouts too.
// - PIN-reset attempts always pass escalate: false, so they stay a flat
//   15-minute cooldown no matter how many times triggered — this is what
//   keeps the recovery-question/key/partial-PIN path usable as a same-day
//   way back in, even while a login lockout is in its 24-hour escalation.
//
// Returns { remaining, lockedMs } — remaining is attempts left before
// lockout (0 means this failure just triggered/renewed the lockout).
async function recordFailure(identifier, { escalate = false } = {}) {
  const record = await LoginAttempt.findOneAndUpdate(
    { identifier },
    { $inc: { failedAttempts: 1 }, $set: { lastAttemptAt: new Date() } },
    { upsert: true, new: true }
  );

  if (record.failedAttempts < MAX_ATTEMPTS) {
    return { remaining: MAX_ATTEMPTS - record.failedAttempts, lockedMs: 0 };
  }

  const nextLevel = escalate ? (record.lockoutLevel || 0) + 1 : 1;
  const lockedMs = escalate && nextLevel >= 2
    ? ESCALATED_LOCKOUT_HOURS * 60 * 60 * 1000
    : LOCKOUT_MINUTES * 60 * 1000;

  record.lockedUntil = new Date(Date.now() + lockedMs);
  record.lockoutLevel = nextLevel;
  record.failedAttempts = 0; // next cycle starts fresh once this lockout expires
  await record.save();

  return { remaining: 0, lockedMs };
}

// Clears the failure count AND the escalation level for this identifier
// after a successful attempt — a clean login resets things back to square one.
async function recordSuccess(identifier) {
  await LoginAttempt.findOneAndUpdate(
    { identifier },
    { failedAttempts: 0, lockedUntil: null, lockoutLevel: 0, lastAttemptAt: new Date() },
    { upsert: true }
  );
}

module.exports = {
  assertNotLocked,
  recordFailure,
  recordSuccess,
  getClientIdentifier,
  formatDuration,
  MAX_ATTEMPTS,
  LOCKOUT_MINUTES,
  ESCALATED_LOCKOUT_HOURS
};