const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateContractItems,
  computePaymentTotals,
  isContractOverdue,
  hasWithheldDeposit,
  buildClientHistory,
} = require('./contractHelpers');

// ─── validateContractItems ─────────────────────────────────────────────────
test('validateContractItems: rejects empty/missing arrays', () => {
  assert.throws(() => validateContractItems([]), /At least one item/);
  assert.throws(() => validateContractItems(undefined), /At least one item/);
});

test('validateContractItems: rejects an invalid category', () => {
  assert.throws(() => validateContractItems([{ category: 'bulldozer', quantity: 1 }]), /category must be one of/);
});

test('validateContractItems: rejects zero/negative quantity', () => {
  assert.throws(() => validateContractItems([{ category: 'mixer', quantity: 0 }]), /quantity must be a positive number/);
  assert.throws(() => validateContractItems([{ category: 'mixer', quantity: -2 }]), /quantity must be a positive number/);
});

test('validateContractItems: defaults quantity to 1 and trims strings', () => {
  const out = validateContractItems([{ category: ' mixer ', equipmentId: ' MX-01 ', description: ' desc ' }]);
  assert.equal(out[0].quantity, 1);
  assert.equal(out[0].category, 'mixer');
  assert.equal(out[0].equipmentId, 'MX-01');
  assert.equal(out[0].description, 'desc');
});

// ─── computePaymentTotals ───────────────────────────────────────────────────
test('computePaymentTotals: unpaid when nothing has been paid', () => {
  const r = computePaymentTotals({ totalValue: 1000, payments: [] });
  assert.equal(r.status, 'unpaid');
  assert.equal(r.balance, 1000);
});

test('computePaymentTotals: partial when paid < totalValue', () => {
  const r = computePaymentTotals({ totalValue: 1000, payments: [{ amount: 400 }] });
  assert.equal(r.status, 'partial');
  assert.equal(r.balance, 600);
});

test('computePaymentTotals: paid exactly at the boundary', () => {
  const r = computePaymentTotals({ totalValue: 1000, payments: [{ amount: 600 }, { amount: 400 }] });
  assert.equal(r.status, 'paid');
  assert.equal(r.balance, 0);
});

test('computePaymentTotals: overpaid when paid exceeds totalValue', () => {
  const r = computePaymentTotals({ totalValue: 1000, payments: [{ amount: 1200 }] });
  assert.equal(r.status, 'overpaid');
  assert.equal(r.balance, -200);
});

test('computePaymentTotals: overpaid when totalValue is 0 but something was paid', () => {
  const r = computePaymentTotals({ totalValue: 0, payments: [{ amount: 50 }] });
  assert.equal(r.status, 'overpaid');
});

test('computePaymentTotals: handles missing payments array', () => {
  const r = computePaymentTotals({ totalValue: 500 });
  assert.equal(r.totalPaid, 0);
  assert.equal(r.status, 'unpaid');
});

// ─── isContractOverdue ──────────────────────────────────────────────────────
test('isContractOverdue: false once returned, regardless of balance', () => {
  const c = { returned: true, totalValue: 500, payments: [], paymentDueDate: '2020-01-01' };
  assert.equal(isContractOverdue(c, new Date('2026-01-01')), false);
});

test('isContractOverdue: false with no balance owing', () => {
  const c = { returned: false, totalValue: 500, payments: [{ amount: 500 }], paymentDueDate: '2020-01-01' };
  assert.equal(isContractOverdue(c, new Date('2026-01-01')), false);
});

test('isContractOverdue: false with no due date set', () => {
  const c = { returned: false, totalValue: 500, payments: [], paymentDueDate: '' };
  assert.equal(isContractOverdue(c, new Date('2026-01-01')), false);
});

test('isContractOverdue: true when balance owing and due date has passed', () => {
  const c = { returned: false, totalValue: 500, payments: [], paymentDueDate: '2020-01-01' };
  assert.equal(isContractOverdue(c, new Date('2026-01-01')), true);
});

test('isContractOverdue: false when due date is in the future', () => {
  const c = { returned: false, totalValue: 500, payments: [], paymentDueDate: '2030-01-01' };
  assert.equal(isContractOverdue(c, new Date('2026-01-01')), false);
});

// ─── hasWithheldDeposit ─────────────────────────────────────────────────────
test('hasWithheldDeposit: false until returned', () => {
  assert.equal(hasWithheldDeposit({ returned: false, deposit: 200, depositRefund: 0 }), false);
});

test('hasWithheldDeposit: false with no deposit taken', () => {
  assert.equal(hasWithheldDeposit({ returned: true, deposit: 0, depositRefund: 0 }), false);
});

test('hasWithheldDeposit: true when refund is less than deposit', () => {
  assert.equal(hasWithheldDeposit({ returned: true, deposit: 200, depositRefund: 50 }), true);
});

test('hasWithheldDeposit: false when fully refunded', () => {
  assert.equal(hasWithheldDeposit({ returned: true, deposit: 200, depositRefund: 200 }), false);
});

// ─── buildClientHistory ─────────────────────────────────────────────────────
test('buildClientHistory: groups clients case-insensitively', () => {
  const contracts = [
    { clientName: 'Kofi Mensah', totalValue: 100, payments: [{ amount: 100 }] },
    { clientName: 'kofi mensah', totalValue: 200, payments: [] },
  ];
  const history = buildClientHistory(contracts);
  assert.equal(history.length, 1);
  assert.equal(history[0].contractCount, 2);
  assert.equal(history[0].totalValue, 300);
});

test('buildClientHistory: flags overdue clients and sorts them first', () => {
  const now = new Date('2026-01-01');
  const contracts = [
    { clientName: 'Big Spender', totalValue: 5000, payments: [{ amount: 5000 }] },
    { clientName: 'Late Payer', totalValue: 100, payments: [], paymentDueDate: '2020-01-01' },
  ];
  const history = buildClientHistory(contracts, { now });
  assert.equal(history[0].clientName, 'Late Payer');
  assert.equal(history[0].flagged, true);
  assert.equal(history[1].flagged, false);
});

test('buildClientHistory: flags withheld-deposit clients', () => {
  const contracts = [
    { clientName: 'Careless Client', totalValue: 100, payments: [{ amount: 100 }], returned: true, deposit: 50, depositRefund: 0 },
  ];
  const history = buildClientHistory(contracts);
  assert.equal(history[0].flagged, true);
  assert.equal(history[0].withheldDepositCount, 1);
});

test('buildClientHistory: unflagged clients sort by total value descending', () => {
  const contracts = [
    { clientName: 'Small', totalValue: 100, payments: [{ amount: 100 }] },
    { clientName: 'Large', totalValue: 900, payments: [{ amount: 900 }] },
  ];
  const history = buildClientHistory(contracts);
  assert.equal(history[0].clientName, 'Large');
  assert.equal(history[1].clientName, 'Small');
});

test('buildClientHistory: ignores contracts with no client name', () => {
  const history = buildClientHistory([{ clientName: '', totalValue: 100 }]);
  assert.equal(history.length, 0);
});