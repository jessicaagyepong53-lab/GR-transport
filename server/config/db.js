const mongoose = require('mongoose');

let cachedConnection = null;

async function connectDB() {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI not set');
  }
  cachedConnection = await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });
  console.log('MongoDB connected');
  return cachedConnection;
}

module.exports = connectDB;
