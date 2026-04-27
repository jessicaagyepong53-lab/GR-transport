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
  loadQuarterlyTax(year);
}

function renderSummary() {
  if (!reportData) return;
  const d = reportData;
  const adjGross = d.totalGross;
  const adjNet = adjGross - d.totalExp;
  const eff = adjGross ? Math.round(adjNet / adjGross * 100) : 0;

  document.getElementById('summaryGrid').innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Total Gross Income</div>
      <div class="summary-value" style="color:var(--accent)">${fmt(adjGross)}</div>
      <div class="summary-sub">${d.activeCount || d.truckCount} active trucks${d.eotCount ? ` · ${d.eotCount} end of term` : ''}</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Net Income</div>
      <div class="summary-value" style="color:var(--green)">${fmt(adjNet)}</div>
      <div class="summary-sub">${eff}% efficiency</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Expenditure</div>
      <div class="summary-value" style="color:var(--red)">${fmt(d.totalExp)}</div>
      <div class="summary-sub">${adjGross ? Math.round(d.totalExp/adjGross*100) : 0}% of gross</div>
    </div>
    ${d.topPerformer ? `<div class="summary-card">
      <div class="summary-label">Top Performer</div>
      <div class="summary-value" style="color:var(--green);font-size:1.6rem">${d.topPerformer.truckId}</div>
      <div class="summary-sub">Net: ${fmt(d.topPerformer.net)}</div>
    </div>` : ''}
    ${d.bottomPerformer && (d.activeCount || d.truckCount) > 1 ? `<div class="summary-card">
      <div class="summary-label">Lowest Performer</div>
      <div class="summary-value" style="color:var(--red);font-size:1.6rem">${d.bottomPerformer.truckId}</div>
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
  const eb = reportData.expBreakdown || { maint: 0, other: 0 };
  const table = document.getElementById('annualSummaryTable');

  let html = `<thead><tr>
    <th style="text-align:left">Trucks</th>
    <th>Total Expenditure (GHS)</th>
    <th>Total Income (GHS)</th>
    <th>Average Income (GHS)</th>
    <th>Total Amount (GHS)</th>
    <th>Minor Expenditure (GHS)</th>
    <th>Major Expenditure (GHS)</th>
    <th>% Expenditure</th>
    <th>% Income</th>
    <th>Ratio</th>
    <th>Ranks</th>
  </tr></thead><tbody>`;

  let totExp = 0, totIncome = 0, totAmount = 0, totMinor = 0, totMajor = 0, totWeeks = 0;

  trucks.forEach(t => {
    const rankClass = t.rank === 1 ? 'rank-1' : t.rank === 2 ? 'rank-2' : t.rank === 3 ? 'rank-3' : 'rank-other';
    const eotStyle = t.eot ? 'opacity:0.5;' : '';
    const eotLabel = t.eot ? ' <span style="color:var(--red);font-size:0.65rem;font-family:DM Sans,sans-serif;font-weight:400;">EOT</span>' : '';

    // Include ALL trucks in totals (EOT trucks still have real data for their years)
    totExp += t.exp;
    totIncome += t.net;
    totAmount += t.totalAmount;
    totMinor += t.minorExp;
    totMajor += t.majorExp;
    totWeeks += (t.weeks || 0);

    html += `<tr style="${eotStyle}">
      <td><a href="truck.html?id=${encodeURIComponent(t.truckId)}" style="color:${getTruckColor(t.truckId)};text-decoration:none">${t.truckId}</a>${eotLabel}</td>
      <td style="color:var(--red)">${t.exp.toLocaleString()}</td>
      <td style="color:var(--green)">${t.net.toLocaleString()}</td>
      <td>${t.avgIncome.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
      <td style="color:var(--blue)">${t.totalAmount.toLocaleString()}</td>
      <td>${t.minorExp.toLocaleString()}</td>
      <td>${t.majorExp.toLocaleString()}</td>
      <td style="color:var(--red)">${t.pctExp}%</td>
      <td style="color:var(--green)">${t.pctIncome}%</td>
      <td>${t.ratio.toFixed(2)}:1</td>
      <td>${t.rank != null ? `<span class="rank-badge ${rankClass}">${t.rank}</span>` : '<span style="color:var(--muted);font-size:0.72rem;">—</span>'}</td>
    </tr>`;
  });

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
    <td>${totPctExp}%</td>
    <td>${totPctIncome}%</td>
    <td>${totRatio}:1</td>
    <td></td>
  </tr>`;

  html += '</tbody>';
  table.innerHTML = html;
}

document.addEventListener('DOMContentLoaded', init);

// Auto-refresh when tab gains focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadReport();
});

// ─── QUARTERLY INCOME TAX ────────────────────────────────────────────────────
let qTaxData = { 1: 0, 2: 0, 3: 0, 4: 0 };
let qTaxYear = null;

async function loadQuarterlyTax(year) {
  qTaxYear = (year && year !== 'all') ? parseInt(year) : new Date().getFullYear();
  try {
    qTaxData = await API.get(`/api/quarterly-tax/_fleet/${qTaxYear}`);
  } catch (e) {
    qTaxData = { 1: 0, 2: 0, 3: 0, 4: 0 };
  }
  renderQuarterlyTax();
}

function renderQuarterlyTax() {
  const el = document.getElementById('quarterlyTaxBody');
  if (!el) return;
  const label = document.getElementById('qTaxYearLabel');
  if (label) label.textContent = qTaxYear;

  const qNames = ['Q1 · Jan–Mar', 'Q2 · Apr–Jun', 'Q3 · Jul–Sep', 'Q4 · Oct–Dec'];
  const total = [1, 2, 3, 4].reduce((s, q) => s + (qTaxData[q] || 0), 0);
  const admin = typeof isAdmin === 'function' ? isAdmin() : false;

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px;">
      ${[1, 2, 3, 4].map(q => `
        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:18px 16px;text-align:center;">
          <div style="font-size:0.65rem;text-transform:uppercase;letter-spacing:1.4px;color:var(--muted);margin-bottom:10px;">${qNames[q - 1]}</div>
          ${admin ? `
            <input type="number" id="qTaxInput${q}" value="${qTaxData[q] || ''}" min="0" placeholder="—"
              style="width:100%;text-align:center;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 8px;color:${qTaxData[q] ? 'var(--accent)' : 'var(--muted)'};font-family:'JetBrains Mono',monospace;font-size:1.05rem;font-weight:700;"
              oninput="this.style.color=this.value>0?'var(--accent)':'var(--muted)'"
              onblur="saveQuarterTax(${q})">
            <div style="font-size:0.64rem;color:var(--muted);margin-top:6px;">GHS · blur to save</div>
          ` : `
            <div style="font-family:'Bebas Neue',sans-serif;font-size:1.9rem;letter-spacing:2px;color:${qTaxData[q] ? 'var(--accent)' : 'var(--muted)'};">
              ${qTaxData[q] ? qTaxData[q].toLocaleString() : '—'}
            </div>
            <div style="font-size:0.7rem;color:var(--muted);margin-top:4px;">GHS</div>
          `}
        </div>
      `).join('')}
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding-top:14px;border-top:1px solid var(--border);">
      <span style="font-size:0.72rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);">Total Tax Paid · ${qTaxYear}</span>
      <span style="font-family:'JetBrains Mono',monospace;font-size:1rem;font-weight:700;color:var(--accent);">GHS ${total.toLocaleString()}</span>
    </div>
  `;
}

async function saveQuarterTax(quarter) {
  if (typeof isAdmin === 'function' && !isAdmin()) return;
  const input = document.getElementById(`qTaxInput${quarter}`);
  if (!input) return;
  const amount = parseFloat(input.value) || 0;
  try {
    await API.put(`/api/quarterly-tax/_fleet/${qTaxYear}/${quarter}`, { amount });
    qTaxData[quarter] = amount;
    renderQuarterlyTax();
  } catch (e) {
    console.error('Failed to save quarterly tax', e);
  }
}
