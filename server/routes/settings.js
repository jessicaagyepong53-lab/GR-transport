const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { requireAdmin, getAdminPin, setAdminPin } = require('../middleware/auth');
const ReferenceFile = require('../models/ReferenceFile');
const multer = require('multer');

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
    return cb(new Error('Unsupported file type. Upload images or common document files only.'));
  }
});

// GET /api/settings — get app settings
router.get('/', (req, res) => {
  res.json({
    currency: 'GHS',
    appName: 'GR-Transport Fleet Dashboard'
  });
});

// POST /api/settings/pin/reset — reset PIN using recovery key
router.post('/pin/reset', async (req, res) => {
  try {
    const { recoveryKey, newPin } = req.body;
    if (!recoveryKey || !newPin) {
      return res.status(400).json({ error: 'Recovery key and new PIN required' });
    }
    if (String(newPin).length < 4) {
      return res.status(400).json({ error: 'PIN must be at least 4 characters' });
    }

    const validKey = process.env.RECOVERY_KEY;
    if (!validKey) {
      return res.status(503).json({ error: 'Recovery key not configured on server' });
    }
    if (String(recoveryKey) !== String(validKey)) {
      return res.status(401).json({ error: 'Invalid recovery key' });
    }

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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/files — list reference files
router.get('/files', async (req, res) => {
  try {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/files — upload a reference file (admin only)
router.post('/files', requireAdmin, (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const category = String(req.body?.category || 'General').trim() || 'General';
      const subheading = String(req.body?.subheading || '').trim();
      const notes = String(req.body?.notes || '').trim();

      const record = await ReferenceFile.create({
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        content: req.file.buffer,
        category,
        subheading,
        notes
      });

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
    } catch (saveErr) {
      res.status(500).json({ error: saveErr.message });
    }
  });
});

// PUT /api/settings/files/:id/meta — update reference file display metadata (admin only)
router.put('/files/:id/meta', requireAdmin, async (req, res) => {
  try {
    const file = await ReferenceFile.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const category = req.body?.category !== undefined ? String(req.body.category).trim() : file.category;
    const subheading = req.body?.subheading !== undefined ? String(req.body.subheading).trim() : file.subheading;
    const notes = req.body?.notes !== undefined ? String(req.body.notes).trim() : file.notes;

    file.category = category || 'General';
    file.subheading = subheading || '';
    file.notes = notes || '';
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/files/:id/download — download/open reference file
router.get('/files/:id/download', async (req, res) => {
  try {
    const file = await ReferenceFile.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

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
      return res.status(404).json({ error: 'File content missing from database' });
    }

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName.replace(/\"/g, '')}"`);
    res.send(file.content);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/settings/files/:id — delete reference file (admin only)
router.delete('/files/:id', requireAdmin, async (req, res) => {
  try {
    const file = await ReferenceFile.findById(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found' });

    const legacyRelativePath = file.get('relativePath');
    if (legacyRelativePath) {
      const absolutePath = path.join(__dirname, '..', '..', legacyRelativePath);
      try {
        if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
      } catch (_) {
        // Ignore legacy file cleanup errors.
      }
    }

    await file.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
