// Seed script — populates MongoDB with the default data from the dashboard
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Truck = require('./models/Truck');
const YearEntry = require('./models/YearEntry');
const MonthlyEntry = require('./models/MonthlyEntry');
const ExpenseBreakdown = require('./models/ExpenseBreakdown');

const DEFAULT_DATA = {
  trucks: {
    'GT 6350-19': { driver: 'Paapa', startDates: { 2024: '2024-04-08', 2025: '2025-01-01' }, purchaseYear: 2024, cost: { initialValue: 395000, pricePaid: 330000, maintenanceCost: 65000 }, years: { 2024: { gross:219000, exp:81260, net:137740, weeks:38 }, 2025: { gross:29000, exp:6270, net:22730, weeks:6 } } },
    'GN 4106-18': { driver: 'Issac/Alfred', driverNotes: 'Issac drove from start; Alfred took over 2nd week of Sep 2025', startDates: { 2024: '2024-09-05', 2025: '2025-01-01', 2026: '2026-01-01' }, purchaseYear: 2024, cost: { initialValue: 335000, pricePaid: 270000, maintenanceCost: 65000 }, endOfTerm: { active: true, date: '2026-03-07' }, years: { 2024: { gross:101000, exp:19720, net:81280, weeks:17 }, 2025: { gross:329000, exp:151230, net:177770, weeks:51 }, 2026: { gross:59000, exp:1770, net:57230, weeks:9 } } },
    'GW 1568-22 OLD': { driver: 'Oliver', startDates: { 2024: '2024-10-25', 2025: '2025-01-01', 2026: '2026-01-01' }, purchaseYear: 2024, cost: { initialValue: 580000, pricePaid: 550000, maintenanceCost: 3000 }, years: { 2024: { gross:65000, exp:16850, net:48150, weeks:10 }, 2025: { gross:372000, exp:126030, net:245970, weeks:51 }, 2026: { gross:23000, exp:28070, net:-5070, weeks:4 } } },
    'GN 1674-21': { driver: 'JAT', startDates: { 2025: '2025-03-18', 2026: '2026-01-01' }, purchaseYear: 2025, cost: { initialValue: 661000, pricePaid: 650000, maintenanceCost: 11000 }, years: { 2025: { gross:257000, exp:71490, net:185510, weeks:33 }, 2026: { gross:166500, exp:39420, net:127080, weeks:11 } } },
    'GN 4394-25': { driver: 'ATL Isaac', startDates: { 2025: '2025-09-07', 2026: '2026-01-01' }, purchaseYear: 2025, cost: { initialValue: 866000, pricePaid: 856000, maintenanceCost: 80000 }, years: { 2025: { gross:166500, exp:5070, net:161430, weeks:16 }, 2026: { gross:113000, exp:39420, net:73580, weeks:11 } } },
    'GX 4502-22 NEW': { driver: 'Agoe', startDates: { 2025: '2025-11-19', 2026: '2026-01-01' }, purchaseYear: 2025, cost: { initialValue: 568000, pricePaid: 500000, maintenanceCost: 68000 }, years: { 2025: { gross:46000, exp:4150, net:41850, weeks:6 }, 2026: { gross:90000, exp:5020, net:84980, weeks:11 } } },
    'GN 626-26': { driver: '', startDates: {}, purchaseYear: 2026, cost: { initialValue: 0, pricePaid: 0, maintenanceCost: 0 }, years: { 2026: { gross:0, exp:0, net:0, weeks:0 } } },
    'GN 4107-26': { driver: '', startDates: {}, purchaseYear: 2026, cost: { initialValue: 0, pricePaid: 0, maintenanceCost: 0 }, years: { 2026: { gross:0, exp:0, net:0, weeks:0 } } },
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
  }
};

async function seed() {
  await connectDB();
  console.log('Seeding database...');

  // Clear existing data
  await Promise.all([
    Truck.deleteMany({}),
    YearEntry.deleteMany({}),
    MonthlyEntry.deleteMany({}),
    ExpenseBreakdown.deleteMany({})
  ]);
  console.log('Cleared existing data');

  // Seed trucks and year entries
  for (const [truckId, data] of Object.entries(DEFAULT_DATA.trucks)) {
    await Truck.create({
      truckId,
      driver: data.driver,
      driverNotes: data.driverNotes || '',
      startDates: data.startDates || {},
      purchaseYear: data.purchaseYear || undefined,
      cost: data.cost || { initialValue: 0, pricePaid: 0, maintenanceCost: 0 },
      endOfTerm: data.endOfTerm || { active: false, date: '' }
    });

    for (const [year, entry] of Object.entries(data.years)) {
      await YearEntry.create({
        truckId,
        year: parseInt(year),
        gross: entry.gross,
        exp: entry.exp,
        net: entry.net,
        weeks: entry.weeks
      });
    }
    console.log(`  Truck ${truckId} seeded`);
  }

  // Seed monthly entries
  for (const [year, data] of Object.entries(DEFAULT_DATA.monthly)) {
    for (let i = 0; i < data.labels.length; i++) {
      await MonthlyEntry.create({
        truckId: '_fleet',
        year: parseInt(year),
        month: data.labels[i],
        gross: data.gross[i],
        exp: data.exp[i]
      });
    }
    console.log(`  Monthly ${year} seeded (${data.labels.length} months)`);
  }

  // Seed expense breakdowns
  for (const [year, data] of Object.entries(DEFAULT_DATA.expBreakdown)) {
    await ExpenseBreakdown.create({
      year: parseInt(year),
      maint: data.maint,
      other: data.other
    });
    console.log(`  Expense breakdown ${year} seeded`);
  }

  console.log('Seed complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
