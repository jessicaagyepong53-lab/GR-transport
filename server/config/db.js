const mongoose = require('mongoose');

let cachedPromise = null;

async function connectDB() {
  // Already connected
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  // If a previous attempt is in progress, reuse it
  if (cachedPromise) {
    return cachedPromise;
  }
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI not set');
  }
  cachedPromise = mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  }).then(conn => {
    console.log('MongoDB connected');
    return conn;
  }).catch(err => {
    // Clear cache so next call retries instead of returning the failed promise
    cachedPromise = null;
    throw err;
  });
  return cachedPromise;
}

module.exports = connectDB;
