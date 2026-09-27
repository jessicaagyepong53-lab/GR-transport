// ─── EQUIPMENT HELPERS ────────────────────────────────────────────────────
// Pure calculation logic extracted out of equipment-routes.js. No database,
// no Express — equipment-routes.js imports and calls the same function.

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value) + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

// Turns a contract's startDate/endDate strings into a Date range, or null
// if either date is missing/malformed/inverted — malformed dates are
// skipped by the caller rather than thrown, since one bad row shouldn't
// blank out a whole equipment unit's utilization figure.
function dayRange(startStr, endStr) {
  const start = parseDate(startStr);
  const end = parseDate(endStr);
  if (!start || !end || end < start) return null;
  return { start, end };
}

// Merges a list of (possibly overlapping) day ranges and returns the total
// number of distinct days covered. This is what caps a piece of equipment's
// utilization at 100% when two contracts double-book it on paper — the
// overlap is only counted once, not twice.
function mergedDaySpan(ranges) {
  if (!ranges.length) return 0;
  const sorted = ranges.slice().sort((a, b) => a.start - b.start);
  let totalDays = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;

  for (let i = 1; i < sorted.length; i++) {
    const r = sorted[i];
    // Adjacent (next day) or overlapping ranges get merged into one span.
    if (r.start.getTime() <= curEnd.getTime() + DAY_MS) {
      if (r.end > curEnd) curEnd = r.end;
    } else {
      totalDays += Math.round((curEnd - curStart) / DAY_MS) + 1;
      curStart = r.start;
      curEnd = r.end;
    }
  }
  totalDays += Math.round((curEnd - curStart) / DAY_MS) + 1;
  return totalDays;
}

// For each equipment unit: what share of the tracked window was it on
// hire, and how much income did it generate. Income on a multi-item
// contract is split proportionally by each line item's quantity against
// the contract's total item quantity, so a contract with one mixer and
// three scaffold units doesn't credit the mixer with the whole value.
function computeUtilization(equipmentList, contracts, { rangeStart, rangeEnd } = {}) {
  const equipmentArr = Array.isArray(equipmentList) ? equipmentList : [];
  const contractArr = Array.isArray(contracts) ? contracts : [];
  const endDate = parseDate(rangeEnd) || new Date();

  const byEquipment = new Map();
  equipmentArr.forEach(e => {
    if (!e?.equipmentId) return;
    byEquipment.set(e.equipmentId, { ranges: [], income: 0, equipment: e });
  });

  contractArr.forEach(contract => {
    const items = Array.isArray(contract?.items) ? contract.items : [];
    const totalQty = items.reduce((sum, it) => {
      const q = Number(it?.quantity);
      return sum + (Number.isFinite(q) && q > 0 ? q : 1);
    }, 0) || 1;

    items.forEach(item => {
      const equipmentId = item?.equipmentId;
      if (!equipmentId || !byEquipment.has(equipmentId)) return;
      const qtyRaw = Number(item?.quantity);
      const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
      const share = qty / totalQty;
      const entry = byEquipment.get(equipmentId);
      entry.income += Number(contract?.totalValue || 0) * share;
      const range = dayRange(contract?.startDate, contract?.endDate);
      if (range) entry.ranges.push(range);
    });
  });

  const results = [];
  byEquipment.forEach((entry, equipmentId) => {
    const trackStart = parseDate(rangeStart) || parseDate(entry.equipment?.createdAt) || endDate;
    const trackedDays = Math.max(1, Math.round((endDate - trackStart) / DAY_MS) + 1);
    const hireDaysRaw = mergedDaySpan(entry.ranges);
    const hireDays = Math.min(hireDaysRaw, trackedDays); // capped at 100%, see mergedDaySpan
    const utilizationPct = Math.round((hireDays / trackedDays) * 100);

    results.push({
      equipmentId,
      category: entry.equipment?.category || '',
      model: entry.equipment?.model || '',
      daysOnHire: hireDays,
      daysTracked: trackedDays,
      utilizationPct,
      income: Math.round(entry.income),
    });
  });

  results.sort((a, b) =>
    b.utilizationPct - a.utilizationPct ||
    b.income - a.income ||
    a.equipmentId.localeCompare(b.equipmentId)
  );
  return results;
}

module.exports = { computeUtilization, mergedDaySpan, dayRange };