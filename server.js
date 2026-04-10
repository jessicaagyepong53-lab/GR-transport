// ─── GR-TRANSPORT SERVER ENTRY POINT ─────────────────────────────────────────
// Bootstraps the Express server from server/index.js (local dev only)
const app = require('./server/index');
const connectDB = require('./server/config/db');

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`\n  ✓ GR-Transport server running on http://localhost:${PORT}\n  ✓ Open http://localhost:${PORT} in your browser\n`);
  try { await connectDB(); } catch (e) { console.error('DB connection failed:', e.message); }
});
