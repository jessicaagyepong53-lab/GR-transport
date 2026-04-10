require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

// Quick ping — no DB, no middleware — tests if serverless function loads at all
app.get('/api/ping', (req, res) => res.json({ pong: true, ts: Date.now() }));

// Health check — test DB connection on Vercel (before middleware so it always responds)
app.get('/api/health', async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const uri = process.env.MONGO_URI || '';
    // Extract just the hostname (no credentials) for diagnostics
    let host = 'unknown';
    try { host = new URL(uri.replace('mongodb+srv://', 'https://')).hostname; } catch(e) {}
    const envInfo = {
      MONGO_URI: uri ? 'set' : 'NOT SET',
      MONGO_HOST: host,
      MONGO_URI_LENGTH: uri.length,
      MONGO_URI_START: uri.substring(0, 14),
      MONGO_URI_HAS_QUOTES: uri.includes('"') || uri.includes("'"),
      MONGO_URI_HAS_SPACES: uri !== uri.trim(),
      JWT_SECRET: process.env.JWT_SECRET ? 'set' : 'NOT SET (using fallback)',
      NODE_ENV: process.env.NODE_ENV || 'not set',
      VERCEL: process.env.VERCEL || 'not set'
    };
    const state = mongoose.connection.readyState;
    if (state === 1) {
      res.json({ status: 'ok', db: 'connected', env: envInfo });
    } else {
      // Try a fresh connection instead of relying on cached promise
      try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });
        res.json({ status: 'ok', db: 'connected', env: envInfo });
      } catch (e) {
        res.status(500).json({ status: 'error', db: 'failed', error: e.message, env: envInfo });
      }
    }
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Connect to MongoDB
const dbReady = connectDB();
dbReady.catch(() => {}); // prevent unhandled rejection from crashing serverless function

// Ensure DB is connected before handling any request (critical for serverless cold starts)
app.use(async (req, res, next) => {
  try {
    await dbReady;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed' });
  }
});

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    }
  }
}));
app.set('trust proxy', 1);
app.use(cors({ origin: true, credentials: true }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// Static files — serve the project root (HTML, src/) — local dev only
if (!process.env.VERCEL) {
  app.use(express.static(path.join(__dirname, '..')));
}

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/trucks', require('./routes/trucks'));
app.use('/api/monthly', require('./routes/monthly'));
app.use('/api/weekly', require('./routes/weekly'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/recovery', require('./routes/recovery'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/settings', require('./routes/settings'));

// SPA fallback — local dev only
if (!process.env.VERCEL) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
  });
}

module.exports = app;
