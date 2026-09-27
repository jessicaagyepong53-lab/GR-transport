const test = require('node:test');
const assert = require('node:assert/strict');
const { computeUtilization, mergedDaySpan, dayRange } = require('./equipmentHelpers');

// ─── dayRange ───────────────────────────────────────────────────────────────
test('dayRange: returns null for malformed or inverted dates', () => {
  assert.equal(dayRange('not-a-date', '2026-01-10'), null);
  assert.equal(dayRange('2026-01-10', '2026-01-01'), null); // end before start
  assert.equal(dayRange(undefined, '2026-01-10'), null);
});

test('dayRange: returns a valid range for good dates', () => {
  const r = dayRange('2026-01-01', '2026-01-05');
  assert.ok(r);
  assert.ok(r.end > r.start);
});

// ─── mergedDaySpan ──────────────────────────────────────────────────────────
test('mergedDaySpan: single range counts inclusive days', () => {
  const days = mergedDaySpan([dayRange('2026-01-01', '2026-01-05')]);
  assert.equal(days, 5);
});

test('mergedDaySpan: overlapping ranges merge instead of double-counting', () => {
  const ranges = [
    dayRange('2026-01-01', '2026-01-10'),
    dayRange('2026-01-05', '2026-01-15'),
  ];
  const days = mergedDaySpan(ranges);
  assert.equal(days, 15); // Jan 1–15 inclusive, not 10+11=21
});

test('mergedDaySpan: non-overlapping ranges sum independently', () => {
  const ranges = [
    dayRange('2026-01-01', '2026-01-05'),
    dayRange('2026-02-01', '2026-02-05'),
  ];
  const days = mergedDaySpan(ranges);
  assert.equal(days, 10);
});

test('mergedDaySpan: empty input returns 0', () => {
  assert.equal(mergedDaySpan([]), 0);
});

// ─── computeUtilization ─────────────────────────────────────────────────────
test('computeUtilization: 100% cap under overlapping contracts on the same unit', () => {
  const equipment = [{ equipmentId: 'MX-01', category: 'mixer', createdAt: '2026-01-01' }];
  const contracts = [
    { items: [{ equipmentId: 'MX-01', quantity: 1 }], startDate: '2026-01-01', endDate: '2026-01-10', totalValue: 1000 },
    { items: [{ equipmentId: 'MX-01', quantity: 1 }], startDate: '2026-01-01', endDate: '2026-01-10', totalValue: 1000 },
  ];
  const [result] = computeUtilization(equipment, contracts, { rangeStart: '2026-01-01', rangeEnd: '2026-01-10' });
  assert.equal(result.utilizationPct, 100);
  assert.equal(result.daysOnHire, 10);
});

test('computeUtilization: income split proportionally across a multi-item contract', () => {
  const equipment = [
    { equipmentId: 'MX-01', category: 'mixer', createdAt: '2026-01-01' },
    { equipmentId: 'SC-01', category: 'scaffold', createdAt: '2026-01-01' },
  ];
  const contracts = [{
    items: [
      { equipmentId: 'MX-01', quantity: 1 },
      { equipmentId: 'SC-01', quantity: 3 },
    ],
    startDate: '2026-01-01', endDate: '2026-01-05',
    totalValue: 400,
  }];
  const results = computeUtilization(equipment, contracts, { rangeStart: '2026-01-01', rangeEnd: '2026-01-05' });
  const mx = results.find(r => r.equipmentId === 'MX-01');
  const sc = results.find(r => r.equipmentId === 'SC-01');
  // total qty = 4; MX-01 gets 1/4 = 100, SC-01 gets 3/4 = 300
  assert.equal(mx.income, 100);
  assert.equal(sc.income, 300);
});

test('computeUtilization: malformed dates on one contract are skipped, not thrown', () => {
  const equipment = [{ equipmentId: 'MX-01', category: 'mixer', createdAt: '2026-01-01' }];
  const contracts = [
    { items: [{ equipmentId: 'MX-01', quantity: 1 }], startDate: 'garbage', endDate: 'also-garbage', totalValue: 500 },
  ];
  assert.doesNotThrow(() => computeUtilization(equipment, contracts, { rangeStart: '2026-01-01', rangeEnd: '2026-01-10' }));
  const [result] = computeUtilization(equipment, contracts, { rangeStart: '2026-01-01', rangeEnd: '2026-01-10' });
  assert.equal(result.daysOnHire, 0);
  assert.equal(result.income, 500); // income still counted even though the date range was unusable
});

test('computeUtilization: sorts by utilization desc, then income desc', () => {
  const equipment = [
    { equipmentId: 'A', category: 'mixer', createdAt: '2026-01-01' },
    { equipmentId: 'B', category: 'mixer', createdAt: '2026-01-01' },
  ];
  const contracts = [
    { items: [{ equipmentId: 'A', quantity: 1 }], startDate: '2026-01-01', endDate: '2026-01-02', totalValue: 100 },
    { items: [{ equipmentId: 'B', quantity: 1 }], startDate: '2026-01-01', endDate: '2026-01-10', totalValue: 900 },
  ];
  const results = computeUtilization(equipment, contracts, { rangeStart: '2026-01-01', rangeEnd: '2026-01-10' });
  assert.equal(results[0].equipmentId, 'B'); // higher utilization
});

test('computeUtilization: equipment with no matching contracts still appears at 0%', () => {
  const equipment = [{ equipmentId: 'IDLE-01', category: 'scaffold', createdAt: '2026-01-01' }];
  const [result] = computeUtilization(equipment, [], { rangeStart: '2026-01-01', rangeEnd: '2026-01-10' });
  assert.equal(result.utilizationPct, 0);
  assert.equal(result.income, 0);
});