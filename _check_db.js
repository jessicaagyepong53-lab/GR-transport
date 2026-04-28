require('dotenv').config();
const connectDB = require('./server/config/db');
const WeeklyEntry = require('./server/models/WeeklyEntry');
const YearEntry = require('./server/models/YearEntry');
const Truck = require('./server/models/Truck');
const MonthlyEntry = require('./server/models/MonthlyEntry');

(async () => {
  await connectDB();

  const truckCount = await Truck.countDocuments();
  const yearCount = await YearEntry.countDocuments();
  const weeklyCount = await WeeklyEntry.countDocuments();
  const monthlyCount = await MonthlyEntry.countDocuments();

  console.log('=== DATABASE AUDIT ===');
  console.log('Trucks:', truckCount);
  console.log('YearEntries:', yearCount);
  console.log('WeeklyEntries total:', weeklyCount);
  console.log('MonthlyEntries:', monthlyCount);

  console.log('\n--- Weekly entries by truck/year ---');
  const all = await WeeklyEntry.find({}, 'truckId year week gross maint other').sort({ truckId: 1, year: 1, week: 1 });
  const groups = {};
  all.forEach(e => {
    const k = e.truckId + ' | ' + e.year;
    if (!groups[k]) groups[k] = [];
    groups[k].push(e.week);
  });
  Object.entries(groups).forEach(([k, weeks]) => {
    console.log(' ', k, '->', weeks.length, 'weeks:', weeks.join(','));
  });

  if (weeklyCount === 0) {
    console.log('\n⚠️  NO WEEKLY ENTRIES FOUND IN DATABASE');
  }

  console.log('\n--- Year entries ---');
  const years = await YearEntry.find({}).sort({ truckId: 1, year: 1 });
  years.forEach(e => console.log(' ', e.truckId, e.year, '| gross:', e.gross, 'net:', e.net, 'weeks:', e.weeks));

  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
