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
}

function renderSummary() {
  if (!reportData) return;
  const d = reportData;
  const eff = d.totalGross ? Math.round(d.totalNet / d.totalGross * 100) : 0;

  document.getElementById('summaryGrid').innerHTML = `
    <div class="summary-card">
      <div class="summary-label">Total Truck Gross</div>
      <div class="summary-value" style="color:var(--accent)">${fmt(d.totalGross)}</div>
      <div class="summary-sub">${d.truckCount} trucks in operation</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Truck Net</div>
      <div class="summary-value" style="color:var(--green)">${fmt(d.totalNet)}</div>
      <div class="summary-sub">${eff}% truck efficiency</div>
    </div>
    <div class="summary-card">
      <div class="summary-label">Total Expenditure</div>
      <div class="summary-value" style="color:var(--red)">${fmt(d.totalExp)}</div>
      <div class="summary-sub">${d.totalGross ? Math.round(d.totalExp/d.totalGross*100) : 0}% of gross</div>
    </div>
    ${d.topPerformer ? `<div class="summary-card">
      <div class="summary-label">Top Performer</div>
      <div class="summary-value" style="color:var(--green);font-size:1.6rem">${d.topPerformer.truckId}</div>
      <div class="summary-sub">Net: ${fmt(d.topPerformer.net)}</div>
    </div>` : ''}
    ${d.bottomPerformer && d.truckCount > 1 ? `<div class="summary-card">
      <div class="summary-label">Lowest Performer</div>
      <div class="summary-value" style="color:var(--red);font-size:1.6rem">${d.bottomPerformer.truckId}</div>
      <div class="summary-sub">Net: ${fmt(d.bottomPerformer.net)}</div>
    </div>` : ''}
  `;
}

function renderRanking() {
  if (!reportData?.truckRanking) return;
  const ranking = reportData.truckRanking;
  let html = `<thead><tr><th>#</th><th>Truck ID</th><th>Gross (GHS)</th><th>Expenditure (GHS)</th><th>Net (GHS)</th><th>Efficiency</th></tr></thead><tbody>`;

  ranking.forEach((t, i) => {
    const eff = t.gross ? Math.round(t.net / t.gross * 100) : 0;
    html += `<tr>
      <td style="color:var(--muted);font-weight:600">${i + 1}</td>
      <td><a href="truck.html?id=${encodeURIComponent(t.truckId)}" style="color:${getTruckColor(t.truckId)};text-decoration:none;font-weight:600;font-family:'JetBrains Mono',monospace">${t.truckId}</a></td>
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

  let totExp = 0, totIncome = 0, totAmount = 0, totMinor = 0, totMajor = 0, totAvgIncome = 0;

  trucks.forEach(t => {
    const rankClass = t.rank === 1 ? 'rank-1' : t.rank === 2 ? 'rank-2' : t.rank === 3 ? 'rank-3' : 'rank-other';
    totExp += t.exp;
    totIncome += t.net;
    totAmount += t.totalAmount;
    totMinor += t.minorExp;
    totMajor += t.majorExp;
    totAvgIncome += t.avgIncome;

    html += `<tr>
      <td><a href="truck.html?id=${encodeURIComponent(t.truckId)}" style="color:${getTruckColor(t.truckId)};text-decoration:none">${t.truckId}</a></td>
      <td style="color:var(--red)">${t.exp.toLocaleString()}</td>
      <td style="color:var(--green)">${t.net.toLocaleString()}</td>
      <td>${t.avgIncome.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
      <td style="color:var(--blue)">${t.totalAmount.toLocaleString()}</td>
      <td>${t.minorExp.toLocaleString()}</td>
      <td>${t.majorExp.toLocaleString()}</td>
      <td style="color:var(--red)">${t.pctExp}%</td>
      <td style="color:var(--green)">${t.pctIncome}%</td>
      <td>${t.ratio.toFixed(2)}:1</td>
      <td><span class="rank-badge ${rankClass}">${t.rank}</span></td>
    </tr>`;
  });

  // Totals row
  const totPctExp = totAmount ? Math.round(totExp / totAmount * 100) : 0;
  const totPctIncome = totAmount ? Math.round(totIncome / totAmount * 100) : 0;
  const totRatio = totIncome ? (totExp / totIncome).toFixed(2) : '0.00';

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
