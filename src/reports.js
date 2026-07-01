// ─── REPORTS PAGE ────────────────────────────────────────────────────────────

let reportData = null;

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
}

async function loadReport() {
  const year = document.getElementById('yearSelect').value;
  document.getElementById('reportSubtitle').textContent =
    year === 'all' ? 'Truck Performance Reports · All Years' : `Truck Performance Reports · ${year}`;

  // Update export links
  document.getElementById('csvLink').href = `/api/reports/export?format=csv&year=${year}`;
  document.getElementById('jsonLink').href = `/api/reports/export?format=json&year=${year}`;

  try {
    reportData = await API.get(`/api/reports/summary?year=${year}`);
    renderSummary();
    renderRanking();
    renderAnnualSummary();
  } catch (err) {
    document.getElementById('summaryGrid').innerHTML = '<div class="summary-card"><div class="summary-label">Error</div><div class="summary-sub">' + err.message + '</div></div>';
  }
  loadQuarterlyTaxBoard();
  loadSalaryPayments(year);
  await renderPurchaseBalance();
}

function renderSummary() {
  if (!reportData) return;
  const d = reportData;
  const adjGross = d.totalGross;
  const adjNet = adjGross - d.totalExp;
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
    <th>% Expenditure</th>
    <th>% Income</th>
    <th>Ratio</th>
    <th>Ranks</th>
  </tr></thead><tbody>`;

  let totExp = 0, totIncome = 0, totAmount = 0, totMinor = 0, totMajor = 0, totSalary = 0, totWeeks = 0;

  trucks.forEach(t => {
    const rankClass = t.rank === 1 ? 'rank-1' : t.rank === 2 ? 'rank-2' : t.rank === 3 ? 'rank-3' : 'rank-other';
    const eotStyle = t.eot ? 'opacity:0.5;' : '';
    const eotLabel = t.eot ? ' <span style="color:var(--red);font-size:0.65rem;font-family:DM Sans,sans-serif;font-weight:400;">EOT</span>' : '';
    const salaryShare = totalTruckExp ? Math.round((totalSupervisorSalary * (t.exp || 0)) / totalTruckExp) : 0;

    // Include ALL trucks in totals (EOT trucks still have real data for their years)
    totExp += t.exp;
    totIncome += t.net;
    totAmount += t.totalAmount;
    totMinor += t.minorExp;
    totMajor += t.majorExp;
    totSalary += salaryShare;
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
      <td style="color:var(--red)">${t.pctExp}%</td>
      <td style="color:var(--green)">${t.pctIncome}%</td>
      <td>${t.ratio.toFixed(2)}:1</td>
      <td>${t.rank != null ? `<span class="rank-badge ${rankClass}">${t.rank}</span>` : '<span style="color:var(--muted);font-size:0.72rem;">—</span>'}</td>
    </tr>`;
  });

  // Force totals to match the exact fleet salary total (rounding-safe).
  totSalary = totalSupervisorSalary;
  totExp += totSalary;

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
  if (document.visibilityState === 'visible') loadReport();
});

// ─── QUARTERLY INCOME TAX ────────────────────────────────────────────────────
const qTaxYears = [2024, 2025, 2026];
let qTaxByYear = {
  2024: { 1: 0, 2: 0, 3: 0, 4: 0 },
  2025: { 1: 0, 2: 0, 3: 0, 4: 0 },
  2026: { 1: 0, 2: 0, 3: 0, 4: 0 }
};

async function loadQuarterlyTaxBoard() {
  const tasks = qTaxYears.map(async (year) => {
    try {
      qTaxByYear[year] = await API.get(`/api/quarterly-tax/_fleet/${year}`);
    } catch (e) {
      qTaxByYear[year] = { 1: 0, 2: 0, 3: 0, 4: 0 };
    }
  });
  await Promise.all(tasks);
  renderQuarterlyTaxBoard();
}

function renderQuarterlyTaxBoard() {
  const el = document.getElementById('quarterlyTaxBody');
  if (!el) return;
  const label = document.getElementById('qTaxYearLabel');
  if (label) label.textContent = '2024 · 2025 · 2026';

  const qNames = ['Q1 · Jan–Mar', 'Q2 · Apr–Jun', 'Q3 · Jul–Sep', 'Q4 · Oct–Dec'];
  const admin = typeof isAdmin === 'function' ? isAdmin() : false;

  const cards = qTaxYears.map(year => {
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

  const grandTotal = qTaxYears.reduce((sum, year) => {
    const data = qTaxByYear[year] || { 1: 0, 2: 0, 3: 0, 4: 0 };
    return sum + [1, 2, 3, 4].reduce((yearSum, q) => yearSum + (data[q] || 0), 0);
  }, 0);

  el.innerHTML = `
    <div class="qtax-board">${cards}</div>
    <div class="qtax-grand-total">
      <span>Total Tax Paid · 2024-2026</span>
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
    renderQuarterlyTaxBoard();
  } catch (e) {
    console.error('Failed to save quarterly tax', e);
  }
}

// ─── SUPERVISOR SALARY PAYMENTS ─────────────────────────────────────────────
let salaryPayments = [];
let salaryYear = null;

async function loadSalaryPayments(year) {
  salaryYear = (year && year !== 'all') ? parseInt(year) : new Date().getFullYear();
  try {
    salaryPayments = await API.get(`/api/salary-payments/_fleet/${salaryYear}`);
  } catch (e) {
    salaryPayments = [];
  }
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
  if (label) label.textContent = salaryYear;
  const admin = typeof isAdmin === 'function' ? isAdmin() : false;

  const rows = salaryPayments.map(entry => {
    const week = entry.week || getISOWeekFromDateStr(entry.datePaid);
    return `
    <div class="salary-row" data-id="${entry._id}">
      <input type="date" value="${entry.datePaid || ''}" class="salary-date" ${admin ? '' : 'disabled'}>
      <input type="number" value="${entry.amount || ''}" class="salary-amount" min="0" placeholder="0" ${admin ? '' : 'disabled'}>
      <div style="font-size:0.72rem;color:var(--muted);font-family:'JetBrains Mono',monospace;text-align:center;">${week ? `Week ${week}` : 'No week'}</div>
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
      <span style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);">Total Supervisor Salary Paid · ${salaryYear}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:var(--accent);">GHS ${salaryTotal().toLocaleString()}</span>
    </div>
  `;
}

async function addSalaryPayment() {
  if (typeof isAdmin === 'function' && !isAdmin()) return;
  const datePaid = document.getElementById('salaryNewDate')?.value;
  const amount = parseFloat(document.getElementById('salaryNewAmount')?.value) || 0;
  try {
    await API.post('/api/salary-payments/_fleet/' + salaryYear, { datePaid, amount });
    await loadSalaryPayments(salaryYear);
  } catch (e) {
    console.error('Failed to add salary payment', e);
  }
}

async function saveSalaryPayment(button) {
  if (typeof isAdmin === 'function' && !isAdmin()) return;
  const row = button.closest('.salary-row');
  const id = row?.dataset.id;
  if (!id) return;
  const datePaid = row.querySelector('.salary-date')?.value;
  const amount = parseFloat(row.querySelector('.salary-amount')?.value) || 0;
  try {
    await API.put(`/api/salary-payments/_fleet/${salaryYear}/${id}`, { datePaid, amount });
    await loadSalaryPayments(salaryYear);
  } catch (e) {
    console.error('Failed to save salary payment', e);
  }
}

async function deleteSalaryPayment(button) {
  if (typeof isAdmin === 'function' && !isAdmin()) return;
  const row = button.closest('.salary-row');
  const id = row?.dataset.id;
  if (!id) return;
  try {
    await API.del(`/api/salary-payments/_fleet/${salaryYear}/${id}`);
    await loadSalaryPayments(salaryYear);
  } catch (e) {
    console.error('Failed to delete salary payment', e);
  }
}
