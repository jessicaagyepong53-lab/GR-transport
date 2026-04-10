require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

// Connect to MongoDB
const dbReady = connectDB();

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

// Health check — test DB connection on Vercel
app.get('/api/health', async (req, res) => {
  try {
    await dbReady;
    const mongoose = require('mongoose');
    const state = mongoose.connection.readyState; // 1 = connected
    res.json({ status: 'ok', db: state === 1 ? 'connected' : 'disconnected', env: {
      MONGO_URI: process.env.MONGO_URI ? 'set' : 'NOT SET',
      JWT_SECRET: process.env.JWT_SECRET ? 'set' : 'NOT SET (using fallback)',
      NODE_ENV: process.env.NODE_ENV || 'not set',
      VERCEL: process.env.VERCEL || 'not set'
    }});
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

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
