// ─── XLSX → MongoDB Weekly Seeder ──────────────────────────────────────────
// Reads Transport.xlsx and seeds WeeklyEntry documents for every truck/year sheet.
// Run: node _seed_from_xlsx.js

require('dotenv').config();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const path = require('path');
const connectDB = require('./server/config/db');
const WeeklyEntry = require('./server/models/WeeklyEntry');

// ─── Sheet name → { truckId, year } mapping ─────────────────────────────────
function parseSheetMeta(name) {
  // e.g. "GT 6350-19(24)" → { truckId: 'GT 6350-19', year: 2024 }
  // e.g. "GN 1674-21 (25)" → { truckId: 'GN 1674-21', year: 2025 }
  // e.g. "GN 626-26 (26) - Blue" → { truckId: 'GN 626-26 BLUE', year: 2026 }
  // e.g. "GN 4107-26 (26) - Green" → { truckId: 'GN 4107-26 GREEN', year: 2026 }
  // e.g. "GW 1568-22 OLD (24) " → { truckId: 'GW 1568-22 OLD', year: 2024 }
  // e.g. "GX 4502-22 NEW (25)" → { truckId: 'GX 4502-22 NEW', year: 2025 }

  // Match pattern: truck-part (YY) optional-suffix
  const m = name.match(/^(.+?)\s*\((\d{2})\)\s*(?:-\s*(.+))?$/);
  if (!m) return null;

  let truckId = m[1].trim();
  const yearShort = parseInt(m[2]);
  const year = 2000 + yearShort;
  const suffix = m[3] ? m[3].trim().toUpperCase() : '';

  // Append suffix like "BLUE" or "GREEN" to truckId
  if (suffix) truckId = truckId + ' ' + suffix;

  return { truckId, year };
}

// ─── Date string → ISO week number ─────────────────────────────────────────
function dateToISOWeek(dateStr, year) {
  // Parse dates like "08 Apr  2024 - 14 Apr  2024" or "05 Jan 2026 -10 Jan 2026"
  // We take the start date (Monday)
  const parts = dateStr.split(/\s*[-–]\s*/);
  const startPart = parts[0].trim();

  // Try to parse the start date
  const d = new Date(startPart);
  if (isNaN(d.getTime())) {
    // Manual parse: "08 Apr  2024" or "1 Jan 2025"
    const tokens = startPart.split(/\s+/).filter(Boolean);
    if (tokens.length >= 3) {
      const months = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
      const day = parseInt(tokens[0]);
      const mon = months[tokens[1]];
      let yr = parseInt(tokens[2]);
      // Fix typos like "0225" → 2025
      if (yr < 100) yr = 2000 + yr;
      if (yr > 2100) yr = Math.round(yr / 10); // handle 0225 → 2025-ish
      if (mon !== undefined && !isNaN(day)) {
        const dd = new Date(yr, mon, day);
        return getISOWeek(dd);
      }
    }
    return null;
  }
  return getISOWeek(d);
}

function getISOWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const xlsxPath = path.resolve('C:\\Users\\ADMIN\\Desktop\\Business\\Transport\\Transport.xlsx');
  console.log('Reading:', xlsxPath);
  const wb = XLSX.readFile(xlsxPath);

  await connectDB();
  console.log('Connected to MongoDB');

  // Clear all existing weekly entries
  await WeeklyEntry.deleteMany({});
  console.log('Cleared existing weekly entries');

  let totalSeeded = 0;

  for (const sheetName of wb.SheetNames) {
    const meta = parseSheetMeta(sheetName);
    if (!meta) continue; // Skip Summary, Pie Chart, Graph, Master sheets

    const { truckId, year } = meta;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Find header row (contains "Month", "Week", "Date Range")
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const row = rows[i].map(c => String(c).trim().toLowerCase());
      if (row.includes('month') && row.includes('week')) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) {
      console.log('  SKIP: ' + sheetName + ' (no header row found)');
      continue;
    }

    // Data rows start after header
    const dataRows = rows.slice(headerIdx + 1);
    const entries = [];

    for (const row of dataRows) {
      const month = String(row[0] || '').trim();
      const weekLabel = String(row[1] || '').trim();
      const dateRange = String(row[2] || '').trim();
      const rawDays = row[3];
      const gross = Number(row[4]) || 0;
      const maint = Number(row[5]) || 0;
      const other = Number(row[6]) || 0;
      // row[7] = Total Expenditure (computed), row[8] = Total Income (computed), row[9] = Break Even (computed)
      const notes = String(row[10] || '').trim();
      const remarks = String(row[11] || '').trim();

      // Skip TOTAL row and empty rows
      if (month === 'TOTAL:' || month === '') continue;
      if (!weekLabel.startsWith('Week')) continue;

      // Parse daysWorked
      let daysWorked = null;
      if (rawDays !== 'N/A' && rawDays !== '' && !isNaN(Number(rawDays))) {
        daysWorked = Number(rawDays);
      }

      // Calculate ISO week from date range
      const isoWeek = dateToISOWeek(dateRange, year);
      if (!isoWeek) {
        console.log('  WARN: Could not parse date for ' + truckId + ' ' + year + ': "' + dateRange + '"');
        continue;
      }

      // Clean notes: replace "N/A" with empty
      const cleanNotes = (notes === 'N/A' || notes === 'n/a') ? '' : notes;
      const cleanRemarks = (remarks === 'N/A' || remarks === 'n/a') ? '' : remarks;

      entries.push({
        truckId,
        year,
        week: isoWeek,
        daysWorked,
        gross,
        maint,
        other,
        notes: cleanNotes,
        remarks: cleanRemarks,
      });
    }

    if (entries.length === 0) {
      console.log('  SKIP: ' + sheetName + ' (no data rows)');
      continue;
    }

    // Deduplicate by week (in case of overlapping ISO weeks)
    const seen = new Set();
    const unique = [];
    for (const e of entries) {
      const key = e.week;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(e);
      }
    }

    // Bulk insert
    try {
      await WeeklyEntry.insertMany(unique, { ordered: false });
      console.log('  ' + truckId + ' ' + year + ': seeded ' + unique.length + ' weeks (from ' + sheetName + ')');
      totalSeeded += unique.length;
    } catch (err) {
      if (err.code === 11000) {
        // Duplicate key — some entries already exist, try one by one
        let inserted = 0;
        for (const e of unique) {
          try {
            await WeeklyEntry.create(e);
            inserted++;
          } catch { /* skip duplicates */ }
        }
        console.log('  ' + truckId + ' ' + year + ': seeded ' + inserted + '/' + unique.length + ' weeks (dupes skipped)');
        totalSeeded += inserted;
      } else {
        console.error('  ERROR seeding ' + sheetName + ':', err.message);
      }
    }
  }

  console.log('\nTotal weekly entries seeded: ' + totalSeeded);
  await mongoose.connection.close();
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
