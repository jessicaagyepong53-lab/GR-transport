// ─── CONTRACT HELPERS ─────────────────────────────────────────────────────
// Pure calculation logic extracted out of contract-routes.js so it can be
// unit-tested with no database, no Express, and no mocking. The routes
// import and call these same functions — the tests exercise the exact
// logic the live routes run.

const VALID_CATEGORIES = ['mixer', 'scaffold', 'compactor', 'gutter-mould'];

// Validates and normalizes a contract's items[] array. Throws a plain Error
// (routes wrap this in an AppError) rather than letting a malformed item —
// a missing category, a zero/negative quantity — pass through silently.
function validateContractItems(items) {
  if (!Array.isArray(items) || !items.length) {
    throw new Error('At least one item is required');
  }
  return items.map((item, i) => {
    const category = String(item?.category || '').trim();
    if (!VALID_CATEGORIES.includes(category)) {
      throw new Error(`items[${i}].category must be one of: ${VALID_CATEGORIES.join(', ')}`);
    }
    const quantity = item?.quantity === undefined || item?.quantity === null || item?.quantity === ''
      ? 1
      : Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`items[${i}].quantity must be a positive number`);
    }
    return {
      category,
      equipmentId: item?.equipmentId ? String(item.equipmentId).trim() : '',
      description: item?.description ? String(item.description).trim() : '',
      quantity,
    };
  });
}

// Sums a contract's payments[] ledger against its totalValue and classifies
// the result. Boundaries: totalPaid === totalValue is exactly "paid" (not
// "overpaid" or "partial"); a contract with no totalValue set at all is
// "unpaid" until something is paid against it, at which point any payment
// makes it "overpaid" (there was nothing to pay off).
function computePaymentTotals(contract) {
  const totalValue = Number(contract?.totalValue || 0);
  const payments = Array.isArray(contract?.payments) ? contract.payments : [];
  const totalPaid = payments.reduce((sum, p) => sum + Number(p?.amount || 0), 0);
  const balance = totalValue - totalPaid;

  let status;
  if (totalPaid <= 0) {
    status = 'unpaid';
  } else if (totalValue <= 0 || totalPaid > totalValue) {
    status = 'overpaid';
  } else if (totalPaid < totalValue) {
    status = 'partial';
  } else {
    status = 'paid';
  }

  return { totalValue, totalPaid, balance, status };
}

// A contract is overdue when it hasn't been returned, still has a balance
// owing, and has a paymentDueDate that has passed. No due date set at all
// means "not overdue" — we don't want a client flagged just because nobody
// entered a due date.
function isContractOverdue(contract, now = new Date()) {
  if (!contract || contract.returned) return false;
  const { balance } = computePaymentTotals(contract);
  if (balance <= 0) return false;
  if (!contract.paymentDueDate) return false;
  const due = new Date(contract.paymentDueDate + 'T00:00:00');
  if (Number.isNaN(due.getTime())) return false;
  return due.getTime() < now.getTime();
}

// A deposit counts as "withheld" once the contract is returned and the
// amount actually refunded is less than what was collected — whether that's
// zero refund (damage) or a partial refund.
function hasWithheldDeposit(contract) {
  if (!contract || !contract.returned) return false;
  const deposit = Number(contract.deposit || 0);
  if (deposit <= 0) return false;
  const refund = Number(contract.depositRefund || 0);
  return refund < deposit;
}

// Groups contracts by client name (case-insensitive — "Kofi Mensah" and
// "kofi mensah" are the same client), and flags any client with at least
// one overdue balance or one withheld deposit across their history.
// Flagged clients always sort first, so a manager scanning the list sees
// the people who need attention before anyone else, then by total value.
function buildClientHistory(contracts, { now = new Date() } = {}) {
  const list = Array.isArray(contracts) ? contracts : [];
  const groups = new Map();

  list.forEach(contract => {
    const rawName = String(contract?.clientName || '').trim();
    if (!rawName) return;
    const key = rawName.toLowerCase();
    if (!groups.has(key)) {
      groups.set(key, {
        clientName: rawName, // first-seen casing wins for display
        clientPhone: contract.clientPhone || '',
        contracts: [],
        totalValue: 0,
        totalPaid: 0,
        totalBalance: 0,
        overdueCount: 0,
        withheldDepositCount: 0,
      });
    }
    const group = groups.get(key);
    const totals = computePaymentTotals(contract);
    const overdue = isContractOverdue(contract, now);
    const withheld = hasWithheldDeposit(contract);

    group.contracts.push({ ...contract, ...totals, overdue, withheldDeposit: withheld });
    group.totalValue += totals.totalValue;
    group.totalPaid += totals.totalPaid;
    group.totalBalance += totals.balance;
    if (overdue) group.overdueCount += 1;
    if (withheld) group.withheldDepositCount += 1;
    if (!group.clientPhone && contract.clientPhone) group.clientPhone = contract.clientPhone;
  });

  const result = Array.from(groups.values()).map(g => ({
    ...g,
    contractCount: g.contracts.length,
    flagged: g.overdueCount > 0 || g.withheldDepositCount > 0,
  }));

  result.sort((a, b) => {
    if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
    return b.totalValue - a.totalValue;
  });

  return result;
}

module.exports = {
  VALID_CATEGORIES,
  validateContractItems,
  computePaymentTotals,
  isContractOverdue,
  hasWithheldDeposit,
  buildClientHistory,
};