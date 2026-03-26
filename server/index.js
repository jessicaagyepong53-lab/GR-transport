require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const app = express();

// Connect to MongoDB first, then set up session store using the same connection
const dbReady = connectDB();
const clientPromise = dbReady.then(() => mongoose.connection.getClient());

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
app.use(cors({ origin: true, credentials: true }));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Session (MongoDB-backed, reuses the existing mongoose connection)
const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1); // Trust Vercel's proxy
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-me',
  resave: true,
  saveUninitialized: false,
  store: MongoStore.create({ clientPromise }),
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

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
