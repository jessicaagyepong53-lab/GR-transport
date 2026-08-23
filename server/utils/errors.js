// ─── SHARED ERROR HANDLING & VALIDATION HELPERS ─────────────────────────────
// Used by every route file so error responses are consistent, and so bad
// input (missing fields, non-numeric amounts, out-of-range years/weeks,
// malformed ids, etc.) is rejected with a clear 400 instead of silently
// producing NaN/undefined values that corrupt totals downstream.

// A thrown AppError always carries an HTTP status code. Anything that is
// NOT an AppError (a genuine bug, a DB connection drop, etc.) is treated as
// an unexpected 500 and logged server-side, but the client only ever sees
// a generic "Internal server error" message for those.
class AppError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
  }
}

// Wraps an async Express route handler so any rejected promise / thrown
// error is forwarded to next(err) automatically. Without this, an error
// thrown inside an `async (req, res) => {}` handler would crash the process
// instead of being caught by Express.
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const YEAR_MIN = 2000;
const YEAR_MAX = 2100;
const MONTH_ORDER = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

// Throws if any of `fields` is missing/empty on `body`.
function requireFields(body, fields) {
  const missing = fields.filter(f => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) {
    throw new AppError(`Missing required field(s): ${missing.join(', ')}`, 400);
  }
}

function toYear(value, fieldName = 'year') {
  const y = parseInt(value, 10);
  if (!Number.isInteger(y) || String(value).trim() === '' || y < YEAR_MIN || y > YEAR_MAX) {
    throw new AppError(`${fieldName} must be a valid year between ${YEAR_MIN} and ${YEAR_MAX}`, 400);
  }
  return y;
}

function toWeek(value, fieldName = 'week') {
  const w = parseInt(value, 10);
  if (!Number.isInteger(w) || w < 1 || w > 53) {
    throw new AppError(`${fieldName} must be a whole number between 1 and 53`, 400);
  }
  return w;
}

function toQuarter(value, fieldName = 'quarter') {
  const q = parseInt(value, 10);
  if (![1, 2, 3, 4].includes(q)) {
    throw new AppError(`${fieldName} must be 1, 2, 3, or 4`, 400);
  }
  return q;
}

function toMonth(value, fieldName = 'month') {
  const m = String(value || '').trim();
  if (!MONTH_ORDER.includes(m)) {
    throw new AppError(`${fieldName} must be a 3-letter month abbreviation (Jan-Dec)`, 400);
  }
  return m;
}

// Coerces a value to a finite number. Missing/blank values become 0 unless
// `required` is set. Throws a clear 400 on anything non-numeric (typos,
// stray text, empty strings, etc.) instead of letting NaN silently corrupt
// totals downstream.
function toNumber(value, fieldName, { required = false, allowNegative = true, min, max } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AppError(`${fieldName} is required`, 400);
    return 0;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new AppError(`${fieldName} must be a valid number`, 400);
  }
  if (!allowNegative && n < 0) {
    throw new AppError(`${fieldName} cannot be negative`, 400);
  }
  if (min !== undefined && n < min) {
    throw new AppError(`${fieldName} must be at least ${min}`, 400);
  }
  if (max !== undefined && n > max) {
    throw new AppError(`${fieldName} must be at most ${max}`, 400);
  }
  return n;
}

function toTruckId(value, fieldName = 'truckId') {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError(`${fieldName} is required`, 400);
  }
  return value.trim().toUpperCase();
}

function toObjectId(value, fieldName = 'id') {
  if (typeof value !== 'string' || !OBJECT_ID_RE.test(value)) {
    throw new AppError(`${fieldName} is not a valid id`, 400);
  }
  return value;
}

function toDateString(value, fieldName = 'date') {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) {
    throw new AppError(`${fieldName} must be a valid date in YYYY-MM-DD format`, 400);
  }
  return s;
}

// Express error-handling middleware — must be registered LAST, after all
// routes and the SPA fallback. Converts thrown AppErrors, Mongoose errors,
// malformed-JSON body errors, and anything else into one consistent JSON
// shape instead of leaking stack traces or an HTML error page.
function globalErrorHandler(err, req, res, next) {
  let status = err.statusCode || 500;
  let message = err.message || 'Internal server error';

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    status = 400;
    message = Object.values(err.errors || {}).map(e => e.message).join('; ') || message;
  }
  // Mongoose cast errors (bad ObjectId, wrong type, etc.)
  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${err.path}`;
  }
  // Mongo duplicate key
  if (err.code === 11000) {
    status = 409;
    message = 'A record with that value already exists';
  }
  // express.json() failed to parse the request body
  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  }

  if (status >= 500) {
    console.error('Unhandled error:', err);
    message = 'Internal server error';
  }

  res.status(status).json({ error: message });
}

module.exports = {
  AppError,
  asyncHandler,
  requireFields,
  toYear,
  toWeek,
  toQuarter,
  toMonth,
  toNumber,
  toTruckId,
  toObjectId,
  toDateString,
  globalErrorHandler,
  MONTH_ORDER
};