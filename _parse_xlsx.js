const XLSX = require('xlsx');
const path = require('path');

const file = 'C:\\Users\\ADMIN\\Desktop\\Business\\Transport\\Transport.xlsx';
const wb = XLSX.readFile(file);

console.log('Sheet names:', JSON.stringify(wb.SheetNames));
console.log('Total sheets:', wb.SheetNames.length);

wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const ref = ws['!ref'] || 'A1';
  const range = XLSX.utils.decode_range(ref);
  const rows = range.e.r + 1;
  const cols = range.e.c + 1;
  console.log('\n========================================');
  console.log('SHEET: ' + name + ' (rows: ' + rows + ', cols: ' + cols + ')');
  console.log('========================================');
  const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  // Print all rows for understanding the structure
  json.forEach((r, i) => {
    const cleaned = r.map(c => {
      if (c === '') return '';
      if (typeof c === 'number') return c;
      return String(c).trim();
    });
    // Skip fully empty rows
    if (cleaned.every(c => c === '' || c === 0)) return;
    console.log('  R' + i + ': ' + JSON.stringify(cleaned));
  });
});
