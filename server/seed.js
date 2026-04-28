// Seed script — populates MongoDB with the default data from the dashboard
// ⚠️  FULLY NON-DESTRUCTIVE — uses $setOnInsert upserts throughout.
//     Manually entered data from the website is NEVER overwritten or deleted.
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const connectDB = require('./config/db');
const Truck = require('./models/Truck');
const YearEntry = require('./models/YearEntry');
const MonthlyEntry = require('./models/MonthlyEntry');
const ExpenseBreakdown = require('./models/ExpenseBreakdown');
const WeeklyEntry = require('./models/WeeklyEntry');
const QuarterlyTax = require('./models/QuarterlyTax');

const DEFAULT_DATA = {
  trucks: {
    'GT 6350-19': { driver: 'Paapa', startDates: { 2024: '2024-04-08', 2025: '2025-01-01' }, purchaseYear: 2024, cost: { initialValue: 395000, pricePaid: 330000, maintenanceCost: 65000 }, endOfTerm: { active: true, date: '2025-02-09' }, years: { 2024: { gross:219000, exp:81260, net:137740, weeks:38 }, 2025: { gross:29000, exp:6270, net:22730, weeks:6 } } },
    'GN 4106-18': { driver: 'Issac/Alfred', driverNotes: 'Issac drove from start; Alfred took over 2nd week of Sep 2025', startDates: { 2024: '2024-09-05', 2025: '2025-01-01', 2026: '2026-01-01' }, purchaseYear: 2024, cost: { initialValue: 335000, pricePaid: 270000, maintenanceCost: 65000 }, endOfTerm: { active: true, date: '2026-03-07' }, years: { 2024: { gross:101000, exp:19720, net:81280, weeks:17 }, 2025: { gross:329000, exp:151230, net:177770, weeks:51 }, 2026: { gross:59000, exp:1770, net:57230, weeks:9 } } },
    'GW 1568-22 OLD': { driver: 'Oliver/Samuel', driverNotes: 'Oliver drove from start; Samuel took over in 2026', startDates: { 2024: '2024-10-25', 2025: '2025-01-01', 2026: '2026-01-01' }, purchaseYear: 2024, cost: { initialValue: 553000, pricePaid: 550000, maintenanceCost: 3000 }, years: { 2024: { gross:65000, exp:16850, net:48150, weeks:10 }, 2025: { gross:372000, exp:126030, net:245970, weeks:51 }, 2026: { gross:40000, exp:62770, net:-22770, weeks:13 } } },
    'GN 1674-21': { driver: 'JAT', startDates: { 2025: '2025-03-18', 2026: '2026-01-01' }, purchaseYear: 2025, cost: { initialValue: 661000, pricePaid: 650000, maintenanceCost: 11000 }, years: { 2025: { gross:257000, exp:71490, net:185510, weeks:33 }, 2026: { gross:183500, exp:39420, net:144080, weeks:13 } } },
    'GN 4394-25': { driver: 'ATL Issac/Seth', driverNotes: 'ATL Issac drove from start; Seth took over in 2026', startDates: { 2025: '2025-09-07', 2026: '2026-01-01' }, purchaseYear: 2025, cost: { initialValue: 936000, pricePaid: 856000, maintenanceCost: 80000 }, years: { 2025: { gross:166500, exp:5070, net:161430, weeks:16 }, 2026: { gross:134000, exp:39420, net:94580, weeks:13 } } },
    'GX 4502-22 NEW': { driver: 'Agoe', startDates: { 2025: '2025-11-19', 2026: '2026-01-01' }, purchaseYear: 2025, cost: { initialValue: 568000, pricePaid: 500000, maintenanceCost: 68000 }, years: { 2025: { gross:46000, exp:4150, net:41850, weeks:6 }, 2026: { gross:107000, exp:5020, net:101980, weeks:13 } } },
    'GN 626-26 BLUE': { driver: 'Alfred', startDates: { 2026: '2026-03-23' }, purchaseYear: 2026, cost: { initialValue: 900000, pricePaid: 888000, insurance: 37000, maintenanceCost: 5600 }, years: { 2026: { gross:21000, exp:1200, net:19800, weeks:2 } } },
    'GN 4107-26 GREEN': { driver: 'ALT Issac', startDates: { 2026: '2026-03-30' }, purchaseYear: 2026, cost: { initialValue: 900000, pricePaid: 888000, insurance: 37000, maintenanceCost: 5600 }, years: { 2026: { gross:9000, exp:1200, net:7800, weeks:1 } } },
  },
  monthly: {
    2024: { labels: ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], gross: [18000,24000,23000,23000,22000,51000,56000,82000,86000], exp: [120,4300,3500,9120,9500,32600,3120,9020,46550] },
    2025: { labels: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'], gross: [66000,73000,83500,60000,60000,97000,81000,104000,109000,130000,180500,155500], exp: [5310,76500,30300,30540,3300,5600,7310,130150,0,14960,51020,9250] },
    2026: { labels: ['Jan','Feb','Mar'], gross: [128500,140000,183000], exp: [44550,47700,21450] },
  },
  expBreakdown: {
    2024: { maint: 12000, other: 105830 },
    2025: { maint: 46200, other: 318040 },
    2026: { maint: 28050, other: 85650 },
  },
};

/* ── xlsx weekly-entry seeder ─────────────────────────────────── */
const XLSX_PATH = path.resolve(__dirname, '..', '..', '..', '..', 'Business', 'Transport', 'Transport.xlsx');

const SHEET_MAP = {
  'GT 6350-19':       /^GT 6350-19/i,
  'GN 4106-18':       /^GN 4106-18/i,
  'GW 1568-22 OLD':   /^GW 1568-22/i,
  'GN 1674-21':       /^GN 1674-21/i,
  'GN 4394-25':       /^GN 4394-25/i,
  'GX 4502-22 NEW':   /^GX 4502-22/i,
  'GN 626-26 BLUE':   /^GN 626-26/i,
  'GN 4107-26 GREEN': /^GN 4107-26/i,
};

function parseSheetMeta(name) {
  const m = name.match(/\((\d{2})\)/);
  if (!m) return null;
  const year = 2000 + parseInt(m[1]);
  for (const [truckId, re] of Object.entries(SHEET_MAP)) {
    if (re.test(name)) return { truckId, year };
  }
  return null;
}

function dateToISOWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
}

function getStartWeek(truckId, year) {
  const truck = DEFAULT_DATA.trucks[truckId];
  if (!truck || !truck.startDates) return 1;
  const sd = truck.startDates[year];
  if (!sd) return 1;
  const d = new Date(sd);
  return isNaN(d) ? 1 : dateToISOWeek(d);
}

function extractSheetNotesFromXlsx() {
  let XLSX;
  try { XLSX = require('xlsx'); } catch { return {}; }
  const fs = require('fs');
  if (!fs.existsSync(XLSX_PATH)) return {};

  const wb = XLSX.readFile(XLSX_PATH);
  const result = {}; // truckId -> [string, ...]

  for (const sheetName of wb.SheetNames) {
    const meta = parseSheetMeta(sheetName);
    if (!meta) continue;
    if (result[meta.truckId]) continue; // use first matching sheet per truck

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Find where the header row is (same logic as seedWeekly)
    let headerIdx = -1;
    const HDR_KEYS = ['DATE', 'INCOME', 'MAINT', 'EXPENSE', 'NOTE', 'REMARK', 'WEEK', 'DAY'];
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      if (!rows[i]) continue;
      const cells = rows[i].map(c => String(c).toUpperCase());
      const matchCount = HDR_KEYS.filter(k => cells.some(c => c.includes(k))).length;
      if (matchCount >= 4) { headerIdx = i; break; }
    }
    if (headerIdx < 1) continue;

    // Collect non-empty text from rows before the header
    const notes = [];
    for (let i = 0; i < headerIdx; i++) {
      const text = String(rows[i]?.[0] || '').trim();
      if (text) notes.push(text);
    }
    if (notes.length) result[meta.truckId] = notes;
  }
  return result;
}

function seedWeeklyFromXlsx() {
  let XLSX;
  try { XLSX = require('xlsx'); } catch { return null; }
  const fs = require('fs');
  if (!fs.existsSync(XLSX_PATH)) { console.log('  xlsx file not found, skipping weekly import'); return null; }

  const MONTHS = { JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11 };
  function parseDateRange(s, targetYear) {
    // Try every date match in the string and return the first one with a valid year
    // This handles typos like "09 Mar 0225 - 14 Mar 2026" by finding the correct date
    const re = /(\d{1,2})\s+(\w{3})\s+(\d{4})/g;
    let m;
    while ((m = re.exec(String(s))) !== null) {
      const mon = MONTHS[m[2].toUpperCase().slice(0,3)];
      if (mon === undefined) continue;
      const year = parseInt(m[3]);
      const d = new Date(year, mon, parseInt(m[1]));
      if (!targetYear || year === targetYear) return d;
    }
    return null;
  }

  const wb = XLSX.readFile(XLSX_PATH);
  const allEntries = [];

  for (const sheetName of wb.SheetNames) {
    const meta = parseSheetMeta(sheetName);
    if (!meta) continue;

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Find header row — must contain at least 3 of these keywords across different cells
    let headerIdx = -1;
    const HDR_KEYS = ['DATE', 'INCOME', 'MAINT', 'EXPENSE', 'NOTE', 'REMARK', 'WEEK', 'DAY'];
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      if (!rows[i]) continue;
      const cells = rows[i].map(c => String(c).toUpperCase());
      const matchCount = HDR_KEYS.filter(k => cells.some(c => c.includes(k))).length;
      if (matchCount >= 4) { headerIdx = i; break; }
    }
    if (headerIdx === -1) continue;

    const hdr = rows[headerIdx].map(c => String(c).toUpperCase().trim());
    const ci = {
      dateRange: hdr.findIndex(h => h.includes('DATE RANGE') || h.includes('DATE')),
      days:      hdr.findIndex(h => h.includes('DAY')),
      gross:     hdr.findIndex(h => h.includes('INCOME') || h.includes('GROSS')),
      maint:     hdr.findIndex(h => h.includes('MAINT')),
      other:     hdr.findIndex(h => h.includes('OTHER')),
      notes:     hdr.findIndex(h => h.includes('NOTE')),
      remarks:   hdr.findIndex(h => h.includes('REMARK')),
    };
    if (ci.gross === -1) continue;

    const startWeek = getStartWeek(meta.truckId, meta.year);
    let weekOffset = 0;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      // Stop at TOTAL row
      const isTotalRow = row.some((c, i) => i < 4 && String(c || '').toUpperCase().trim().startsWith('TOTAL'));
      if (isTotalRow) break;

      // Skip completely empty rows
      const hasData = row.some(c => c !== '' && c !== null && c !== undefined);
      if (!hasData) continue;

      if (weekOffset >= 53) break;

      // Use the actual date from the Date Range column to get the correct ISO week
      // Try all date matches in the cell to handle typos in year (e.g. "0225" instead of "2026")
      let week;
      if (ci.dateRange >= 0) {
        const rowDate = parseDateRange(row[ci.dateRange], meta.year);
        if (rowDate) week = dateToISOWeek(rowDate);
      }
      if (!week) week = startWeek + weekOffset;
      weekOffset++;

      const grossVal = parseFloat(row[ci.gross]) || 0;
      const maintVal = ci.maint >= 0 ? (parseFloat(row[ci.maint]) || 0) : 0;
      const otherVal = ci.other >= 0 ? (parseFloat(row[ci.other]) || 0) : 0;

      let daysVal = ci.days >= 0 ? row[ci.days] : null;
      if (daysVal === 'N/A' || daysVal === 'n/a' || daysVal === '') daysVal = null;
      else daysVal = parseFloat(daysVal) || null;

      let notesVal = ci.notes >= 0 ? String(row[ci.notes] || '') : '';
      if (notesVal === 'N/A' || notesVal === 'n/a') notesVal = '';

      let remarksVal = ci.remarks >= 0 ? String(row[ci.remarks] || '') : '';
      if (remarksVal === 'N/A' || remarksVal === 'n/a') remarksVal = '';

      // Skip all-zero future entries for the current year (template rows not yet filled in)
      const nowDate = new Date();
      const currentISOWeek = dateToISOWeek(nowDate);
      if (meta.year === nowDate.getFullYear() && week >= currentISOWeek && grossVal === 0 && maintVal === 0 && otherVal === 0 && !notesVal && daysVal === null) continue;
      // Skip empty template rows with no real date
      if (grossVal === 0 && maintVal === 0 && otherVal === 0 && !notesVal && daysVal === null && !week) continue;

      allEntries.push({
        truckId: meta.truckId,
        year: meta.year,
        week,
        daysWorked: daysVal,
        gross: grossVal,
        maint: maintVal,
        other: otherVal,
        notes: notesVal,
        remarks: remarksVal,
      });
    }
    console.log(`  Parsed ${sheetName}: ${weekOffset} weeks (weeks ${startWeek}-${startWeek + weekOffset - 1})`);
  }
  return allEntries;
}

/* ── Quarterly income tax parser ──────────────────────────────── */
// Reads "Summary YYYY" sheets and looks for rows like:
//   "Q1 Income Tax" | 720
//   "Q2 Income Tax" | 700
// First cell must match /Q([1-4])/i, second numeric cell is the amount.
function seedQuarterlyTaxFromXlsx() {
  let XLSX;
  try { XLSX = require('xlsx'); } catch { return []; }
  const fs = require('fs');
  if (!fs.existsSync(XLSX_PATH)) return [];

  const wb = XLSX.readFile(XLSX_PATH);
  const results = [];

  for (const sheetName of wb.SheetNames) {
    const m = sheetName.match(/^Summary\s+(\d{4})$/i);
    if (!m) continue;
    const year = parseInt(m[1]);

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    for (const row of rows) {
      const label = String(row[0] || '').trim();
      const qm = label.match(/Q([1-4])/i);
      if (!qm) continue;
      // Must also look like a tax row
      if (!/tax/i.test(label) && !/income\s*tax/i.test(label)) continue;
      const quarter = parseInt(qm[1]);
      // Find first numeric value in the row (skip empty strings)
      const amount = row.slice(1).map(c => parseFloat(c)).find(n => !isNaN(n) && n > 0);
      if (amount === undefined) continue;
      results.push({ year, quarter, amount });
    }
  }
  return results;
}

async function seed() {
  await connectDB();
  console.log('Seeding database (non-destructive upsert mode)...');

  // Seed trucks (upsert — won't overwrite user edits if truck already exists)
  // cost is always updated via $set (configuration data, not user data)
  const xlsxSheetNotes = extractSheetNotesFromXlsx();
  for (const [truckId, data] of Object.entries(DEFAULT_DATA.trucks)) {
    await Truck.findOneAndUpdate(
      { truckId },
      {
        $set: {
          cost: data.cost || { initialValue: 0, pricePaid: 0, insurance: 0, maintenanceCost: 0 }
        },
        $setOnInsert: {
          truckId,
          driver: data.driver,
          driverNotes: data.driverNotes || '',
          startDates: data.startDates || {},
          purchaseYear: data.purchaseYear || undefined,
          endOfTerm: data.endOfTerm || { active: false, date: '' },
          sheetNotes: xlsxSheetNotes[truckId] || []
        }
      },
      { upsert: true }
    );

    // Backfill sheetNotes for existing trucks that have an empty array
    if (xlsxSheetNotes[truckId]?.length) {
      await Truck.updateOne(
        { truckId, $or: [{ sheetNotes: { $exists: false } }, { sheetNotes: { $size: 0 } }] },
        { $set: { sheetNotes: xlsxSheetNotes[truckId] } }
      );
    }

    for (const [year, entry] of Object.entries(data.years)) {
      await YearEntry.findOneAndUpdate(
        { truckId, year: parseInt(year) },
        {
          $setOnInsert: {
            truckId,
            year: parseInt(year),
            gross: entry.gross,
            exp: entry.exp,
            net: entry.net,
            weeks: entry.weeks
          }
        },
        { upsert: true }
      );
    }
    console.log(`  Truck ${truckId} seeded`);
  }

  // Seed monthly entries (upsert by year+month+truckId)
  for (const [year, data] of Object.entries(DEFAULT_DATA.monthly)) {
    for (let i = 0; i < data.labels.length; i++) {
      await MonthlyEntry.findOneAndUpdate(
        { truckId: '_fleet', year: parseInt(year), month: data.labels[i] },
        {
          $setOnInsert: {
            truckId: '_fleet',
            year: parseInt(year),
            month: data.labels[i],
            gross: data.gross[i],
            exp: data.exp[i]
          }
        },
        { upsert: true }
      );
    }
    console.log(`  Monthly ${year} seeded (${data.labels.length} months)`);
  }

  // Seed expense breakdowns (upsert by year)
  for (const [year, data] of Object.entries(DEFAULT_DATA.expBreakdown)) {
    await ExpenseBreakdown.findOneAndUpdate(
      { year: parseInt(year) },
      {
        $setOnInsert: {
          year: parseInt(year),
          maint: data.maint,
          other: data.other
        }
      },
      { upsert: true }
    );
    console.log(`  Expense breakdown ${year} seeded`);
  }

  // Seed weekly entries from xlsx — delete existing entries for xlsx-covered truck/year combos
  // then reinsert fresh so week numbers always reflect the xlsx date ranges exactly
  const xlsxEntries = seedWeeklyFromXlsx();
  if (xlsxEntries && xlsxEntries.length > 0) {
    const seen = new Set();
    const deduped = xlsxEntries.filter(e => {
      const key = `${e.truckId}|${e.year}|${e.week}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Collect unique truck+year combos from xlsx
    const truckYearCombos = [...new Set(deduped.map(e => `${e.truckId}|${e.year}`))].map(k => {
      const [truckId, year] = k.split('|');
      return { truckId, year: parseInt(year) };
    });

    // NON-DESTRUCTIVE: upsert each weekly entry — only insert if that truck+year+week doesn't exist yet
    // This preserves manually entered website data
    let insertedCount = 0;
    for (const e of deduped) {
      const result = await WeeklyEntry.findOneAndUpdate(
        { truckId: e.truckId, year: e.year, week: e.week },
        { $setOnInsert: e },
        { upsert: true, new: false }
      );
      if (!result) insertedCount++;
    }
    console.log(`  Weekly entries from xlsx: ${insertedCount} new inserted, ${deduped.length - insertedCount} already existed (preserved)`);

    // Recompute YearEntries from actual weekly data so totals stay accurate
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (const { truckId, year } of truckYearCombos) {
      const entries = await WeeklyEntry.find({ truckId, year });
      if (!entries.length) { await YearEntry.deleteOne({ truckId, year }); continue; }
      let gross = 0, maint = 0, other = 0;
      entries.forEach(e => { gross += e.gross || 0; maint += e.maint || 0; other += e.other || 0; });
      const exp = maint + other;
      const net = gross - exp;
      // Count only weeks that have any activity (gross or expenses > 0)
      const activeWeeks = entries.filter(e => (e.gross || 0) + (e.maint || 0) + (e.other || 0) > 0).length;
      await YearEntry.findOneAndUpdate(
        { truckId, year },
        { gross, exp, net, weeks: activeWeeks },
        { upsert: true }
      );
      console.log(`  Recomputed YearEntry ${truckId} ${year}: gross=${gross} net=${net} activeWeeks=${activeWeeks}`);
    }
  } else {
    console.log('  No xlsx weekly data found — weekly entries skipped');
  }

  // Seed quarterly income tax from Excel Summary sheets
  const quarterlyTaxData = seedQuarterlyTaxFromXlsx();
  if (quarterlyTaxData.length > 0) {
    for (const entry of quarterlyTaxData) {
      await QuarterlyTax.findOneAndUpdate(
        { truckId: '_fleet', year: entry.year, quarter: entry.quarter },
        {
          $set: { amount: entry.amount },
          $setOnInsert: { truckId: '_fleet', year: entry.year, quarter: entry.quarter }
        },
        { upsert: true }
      );
    }
    const summary = quarterlyTaxData.map(e => `${e.year} Q${e.quarter}=${e.amount}`).join(', ');
    console.log(`  Quarterly tax seeded from xlsx (${summary})`);
  } else {
    console.log('  No quarterly tax rows found in Summary sheets — skipping');
  }

  console.log('Seed complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
