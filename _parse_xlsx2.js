const XLSX = require('xlsx');
const wb = XLSX.readFile('C:\\Users\\ADMIN\\Desktop\\Business\\Transport\\Transport.xlsx');

// Print ALL sheet names first
console.log('ALL SHEETS:');
wb.SheetNames.forEach((n, i) => console.log('  ' + i + ': ' + n));

// Now dump the 2024 and 2025 weekly sheets (ones with data rows 7+)
const targets = wb.SheetNames.filter(n => {
  // Only sheets that contain year markers 24 or 25: e.g. "GT 6350-19 (24)", "GN 4106-18 (25)"
  return /\(24\)|\(25\)/.test(n);
});

console.log('\n--- 2024/2025 sheets ---');
console.log(JSON.stringify(targets));

targets.forEach(name => {
  const ws = wb.Sheets[name];
  const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log('\n========================================');
  console.log('SHEET: ' + name + ' (total rows: ' + json.length + ')');
  console.log('========================================');
  json.forEach((r, i) => {
    const cleaned = r.map(c => {
      if (c === '') return '';
      if (typeof c === 'number') return c;
      return String(c).trim();
    });
    if (cleaned.every(c => c === '' || c === 0)) return;
    console.log('  R' + i + ': ' + JSON.stringify(cleaned));
  });
});
