// ─── REPORTS PAGE ────────────────────────────────────────────────────────────

let reportData = null;
let latestReportRequestId = 0;
let yearlyMasterData = null;

const TRUCK_COLOR_MAP = {
  'GT 6350-19':  '#f5a623',
  'GN 4106-18':  '#4a9eff',
  'GW 1568-22 OLD': '#2de08a',
  'GN 1674-21':  '#9b72ff',
  'GN 4394-25':  '#e0443a',
  'GX 4502-22 NEW':  '#22d3ee',
  'GN 626-26':  '#f472b6',
  'GN 4107-26':  '#ff8c42',
};
function getTruckColor(id) { return TRUCK_COLOR_MAP[id] || '#6b7a96'; }

function fmt(n) {
  if (n >= 1000000) return 'GHS ' + (n/1000000).toFixed(2) + 'M';
  if (n >= 1000) return 'GHS ' + (n/1000).toFixed(0) + 'K';
  return 'GHS ' + n.toLocaleString();
}

// ─────────────────────────────────────────────────────────────────────────────
//   PERFORMANCE PULSE
// ─────────────────────────────────────────────────────────────────────────────
// Fleet-wide "did we earn more or less than last time" check for the three
// natural business cadences. Independent of the year filter above it — always
// shows the latest completed period vs. the one before it, like a live status
// monitor rather than a report scoped to the dropdown selection.

function buildAllMonthsFromFull(monthlyByYear) {
  const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years = Object.keys(monthlyByYear || {})
    .filter(y => y !== 'all').map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  const labels = [], gross = [], exp = [];
  years.forEach(y => {
    const m = monthlyByYear[y] || monthlyByYear[String(y)];
    if (!m || !m.labels) return;
    const rows = m.labels.map((lbl, i) => ({ lbl, g: Number(m.gross[i]||0), e: Number(m.exp[i]||0) }))
      .sort((a,b) => MONTH_ORDER.indexOf(String(a.lbl).slice(0,3)) - MONTH_ORDER.indexOf(String(b.lbl).slice(0,3)));
    rows.forEach(r => { labels.push(`${r.lbl} '${String(y).slice(-2)}`); gross.push(r.g); exp.push(r.e); });
  });
  return { labels, gross, exp };
}

// Each period reports three independent numbers rather than one blended
// figure: Gross Income, Expenses, and Net Income each get their own delta, so
// "we earned more but also spent more" and "we earned less but cut costs
// harder" are both visible at a glance instead of collapsing into one number.

function computeMonthlyPulseFromAll(all) {
  const n = all.labels.length;
  if (n < 2) return { icon: 'fa-calendar-days', title: 'Monthly Pulse', empty: true };
  const now = new Date();
  const curMonthLabel = `${now.toLocaleString('en-US',{month:'short'})} '${String(now.getFullYear()).slice(-2)}`;
  const isPartial = all.labels[n-1] === curMonthLabel;
  const prevGross = all.gross[n-2], curGross = all.gross[n-1];
  const prevExp   = all.exp[n-2],   curExp   = all.exp[n-1];
  return {
    icon: 'fa-calendar-days', title: 'Monthly Pulse',
    previousLabel: all.labels[n-2], currentLabel: all.labels[n-1],
    metrics: {
      gross:   { previous: prevGross, current: curGross },
      expense: { previous: prevExp,   current: curExp },
      net:     { previous: prevGross - prevExp, current: curGross - curExp },
    },
    // A month still in progress is structurally guaranteed to look worse than
    // a completed one, so flag it rather than presenting the delta as final.
    metricLabel: isPartial
      ? `${now.getDate()} days into this month vs. all of last month — this will fill in as the month closes`
      : 'Fleet-wide totals, this month vs last month',
    partial: isPartial,
  };
}

function computeYearlyPulseFromFull(full, selectedYear) {
  const yearlyTotals = full.yearlyTotals || {};
  const years = Object.keys(yearlyTotals).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!years.length) return { icon: 'fa-calendar', title: 'Yearly Pulse', empty: true };

  const nowYear = new Date().getFullYear();
  const latestYear = years[years.length - 1];
  const targetYear = (selectedYear && years.includes(Number(selectedYear))) ? Number(selectedYear) : latestYear;
  const prevYear = targetYear - 1;
  const curMonthly  = full.monthly?.[targetYear] || full.monthly?.[String(targetYear)];
  const prevMonthly = full.monthly?.[prevYear] || full.monthly?.[String(prevYear)];

  // Fair comparison while the *selected* year is still in progress — i.e. it's
  // both the latest year we have data for AND the current calendar year. Any
  // year picked from the filter that isn't the live year gets a normal
  // full-year-vs-full-year comparison below.
  const isLiveYear = targetYear === nowYear && targetYear === latestYear;
  if (isLiveYear && curMonthly && prevMonthly && curMonthly.labels?.length) {
    const months = curMonthly.labels.map(l => String(l).slice(0,3));
    let curGross = 0, prevGross = 0, curExp = 0, prevExp = 0, matched = 0;
    months.forEach(m => {
      const ci = curMonthly.labels.findIndex(l => String(l).slice(0,3) === m);
      const pi = prevMonthly.labels.findIndex(l => String(l).slice(0,3) === m);
      if (ci >= 0) { curGross += curMonthly.gross[ci]||0; curExp += curMonthly.exp[ci]||0; }
      if (pi >= 0) { prevGross += prevMonthly.gross[pi]||0; prevExp += prevMonthly.exp[pi]||0; matched++; }
    });
    if (matched > 0) {
      const rangeLabel = `${months[0]}–${months[months.length - 1]}`;
      return {
        icon: 'fa-calendar', title: 'Yearly Pulse',
        previousLabel: `${prevYear} (${rangeLabel})`, currentLabel: `${targetYear} (${rangeLabel})`,
        metrics: {
          gross:   { previous: prevGross, current: curGross },
          expense: { previous: prevExp,   current: curExp },
          net:     { previous: prevGross - prevExp, current: curGross - curExp },
        },
        metricLabel: `Fleet-wide totals, first ${matched} month${matched !== 1 ? 's' : ''} vs same period last year`,
        partial: true,
        selectedYear: targetYear,
      };
    }
  }

  const cur = yearlyTotals[targetYear], prev = yearlyTotals[prevYear];
  if (!cur || !prev) {
    return {
      icon: 'fa-calendar', title: 'Yearly Pulse', empty: true, selectedYear: targetYear,
      emptyMsg: !prev
        ? `No data for ${prevYear} yet, so ${targetYear} can't be compared to a prior year.`
        : `No data for ${targetYear} yet.`,
    };
  }
  return {
    icon: 'fa-calendar', title: 'Yearly Pulse',
    previousLabel: String(prevYear), currentLabel: String(targetYear),
    selectedYear: targetYear,
    metrics: {
      gross:   { previous: prev.gross, current: cur.gross },
      expense: { previous: prev.exp,   current: cur.exp },
      net:     { previous: prev.gross - prev.exp, current: cur.gross - cur.exp },
    },
    metricLabel: 'Fleet-wide totals, full year vs. prior year',
  };
}

function getCurrentISOWeek() {
  const d = new Date();
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt - yearStart) / 86400000) + 1) / 7);
}

async function computeWeeklyPulseFleet(truckIds) {
  const nowYear = new Date().getFullYear();
  try {
    // The fleet weekly-range endpoint only reports gross, so to get gross,
    // expenses AND net for a specific week we sum each truck's raw weekly
    // entries ourselves — the same data source truck.js/weekly.js use.
    if (!truckIds || !truckIds.length) return { icon: 'fa-calendar-week', title: 'Weekly Pulse', empty: true };
    const results = await Promise.all(
      truckIds.map(id => API.get(`/api/weekly/${encodeURIComponent(id)}/${nowYear}`).catch(() => []))
    );
    const byWeek = {};
    results.forEach(list => {
      (list || []).forEach(e => {
        const w = parseInt(e.week);
        if (!Number.isFinite(w)) return;
        if (!byWeek[w]) byWeek[w] = { gross: 0, exp: 0 };
        byWeek[w].gross += Number(e.gross || 0);
        byWeek[w].exp   += Number(e.maint || 0) + Number(e.other || 0);
      });
    });
    const weeksWithData = Object.keys(byWeek).map(Number)
      .filter(w => (byWeek[w].gross + byWeek[w].exp) > 0)
      .sort((a, b) => a - b);
    if (weeksWithData.length < 2) return { icon: 'fa-calendar-week', title: 'Weekly Pulse', empty: true };
    const curWeek = weeksWithData[weeksWithData.length - 1];
    const prevWeek = weeksWithData[weeksWithData.length - 2];
    const cur = byWeek[curWeek], prev = byWeek[prevWeek];
    // A week still being entered is structurally guaranteed to look worse than
    // a completed one, so flag it rather than presenting the delta as final.
    const isPartial = curWeek === getCurrentISOWeek();
    return {
      icon: 'fa-calendar-week', title: 'Weekly Pulse',
      previousLabel: `Week ${prevWeek}`, currentLabel: `Week ${curWeek}`,
      metrics: {
        gross:   { previous: prev.gross, current: cur.gross },
        expense: { previous: prev.exp,   current: cur.exp },
        net:     { previous: prev.gross - prev.exp, current: cur.gross - cur.exp },
      },
      metricLabel: isPartial
        ? 'Fleet-wide totals so far this week vs. all of last week — this will fill in as the week closes'
        : 'Fleet-wide totals, this week vs last week',
      partial: isPartial,
    };
  } catch (e) {
    return { icon: 'fa-calendar-week', title: 'Weekly Pulse', empty: true };
  }
}

// Full-precision GHS formatter (no K/M rounding) — used only inside the Pulse
// cards, where the previous/current/delta figures must always add up exactly.
function fmtExact(n) {
  const sign = n < 0 ? '−' : '';
  return sign + 'GHS ' + Math.round(Math.abs(n)).toLocaleString();
}

// Splits a label like "2026 (Jan–Aug)" into a prominent main part ("2026")
// and a smaller sub part ("Jan–Aug"), so the period identity — the exact
// thing that was getting cut off as "202…" — always has room to breathe.
function splitPulseLabel(label) {
  const m = String(label || '').match(/^(.*?)\s*\((.*)\)\s*$/);
  return m ? { main: m[1], sub: m[2] } : { main: label, sub: '' };
}

function pulsePeriodBlockHtml(tag, label, isCurrent, isPartial) {
  const { main, sub } = splitPulseLabel(label);
  const dot = (isCurrent && isPartial) ? `<span class="pulse-live-dot" title="Still filling in"></span>` : '';
  return `<div class="pulse-value-block${isCurrent ? ' cur' : ''}">
    <span class="pulse-value-tag">${tag}${dot}</span>
    <span class="pulse-value-period">${main}</span>
    ${sub ? `<span class="pulse-value-sub">${sub}</span>` : ''}
  </div>`;
}

// One independent metric row (Gross / Expenses / Net). `invert` flips the
// green/red "goodness" sense — a rise in Expenses is bad, unlike Gross or Net.
function pulseMetricRowHtml(icon, name, metric, opts = {}) {
  const { previous, current } = metric;
  const delta = current - previous;
  const pct = previous !== 0 ? (delta / Math.abs(previous) * 100) : (delta > 0 ? 100 : 0);
  const rawDir = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const colorDir = (opts.invert && rawDir !== 'flat') ? (rawDir === 'up' ? 'down' : 'up') : rawDir;
  const arrowIcon = rawDir === 'up' ? 'fa-arrow-trend-up' : rawDir === 'down' ? 'fa-arrow-trend-down' : 'fa-minus';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return `<div class="pulse-metric-row${opts.emphasize ? ' emphasize' : ''}">
    <div class="pulse-metric-head">
      <span class="pulse-metric-name"><i class="fa-solid ${icon}"></i>${name}</span>
      <span class="pulse-metric-delta ${colorDir}"><i class="fa-solid ${arrowIcon}"></i>${sign}${fmtExact(Math.abs(delta))}<span class="pulse-metric-pct">${sign}${Math.abs(pct).toFixed(1)}%</span></span>
    </div>
    <div class="pulse-metric-track">${fmtExact(previous)} <i class="fa-solid fa-arrow-right-long"></i> ${fmtExact(current)}</div>
  </div>`;
}

// Renders the compact "vs" year picker shown in the Yearly Pulse header.
// Picking a year re-runs the comparison against (year - 1) without touching
// the Weekly/Monthly cards or re-fetching anything.
function pulseYearSelectHtml(years, selectedYear) {
  return `<select class="pulse-year-select" onchange="onPulseYearChange(this.value)" title="Compare a different year">
    ${years.map(y => `<option value="${y}"${y === selectedYear ? ' selected' : ''}>${y}</option>`).join('')}
  </select>`;
}

function pulseCardHtml(p, opts = {}) {
  const cardIdAttr = opts.cardId ? ` id="${opts.cardId}"` : '';
  const headerActions = `<div class="pulse-head-actions">${opts.yearSelect || ''}${p?.partial ? `<span class="pulse-live-badge"><i class="fa-solid fa-hourglass-half"></i>In progress</span>` : ''}</div>`;
  if (!p || p.empty || !p.metrics) {
    return `<div class="pulse-card empty"${cardIdAttr}>
      <div class="pulse-head"><i class="fa-solid ${p?.icon || 'fa-chart-simple'}"></i><span class="pulse-title">${p?.title || 'Pulse'}</span>${headerActions}</div>
      <div class="pulse-empty-msg">${p?.emptyMsg || 'Not enough history yet for this comparison — check back after another period of data has been entered.'}</div>
    </div>`;
  }
  const { gross, expense, net } = p.metrics;
  const netDelta = net.current - net.previous;
  const dir = netDelta > 0 ? 'up' : netDelta < 0 ? 'down' : 'flat';
  return `<div class="pulse-card ${dir}${p.partial ? ' partial' : ''}"${cardIdAttr}>
    <div class="pulse-head"><i class="fa-solid ${p.icon}"></i><span class="pulse-title">${p.title}</span>${headerActions}</div>
    <div class="pulse-values">
      ${pulsePeriodBlockHtml('Previous', p.previousLabel, false, p.partial)}
      <i class="fa-solid fa-arrow-right-long pulse-value-arrow"></i>
      ${pulsePeriodBlockHtml('Current', p.currentLabel, true, p.partial)}
    </div>
    <div class="pulse-metrics">
      ${pulseMetricRowHtml('fa-scale-balanced', 'Net Income', net, { emphasize: true })}
      ${pulseMetricRowHtml('fa-sack-dollar', 'Gross Income', gross, {})}
      ${pulseMetricRowHtml('fa-receipt', 'Expenses', expense, { invert: true })}
    </div>
    <div class="pulse-caption">${p.metricLabel || ''}</div>
  </div>`;
}

let _pulseFullCache = null;

async function loadPulse() {
  const container = document.getElementById('pulseStrip');
  if (!container) return;
  try {
    const full = await API.get('/api/dashboard/full');
    _pulseFullCache = full;
    const truckIds = Object.keys(full.trucks || {});
    const weekly = await computeWeeklyPulseFleet(truckIds);
    const monthly = computeMonthlyPulseFromAll(buildAllMonthsFromFull(full.monthly || {}));
    const years = Object.keys(full.yearlyTotals || {}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    const defaultYear = years.length ? years[years.length - 1] : null;
    const yearly = computeYearlyPulseFromFull(full, defaultYear);
    const yearOpts = years.length >= 2 ? { yearSelect: pulseYearSelectHtml(years, defaultYear), cardId: 'pulseYearlyCard' } : { cardId: 'pulseYearlyCard' };
    container.innerHTML = [
      pulseCardHtml(weekly),
      pulseCardHtml(monthly),
      pulseCardHtml(yearly, yearOpts),
    ].join('');
  } catch (e) {
    container.innerHTML = '';
  }
}

// Fired by the year <select> inside the Yearly Pulse card. Reuses the already
// fetched dashboard data — no network round-trip needed to switch years.
function onPulseYearChange(yearStr) {
  if (!_pulseFullCache) return;
  const selectedYear = parseInt(yearStr, 10);
  const years = Object.keys(_pulseFullCache.yearlyTotals || {}).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  const yearly = computeYearlyPulseFromFull(_pulseFullCache, selectedYear);
  const card = document.getElementById('pulseYearlyCard');
  if (!card) return;
  card.outerHTML = pulseCardHtml(yearly, { yearSelect: pulseYearSelectHtml(years, selectedYear), cardId: 'pulseYearlyCard' });
}

async function init() {
  // Populate year selector
  const sel = document.getElementById('yearSelect');
  try {
    const ytData = await API.get('/api/dashboard/yearly-totals');
    const years = Object.keys(ytData).map(Number).sort();
    years.forEach(y => {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      sel.appendChild(opt);
    });
  } catch { /* ignore */ }

  // If no years from API, add a fallback range so the dropdown isn't empty
  if (sel.options.length <= 1) {
    const cur = new Date().getFullYear();
    for (let y = 2024; y <= cur; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      sel.appendChild(opt);
    }
  }

  await loadReport();
  loadPulse();
}

async function loadReport() {
  const requestId = ++latestReportRequestId;
  const year = document.getElementById('yearSelect').value;
  document.getElementById('reportSubtitle').textContent =
    year === 'all' ? 'Truck Performance Reports · All Years' : `Truck Performance Reports · ${year}`;

  // Update export links
  document.getElementById('csvLink').href = `/api/reports/export?format=csv&year=${year}`;
  document.getElementById('jsonLink').href = `/api/reports/export?format=json&year=${year}`;

  try {
    reportData = await API.get(`/api/reports/summary?year=${year}`);
    if (requestId !== latestReportRequestId) return;
    renderSummary();
    renderRanking();
    renderAnnualSummary();
  } catch (err) {
    if (requestId !== latestReportRequestId) return;
    document.getElementById('summaryGrid').innerHTML = '<div class="summary-card"><div class="summary-label">Error</div><div class="summary-sub">' + err.message + '</div></div>';
  }
  if (year === 'all') {
    await loadYearlyMasterSummary();
  }
  if (requestId !== latestReportRequestId) return;
  renderYearlyMasterSummary();
  await Promise.all([
    loadQuarterlyTaxBoard(year),
    loadSalaryPayments(year)
  ]);
  if (requestId !== latestReportRequestId) return;
  await renderPurchaseBalance();
}

// ─── MASTER SUMMARY — YEAR BY YEAR (only shown for 'All Years') ─────────────
async function loadYearlyMasterSummary() {
  try {
    yearlyMasterData = await API.get('/api/dashboard/full');
  } catch (err) {
    yearlyMasterData = null;
  }
}

function renderYearlyMasterSummary() {
  const section = document.getElementById('yearlyMasterSummarySection');
  const table = document.getElementById('yearlyMasterSummaryTable');
  if (!section || !table) return;

  const isAllYears = document.getElementById('yearSelect').value === 'all';
  if (!isAllYears || !yearlyMasterData) {
    section.style.display = 'none';
    return;
  }

  const yearlyTotals = yearlyMasterData.yearlyTotals || {};
  const salaryTotals = yearlyMasterData.salaryTotals || {};
  const incomeTaxTotals = yearlyMasterData.incomeTaxTotals || {};
  const trucks = yearlyMasterData.trucks || {};

  // Pulls years straight from the data — a newly added year appears here
  // automatically the moment it has a yearly total, no code change needed.
  const years = Object.keys(yearlyTotals)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!years.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = '';

  function activeTruckCount(year) {
    return Object.values(trucks).filter(t => t && t[year]).length;
  }

  let html = `<thead><tr>
    <th style="text-align:left">Year</th>
    <th>Total Expenditure (GHS)</th>
    <th>Total Income (GHS)</th>
    <th>Total Amount (GHS)</th>
    <th>Avg Expenditure / Truck</th>
    <th>Avg Income / Truck</th>
    <th>% Expenditure</th>
    <th>% Income</th>
    <th>Ratio</th>
  </tr></thead><tbody>`;

  let totExp = 0, totIncome = 0, totAmount = 0, totTruckYears = 0;

  years.forEach(y => {
    const yt = yearlyTotals[y] || { gross: 0, exp: 0, net: 0 };
    const salary = Number(salaryTotals[y] || 0);
    const tax = Number(incomeTaxTotals[y] || 0);
    const amount = Number(yt.gross || 0);
    // Expenditure = truck-level expenses + fleet overhead (salary + income tax)
    const exp = Number(yt.exp || 0) + salary + tax;
    // Income = what's left of the gross after ALL costs, so Exp + Income = Amount always holds
    const income = amount - exp;
    const truckCount = activeTruckCount(y);
    const avgExp = truckCount ? exp / truckCount : 0;
    const avgIncome = truckCount ? income / truckCount : 0;
    const pctExp = amount ? Math.round(exp / amount * 100) : 0;
    const pctIncome = amount ? Math.round(income / amount * 100) : 0;
    const ratio = income !== 0 ? (exp / income) : 0;

    totExp += exp;
    totIncome += income;
    totAmount += amount;
    totTruckYears += truckCount;

    html += `<tr>
      <td>${y}</td>
      <td style="color:var(--red)">${exp.toLocaleString()}</td>
      <td style="color:var(--green)">${income.toLocaleString()}</td>
      <td style="color:var(--blue)">${amount.toLocaleString()}</td>
      <td>${avgExp.toLocaleString(undefined, {maximumFractionDigits:2})}</td>
      <td>${avgIncome.toLocaleString(undefined, {maximumFractionDigits:2})}</td>
      <td style="color:var(--red)">${pctExp}%</td>
      <td style="color:var(--green)">${pctIncome}%</td>
      <td>${ratio.toFixed(2)}:1</td>
    </tr>`;
  });

  const totPctExp = totAmount ? Math.round(totExp / totAmount * 100) : 0;
  const totPctIncome = totAmount ? Math.round(totIncome / totAmount * 100) : 0;
  const totRatio = totIncome !== 0 ? (totExp / totIncome) : 0;
  const totAvgExp = totTruckYears ? totExp / totTruckYears : 0;
  const totAvgIncome = totTruckYears ? totIncome / totTruckYears : 0;

  html += `<tr class="totals-row">
    <td>TOTAL</td>
    <td>${totExp.toLocaleString()}</td>
    <td>${totIncome.toLocaleString()}</td>
    <td>${totAmount.toLocaleString()}</td>
    <td>${totAvgExp.toLocaleString(undefined, {maximumFractionDigits:2})}</td>
    <td>${totAvgIncome.toLocaleString(undefined, {maximumFractionDigits:2})}</td>
    <td>${totPctExp}%</td>
    <td>${totPctIncome}%</td>
    <td>${totRatio.toFixed(2)}:1</td>
  </tr>`;

  html += '</tbody>';
  table.innerHTML = html;
}

function renderSummary() {
  if (!reportData) return;
  const d = reportData;
  const adjGross = d.totalGross;
  const adjNet = d.totalNet;
  const eff = adjGross ? Math.round(adjNet / adjGross * 100) : 0;
  const exactGross = adjGross.toLocaleString();
  const exactNet = adjNet.toLocaleString();
  const exactExp = d.totalExp.toLocaleString();

  document.getElementById('summaryGrid').innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Total Gross Income</div>
      <div class="summary-value" style="color:var(--accent)">${fmt(adjGross)}</div>
      <div class="summary-sub">Exact: GHS ${exactGross}</div>
      <div class="summary-sub">${d.activeCount || d.truckCount} active trucks${d.eotCount ? ` · ${d.eotCount} end of term` : ''}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Net Income</div>
      <div class="summary-value" style="color:var(--green)">${fmt(adjNet)}</div>
      <div class="summary-sub">Exact: GHS ${exactNet}</div>
      <div class="summary-sub">${eff}% efficiency</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Expenditure</div>
      <div class="summary-value" style="color:var(--red)">${fmt(d.totalExp)}</div>
      <div class="summary-sub">Exact: GHS ${exactExp}</div>
      <div class="summary-sub">${adjGross ? Math.round(d.totalExp/adjGross*100) : 0}% of gross</div>
    </div>
    ${d.topPerformer ? `<div class="summary-card">
      <div class="summary-label">Top Performer</div>
      <div class="summary-value" style="color:var(--green);font-size:1.6rem">${d.topPerformer.truckId}</div>
      <div class="summary-sub">Exact net: GHS ${d.topPerformer.net.toLocaleString()}</div>
      <div class="summary-sub">Net: ${fmt(d.topPerformer.net)}</div>
    </div>` : ''}
    ${d.bottomPerformer && (d.activeCount || d.truckCount) > 1 ? `<div class="summary-card">
      <div class="summary-label">Lowest Performer</div>
      <div class="summary-value" style="color:var(--red);font-size:1.6rem">${d.bottomPerformer.truckId}</div>
      <div class="summary-sub">Exact net: GHS ${d.bottomPerformer.net.toLocaleString()}</div>
      <div class="summary-sub">Net: ${fmt(d.bottomPerformer.net)}</div>
    </div>` : ''}
  `;
}

function renderRanking() {
  if (!reportData?.truckRanking) return;
  const ranking = reportData.truckRanking;
  let html = `<thead><tr><th>#</th><th>Truck ID</th><th>Status</th><th>Gross (GHS)</th><th>Expenditure (GHS)</th><th>Net (GHS)</th><th>Efficiency</th></tr></thead><tbody>`;

  ranking.forEach((t, i) => {
    const eff = t.gross ? Math.round(t.net / t.gross * 100) : 0;
    const eotStyle = t.eot ? 'opacity:0.5;' : '';
    const eotBadge = t.eot ? '<span style="background:rgba(224,68,58,0.15);color:var(--red);border:1px solid rgba(224,68,58,0.3);border-radius:4px;padding:1px 8px;font-size:0.7rem;">END OF TERM</span>' : '<span style="color:var(--green);font-size:0.78rem;">Active</span>';
    html += `<tr style="${eotStyle}">
      <td style="color:var(--muted);font-weight:600">${t.rank != null ? t.rank : '—'}</td>
      <td><a href="truck.html?id=${encodeURIComponent(t.truckId)}" style="color:${getTruckColor(t.truckId)};text-decoration:none;font-weight:600;font-family:'JetBrains Mono',monospace">${t.truckId}</a></td>
      <td>${eotBadge}</td>
      <td style="color:var(--accent);font-weight:600">${t.gross.toLocaleString()}</td>
      <td style="color:var(--red)">${t.exp.toLocaleString()}</td>
      <td style="color:var(--green);font-weight:700">${t.net.toLocaleString()}</td>
      <td style="color:${eff>80?'var(--green)':eff>60?'var(--accent)':'var(--red)'};font-weight:600">${eff}%</td>
    </tr>`;
  });

  html += '</tbody>';
  document.getElementById('rankingTable').innerHTML = html;
}

function renderAnnualSummary() {
  if (!reportData?.truckRanking) return;
  const trucks = reportData.truckRanking;
  const table = document.getElementById('annualSummaryTable');
  const totalSupervisorSalary = reportData.expBreakdown?.supervisorSalary || 0;
  const totalIncomeTax = reportData.expBreakdown?.incomeTax || 0;
  const totalTruckExp = trucks.reduce((sum, t) => sum + (t.exp || 0), 0);

  let html = `<thead><tr>
    <th style="text-align:left">Trucks</th>
    <th>Total Expenditure (GHS)</th>
    <th>Total Income (GHS)</th>
    <th>Average Income (GHS)</th>
    <th>Total Amount (GHS)</th>
    <th>Minor Expenditure (GHS)</th>
    <th>Major Expenditure (GHS)</th>
    <th>Supervisor Salary (GHS)</th>
    <th>Income Tax (GHS)</th>
    <th>% Expenditure</th>
    <th>% Income</th>
    <th>Ratio</th>
    <th>Ranks</th>
  </tr></thead><tbody>`;

  let totExp = 0, totIncome = 0, totAmount = 0, totMinor = 0, totMajor = 0, totSalary = 0, totTax = 0, totWeeks = 0;

  trucks.forEach(t => {
    const rankClass = t.rank === 1 ? 'rank-1' : t.rank === 2 ? 'rank-2' : t.rank === 3 ? 'rank-3' : 'rank-other';
    const eotStyle = t.eot ? 'opacity:0.5;' : '';
    const eotLabel = t.eot ? ' <span style="color:var(--red);font-size:0.65rem;font-family:DM Sans,sans-serif;font-weight:400;">EOT</span>' : '';
    const salaryShare = totalTruckExp ? Math.round((totalSupervisorSalary * (t.exp || 0)) / totalTruckExp) : 0;
    const taxShare = totalTruckExp ? Math.round((totalIncomeTax * (t.exp || 0)) / totalTruckExp) : 0;

    // Include ALL trucks in totals (EOT trucks still have real data for their years)
    totExp += t.exp;
    totIncome += t.net;
    totAmount += t.totalAmount;
    totMinor += t.minorExp;
    totMajor += t.majorExp;
    totSalary += salaryShare;
    totTax += taxShare;
    totWeeks += (t.weeks || 0);

    html += `<tr style="${eotStyle}">
      <td><a href="truck.html?id=${encodeURIComponent(t.truckId)}" style="color:${getTruckColor(t.truckId)};text-decoration:none">${t.truckId}</a>${eotLabel}</td>
      <td style="color:var(--red)">${t.exp.toLocaleString()}</td>
      <td style="color:var(--green)">${t.net.toLocaleString()}</td>
      <td>${t.avgIncome.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
      <td style="color:var(--blue)">${t.totalAmount.toLocaleString()}</td>
      <td>${t.minorExp.toLocaleString()}</td>
      <td>${t.majorExp.toLocaleString()}</td>
      <td style="color:var(--accent)">${salaryShare.toLocaleString()}</td>
      <td style="color:var(--red)">${taxShare.toLocaleString()}</td>
      <td style="color:var(--red)">${t.pctExp}%</td>
      <td style="color:var(--green)">${t.pctIncome}%</td>
      <td>${t.ratio.toFixed(2)}:1</td>
      <td>${t.rank != null ? `<span class="rank-badge ${rankClass}">${t.rank}</span>` : '<span style="color:var(--muted);font-size:0.72rem;">—</span>'}</td>
    </tr>`;
  });

  // Total Expenditure and Total Income stay truck-only here (sum of each
  // truck's own exp/net from the loop above) — this table is about what the
  // TRUCKS made and spent, not fleet overhead. Supervisor Salary and Income
  // Tax are shown in their own dedicated total columns below instead of being
  // folded into Expenditure/Income, so Amount = Expenditure + Income holds
  // using truck-only figures, same as every individual row.
  totSalary = totalSupervisorSalary;
  totTax = totalIncomeTax;

  // Totals row
  const totPctExp = totAmount ? Math.round(totExp / totAmount * 100) : 0;
  const totPctIncome = totAmount ? Math.round(totIncome / totAmount * 100) : 0;
  const totRatio = totIncome ? (totExp / totIncome).toFixed(2) : '0.00';
  const totAvgIncome = totWeeks ? parseFloat((totIncome / totWeeks).toFixed(2)) : 0;

  html += `<tr class="totals-row">
    <td>TOTAL</td>
    <td>${totExp.toLocaleString()}</td>
    <td>${totIncome.toLocaleString()}</td>
    <td>${totAvgIncome.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
    <td>${totAmount.toLocaleString()}</td>
    <td>${totMinor.toLocaleString()}</td>
    <td>${totMajor.toLocaleString()}</td>
    <td>${totSalary.toLocaleString()}</td>
    <td>${totTax.toLocaleString()}</td>
    <td>${totPctExp}%</td>
    <td>${totPctIncome}%</td>
    <td>${totRatio}:1</td>
    <td></td>
  </tr>`;

  html += '</tbody>';
  table.innerHTML = html;
}

// ─── 26 TRUCKS PURCHASE BALANCE ──────────────────────────────────────────────
async function renderPurchaseBalance() {
  const section = document.getElementById('pbalSection');
  const grid = document.getElementById('pbalGrid');
  if (!section || !grid) return;

  const year = document.getElementById('yearSelect').value;
  if (year !== 'all' && year !== '2026') {
    section.style.display = 'none';
    return;
  }

  let trucks = [];
  try {
    trucks = await API.get('/api/trucks');
  } catch { return; }

  const trucks26 = trucks.filter(t => t.purchaseYear === 2026);
  if (!trucks26.length) { section.style.display = 'none'; return; }

  section.style.display = '';
  grid.innerHTML = trucks26.map(t => {
    const totalCost = t.cost?.pricePaid || 0;
    const initialPmt = t.cost?.initialPayment || 0;
    const entriesTotal = (t.paymentEntries || []).reduce((s, e) => s + (e.amount || 0), 0);
    const totalPaid = initialPmt + entriesTotal;
    const remaining = totalCost - totalPaid;
    const pct = totalCost ? Math.min(100, Math.round(totalPaid / totalCost * 100)) : 0;
    const remColor = remaining <= 0 ? 'var(--green)' : 'var(--accent)';

    const entryRows = (t.paymentEntries || []).map((e, i) =>
      `<div class="pbal-row"><span class="pbal-row-lbl">${e.label || `Payment ${i + 1}`}</span><span class="pbal-row-val" style="color:var(--green)">GHS ${(e.amount||0).toLocaleString()}</span></div>`
    ).join('');

    return `<div class="pbal-truck">
      <div class="pbal-truck-id">${t.truckId}${t.driver ? ' — ' + t.driver : ''}</div>
      <div class="pbal-row"><span class="pbal-row-lbl">Total Cost</span><span class="pbal-row-val" style="color:var(--blue)">GHS ${totalCost.toLocaleString()}</span></div>
      ${t.cost?.initialPayment ? `<div class="pbal-row"><span class="pbal-row-lbl">Initial Payment</span><span class="pbal-row-val" style="color:var(--green)">GHS ${initialPmt.toLocaleString()}</span></div>` : ''}
      ${entryRows}
      <div class="pbal-row" style="margin-top:4px;padding-top:8px;border-top:1px solid var(--border);border-bottom:none;"><span class="pbal-row-lbl" style="font-weight:600;color:var(--text)">Total Paid</span><span class="pbal-row-val" style="color:var(--green)">GHS ${totalPaid.toLocaleString()}</span></div>
      <div class="pbal-row"><span class="pbal-row-lbl" style="font-weight:600;color:var(--text)">Remaining Balance</span><span class="pbal-row-val" style="color:${remColor}">GHS ${remaining.toLocaleString()}</span></div>
      <div class="pbal-bar-wrap"><div class="pbal-bar" style="width:${pct}%"></div></div>
      <div class="pbal-pct">${pct}% paid</div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', init);

// Auto-refresh when tab gains focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { loadReport(); loadPulse(); }
});

// ─── QUARTERLY INCOME TAX ────────────────────────────────────────────────────
let qTaxByYear = {};
let qTaxVisibleYears = [];
let qTaxRequestId = 0;

function getYearOptionsFromSelect() {
  const yearSelect = document.getElementById('yearSelect');
  return Array.from(yearSelect?.options || [])
    .map(opt => opt.value)
    .filter(v => v !== 'all')
    .map(v => parseInt(v))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
}

async function getQuarterlyTaxYears() {
  try {
    const years = await API.get('/api/quarterly-tax/years/_fleet');
    if (Array.isArray(years) && years.length) {
      return years
        .map(y => parseInt(y))
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
    }
  } catch (e) {
    // fall through to dropdown-derived years
  }
  return getYearOptionsFromSelect();
}

async function loadQuarterlyTaxBoard(selectedYear) {
  const requestId = ++qTaxRequestId;
  const parsedYear = selectedYear && selectedYear !== 'all' ? parseInt(selectedYear) : null;
  const availableYears = await getQuarterlyTaxYears();
  qTaxVisibleYears = parsedYear
    ? [parsedYear]
    : availableYears;

  if (!qTaxVisibleYears.length && Number.isFinite(parsedYear)) {
    qTaxVisibleYears = [parsedYear];
  }

  const tasks = qTaxVisibleYears.map(async (year) => {
    try {
      qTaxByYear[year] = await API.get(`/api/quarterly-tax/_fleet/${year}`);
    } catch (e) {
      qTaxByYear[year] = { 1: 0, 2: 0, 3: 0, 4: 0 };
    }
  });
  await Promise.all(tasks);
  if (requestId !== qTaxRequestId) return;
  renderQuarterlyTaxBoard();
}

function renderQuarterlyTaxBoard() {
  const el = document.getElementById('quarterlyTaxBody');
  if (!el) return;
  const label = document.getElementById('qTaxYearLabel');
  if (label) label.textContent = qTaxVisibleYears.join(' · ');

  const qNames = ['Q1 · Jan–Mar', 'Q2 · Apr–Jun', 'Q3 · Jul–Sep', 'Q4 · Oct–Dec'];
  const admin = typeof isAdmin === 'function' ? isAdmin() : false;

  const cards = qTaxVisibleYears.map(year => {
    const data = qTaxByYear[year] || { 1: 0, 2: 0, 3: 0, 4: 0 };
    const total = [1, 2, 3, 4].reduce((sum, q) => sum + (data[q] || 0), 0);
    return `
      <div class="qtax-year-card">
        <div class="qtax-year-head">
          <div>
            <div class="qtax-year-title">${year}</div>
            <div class="qtax-year-sub">Quarterly Income Tax</div>
          </div>
          <div class="qtax-year-total">GHS ${total.toLocaleString()}</div>
        </div>
        <div class="qtax-quarter-grid">
          ${[1, 2, 3, 4].map(q => `
            <div class="qtax-quarter-card">
              <div class="qtax-quarter-label">${qNames[q - 1]}</div>
              ${admin ? `
                <input type="number" id="qTaxInput${year}_${q}" value="${data[q] || ''}" min="0" placeholder="—"
                  class="qtax-input"
                  oninput="this.style.color=this.value>0?'var(--accent)':'var(--muted)'"
                  onkeydown="if(event.key==='Enter')saveQuarterTax(${year}, ${q})">
                <button class="qtax-save" onclick="saveQuarterTax(${year}, ${q})"><i class="fa-solid fa-floppy-disk"></i>Save</button>
              ` : `
                <div class="qtax-value">${data[q] ? data[q].toLocaleString() : '—'}</div>
                <div class="qtax-unit">GHS</div>
              `}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  const grandTotal = qTaxVisibleYears.reduce((sum, year) => {
    const data = qTaxByYear[year] || { 1: 0, 2: 0, 3: 0, 4: 0 };
    return sum + [1, 2, 3, 4].reduce((yearSum, q) => yearSum + (data[q] || 0), 0);
  }, 0);

  const rangeLabel = qTaxVisibleYears.length === 1
    ? String(qTaxVisibleYears[0])
    : `${Math.min(...qTaxVisibleYears)}-${Math.max(...qTaxVisibleYears)}`;

  el.innerHTML = `
    <div class="qtax-board">${cards}</div>
    <div class="qtax-grand-total">
      <span>Total Tax Paid · ${rangeLabel}</span>
      <strong>GHS ${grandTotal.toLocaleString()}</strong>
    </div>
  `;
}

async function saveQuarterTax(year, quarter) {
  if (typeof isAdmin === 'function' && !isAdmin()) return;
  const input = document.getElementById(`qTaxInput${year}_${quarter}`);
  if (!input) return;
  const amount = parseFloat(input.value) || 0;
  try {
    await API.put(`/api/quarterly-tax/_fleet/${year}/${quarter}`, { amount });
    qTaxByYear[year] = qTaxByYear[year] || { 1: 0, 2: 0, 3: 0, 4: 0 };
    qTaxByYear[year][quarter] = amount;
    if (!qTaxVisibleYears.includes(year)) qTaxVisibleYears = [year];
    renderQuarterlyTaxBoard();
  } catch (e) {
    console.error('Failed to save quarterly tax', e);
  }
}

// ─── SUPERVISOR SALARY PAYMENTS ─────────────────────────────────────────────
let salaryPayments = [];
let salaryYear = null;
let salaryModeAllYears = false;
let salaryRequestId = 0;

async function loadSalaryPayments(year) {
  const requestId = ++salaryRequestId;
  salaryModeAllYears = (year === 'all');

  if (salaryModeAllYears) {
    const yearSelect = document.getElementById('yearSelect');
    const years = Array.from(yearSelect?.options || [])
      .map(opt => opt.value)
      .filter(v => v !== 'all')
      .map(v => parseInt(v))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    salaryYear = null;
    if (!years.length) {
      salaryPayments = [];
    } else {
      const yearResults = await Promise.all(years.map(async y => {
        try {
          return await API.get(`/api/salary-payments/_fleet/${y}`);
        } catch (e) {
          return [];
        }
      }));

      salaryPayments = yearResults
        .flat()
        .sort((a, b) => {
          if ((a.year || 0) !== (b.year || 0)) return (a.year || 0) - (b.year || 0);
          return (a.datePaid || '').localeCompare(b.datePaid || '');
        });
    }
  } else {
    salaryYear = (year && year !== 'all') ? parseInt(year) : new Date().getFullYear();
    try {
      salaryPayments = await API.get(`/api/salary-payments/_fleet/${salaryYear}`);
    } catch (e) {
      salaryPayments = [];
    }
  }

  if (requestId !== salaryRequestId) return;
  renderSalaryPayments();
}

function salaryTotal() {
  return salaryPayments.reduce((sum, entry) => sum + (entry.amount || 0), 0);
}

function getISOWeekFromDateStr(dateStr) {
  if (!dateStr) return null;
  const dt = new Date(dateStr);
  if (Number.isNaN(dt.getTime())) return null;
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function renderSalaryPayments() {
  const el = document.getElementById('salaryPaymentsBody');
  if (!el) return;
  const label = document.getElementById('salaryYearLabel');
  if (label) label.textContent = salaryModeAllYears ? 'All Years' : salaryYear;
  const admin = typeof isAdmin === 'function' ? isAdmin() : false;

  const rows = salaryPayments.map(entry => {
    const week = entry.week || getISOWeekFromDateStr(entry.datePaid);
    return `
    <div class="salary-row" data-id="${entry._id}" data-year="${entry.year || ''}">
      <input type="date" value="${entry.datePaid || ''}" class="salary-date" ${admin ? '' : 'disabled'}>
      <input type="number" value="${entry.amount || ''}" class="salary-amount" min="0" placeholder="0" ${admin ? '' : 'disabled'}>
      <div style="font-size:0.72rem;color:var(--muted);font-family:'JetBrains Mono',monospace;text-align:center;">${salaryModeAllYears ? `${entry.year || '-'} · ` : ''}${week ? `Week ${week}` : 'No week'}</div>
      ${admin ? `
        <button class="salary-save" onclick="saveSalaryPayment(this)"><i class="fa-solid fa-floppy-disk"></i>Save</button>
        <button class="salary-del" onclick="deleteSalaryPayment(this)"><i class="fa-solid fa-trash"></i></button>
      ` : ''}
    </div>
  `;
  }).join('');

  el.innerHTML = `
    ${admin ? `
      <div class="salary-row salary-new">
        <input type="date" id="salaryNewDate" value="${new Date().toISOString().slice(0,10)}">
        <input type="number" id="salaryNewAmount" value="2000" min="0" placeholder="0">
        <button class="salary-save" onclick="addSalaryPayment()"><i class="fa-solid fa-plus"></i>Add</button>
      </div>
    ` : ''}
    <div class="salary-list">${rows || '<div style="color:var(--muted);font-size:0.8rem;padding:10px 0;">No salary payments entered yet.</div>'}</div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:14px;border-top:1px solid var(--border);margin-top:14px;">
      <span style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);">Total Supervisor Salary Paid · ${salaryModeAllYears ? 'All Years' : salaryYear}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:var(--accent);">GHS ${salaryTotal().toLocaleString()}</span>
    </div>
  `;
}

async function addSalaryPayment() {
  if (typeof isAdmin === 'function' && !isAdmin()) return;
  const datePaid = document.getElementById('salaryNewDate')?.value;
  const amount = parseFloat(document.getElementById('salaryNewAmount')?.value) || 0;
  const entryYear = salaryModeAllYears
    ? (datePaid ? parseInt(datePaid.slice(0, 4)) : new Date().getFullYear())
    : salaryYear;
  try {
    await API.post('/api/salary-payments/_fleet/' + entryYear, { datePaid, amount });
    await loadSalaryPayments(salaryModeAllYears ? 'all' : salaryYear);
  } catch (e) {
    console.error('Failed to add salary payment', e);
  }
}

async function saveSalaryPayment(button) {
  if (typeof isAdmin === 'function' && !isAdmin()) return;
  const row = button.closest('.salary-row');
  const id = row?.dataset.id;
  const rowYear = parseInt(row?.dataset.year || salaryYear);
  if (!id) return;
  const datePaid = row.querySelector('.salary-date')?.value;
  const amount = parseFloat(row.querySelector('.salary-amount')?.value) || 0;
  try {
    await API.put(`/api/salary-payments/_fleet/${rowYear}/${id}`, { datePaid, amount });
    await loadSalaryPayments(salaryModeAllYears ? 'all' : salaryYear);
  } catch (e) {
    console.error('Failed to save salary payment', e);
  }
}

async function deleteSalaryPayment(button) {
  if (typeof isAdmin === 'function' && !isAdmin()) return;
  const row = button.closest('.salary-row');
  const id = row?.dataset.id;
  const rowYear = parseInt(row?.dataset.year || salaryYear);
  if (!id) return;
  try {
    await API.del(`/api/salary-payments/_fleet/${rowYear}/${id}`);
    await loadSalaryPayments(salaryModeAllYears ? 'all' : salaryYear);
  } catch (e) {
    console.error('Failed to delete salary payment', e);
  }
}