const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { requireAdmin, getAdminPin, setAdminPin } = require('../middleware/auth');
const ReferenceFile = require('../models/ReferenceFile');
const Trash = require('../models/Trash');
const AppSettings = require('../models/AppSettings');
const multer = require('multer');
const { asyncHandler, AppError, toObjectId } = require('../utils/errors');
const {
  assertNotLocked,
  recordFailure,
  recordSuccess,
  getClientIdentifier,
  formatDuration
} = require('../middleware/rateLimit');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret';
const COOKIE_NAME = 'gr_auth';
const isProduction = process.env.NODE_ENV === 'production';

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain'
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) return cb(null, true);
    return cb(new AppError('Unsupported file type. Upload images or common document files only.', 400));
  }
});

// GET /api/settings — get app settings
router.get('/', (req, res) => {
  res.json({
    currency: 'GHS',
    appName: 'GR-Transport Fleet Dashboard'
  });
});

// GET /api/settings/security-question — public: returns the configured
// recovery question text (never the answer) so the "Forgot PIN" screen can
// display it. Returns { question: null } if nothing has been set up yet.
router.get('/security-question', asyncHandler(async (req, res) => {
  const doc = await AppSettings.findOne({ key: 'secretQuestion' });
  res.json({ question: doc?.value || null });
}));

// PUT /api/settings/security-question — admin only: set or update the
// recovery question. Only someone who already knows the current PIN can
// configure this, which is why it requires an active admin session.
router.put('/security-question', requireAdmin, asyncHandler(async (req, res) => {
  const question = req.body?.question ? String(req.body.question).trim() : '';
  const answer = req.body?.answer ? String(req.body.answer).trim() : '';

  if (question.length < 5) {
    throw new AppError('Please enter a full question (at least 5 characters)', 400);
  }
  if (answer.length < 2) {
    throw new AppError('Please enter an answer (at least 2 characters)', 400);
  }

  const answerHash = await bcrypt.hash(answer.toLowerCase(), 10);
  await AppSettings.findOneAndUpdate({ key: 'secretQuestion' }, { value: question }, { upsert: true });
  await AppSettings.findOneAndUpdate({ key: 'secretAnswerHash' }, { value: answerHash }, { upsert: true });

  res.json({ success: true, message: 'Recovery question saved' });
}));

// POST /api/settings/pin/reset — reset the PIN using ONE of three
// independent verification methods:
//   - "recoveryKey"     — the server's RECOVERY_KEY env var (developer/owner fallback)
//   - "secretQuestion"  — the answer to the recovery question set up in advance
//   - "partialPin"      — remembering at least 2 digits, in their correct
//                          positions, of the current PIN (use "_" for unknown digits)
// Rate-limited per IP: 3 failed verification attempts (across ALL methods
// combined) locks that IP out of resetting for 15 minutes.
router.post('/pin/reset', asyncHandler(async (req, res) => {
  const newPin = req.body?.newPin ? String(req.body.newPin).trim() : '';
  const method = req.body?.method || 'recoveryKey';

  if (!newPin) throw new AppError('New PIN is required', 400);
  if (newPin.length < 4) throw new AppError('PIN must be at least 4 characters', 400);

  const identifier = getClientIdentifier(req, 'pinreset');
  await assertNotLocked(identifier);

  let verified = false;

  if (method === 'recoveryKey') {
    const recoveryKey = req.body?.recoveryKey ? String(req.body.recoveryKey).trim() : '';
    if (!recoveryKey) throw new AppError('Recovery key is required', 400);
    const validKey = process.env.RECOVERY_KEY;
    if (!validKey) throw new AppError('Recovery key not configured on server', 503);
    verified = recoveryKey === String(validKey);

  } else if (method === 'secretQuestion') {
    const secretAnswer = req.body?.secretAnswer ? String(req.body.secretAnswer).trim().toLowerCase() : '';
    if (!secretAnswer) throw new AppError('Answer is required', 400);
    const hashDoc = await AppSettings.findOne({ key: 'secretAnswerHash' });
    if (!hashDoc?.value) {
      throw new AppError('No recovery question has been set up yet. Use another method.', 400);
    }
    verified = await bcrypt.compare(secretAnswer, hashDoc.value);

  } else if (method === 'partialPin') {
    const partial = req.body?.partialPin !== undefined ? String(req.body.partialPin) : '';
    const currentPin = String(await getAdminPin());
    if (partial.length !== currentPin.length) {
      throw new AppError(`Enter ${currentPin.length} characters — use _ for digits you don't remember`, 400);
    }
    let correctCount = 0;
    for (let i = 0; i < currentPin.length; i++) {
      if (partial[i] !== '_' && partial[i] === currentPin[i]) correctCount++;
    }
    verified = correctCount >= 2;

  } else {
    throw new AppError('Unknown verification method', 400);
  }

  if (!verified) {
    // No `escalate` flag here (defaults to false) — PIN reset intentionally
    // never escalates past 15 minutes, no matter how many times it's
    // triggered, so this stays a working same-day recovery path even during
    // a 24-hour login lockout.
    const { remaining, lockedMs } = await recordFailure(identifier);
    if (remaining <= 0) {
      throw new AppError(`Too many failed attempts. Try again in ${formatDuration(lockedMs)}.`, 429);
    }
    throw new AppError(`Verification failed. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`, 401);
  }

  await recordSuccess(identifier);
  await setAdminPin(newPin);

  // Grant admin cookie after successful reset
  const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '24h' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
    path: '/'
  });
  res.json({ success: true, message: 'PIN has been reset' });
}));

// GET /api/settings/files — list reference files
router.get('/files', asyncHandler(async (req, res) => {
  const files = await ReferenceFile.find().sort({ createdAt: -1 });
  res.json(files.map(file => ({
    id: file._id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    category: file.category || 'General',
    subheading: file.subheading || '',
    notes: file.notes || '',
    uploadedAt: file.createdAt,
    url: `/api/settings/files/${file._id}/download`
  })));
}));

// POST /api/settings/files — upload a reference file (admin only)
router.post('/files', requireAdmin, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return next(err instanceof AppError ? err : new AppError(err.message, 400));
    }
    if (!req.file) {
      return next(new AppError('No file uploaded', 400));
    }

    ReferenceFile.create({
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      content: req.file.buffer,
      category: String(req.body?.category || 'General').trim() || 'General',
      subheading: String(req.body?.subheading || '').trim(),
      notes: String(req.body?.notes || '').trim()
    }).then(record => {
      res.status(201).json({
        id: record._id,
        originalName: record.originalName,
        mimeType: record.mimeType,
        size: record.size,
        category: record.category || 'General',
        subheading: record.subheading || '',
        notes: record.notes || '',
        uploadedAt: record.createdAt,
        url: `/api/settings/files/${record._id}/download`
      });
    }).catch(next);
  });
});

// PUT /api/settings/files/:id/meta — update reference file display metadata (admin only)
router.put('/files/:id/meta', requireAdmin, asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const file = await ReferenceFile.findById(id);
  if (!file) throw new AppError('File not found', 404);

  file.category = req.body?.category !== undefined ? (String(req.body.category).trim() || 'General') : (file.category || 'General');
  file.subheading = req.body?.subheading !== undefined ? String(req.body.subheading).trim() : (file.subheading || '');
  file.notes = req.body?.notes !== undefined ? String(req.body.notes).trim() : (file.notes || '');
  await file.save();

  res.json({
    id: file._id,
    originalName: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    category: file.category || 'General',
    subheading: file.subheading || '',
    notes: file.notes || '',
    uploadedAt: file.createdAt,
    url: `/api/settings/files/${file._id}/download`
  });
}));

// GET /api/settings/files/:id/download — download/open reference file
router.get('/files/:id/download', asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const file = await ReferenceFile.findById(id);
  if (!file) throw new AppError('File not found', 404);

  if (!file.content || !file.content.length) {
    const legacyRelativePath = file.get('relativePath');
    if (legacyRelativePath) {
      const absolutePath = path.join(__dirname, '..', '..', legacyRelativePath);
      if (fs.existsSync(absolutePath)) {
        const legacyContent = fs.readFileSync(absolutePath);
        file.content = legacyContent;
        file.size = legacyContent.length;
        await file.save();
      }
    }
  }

  if (!file.content || !file.content.length) {
    throw new AppError('File content missing from database', 404);
  }

  res.setHeader('Content-Type', file.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${file.originalName.replace(/"/g, '')}"`);
  res.send(file.content);
}));

// DELETE /api/settings/files/:id — delete reference file (admin only, soft-delete to trash)
router.delete('/files/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const file = await ReferenceFile.findById(id);
  if (!file) throw new AppError('File not found', 404);

  const legacyRelativePath = file.get('relativePath');
  if (legacyRelativePath) {
    const absolutePath = path.join(__dirname, '..', '..', legacyRelativePath);
    try {
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    } catch (_) {
      // Ignore legacy file cleanup errors.
    }
  }

  // Preserve the actual file content (base64-encoded) in Trash, not just the
  // metadata, so restoring it brings back a real, openable file.
  await Trash.create({
    type: 'referenceFile',
    label: file.originalName,
    data: {
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      category: file.category || 'General',
      subheading: file.subheading || '',
      notes: file.notes || '',
      content: file.content ? file.content.toString('base64') : null
    }
  });

  await file.deleteOne();
  res.json({ success: true });
}));

module.exports = router;