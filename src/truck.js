// ─── TRUCK DETAIL PAGE ───────────────────────────────────────────────────────
// Reads truck ID from URL params, loads DATA from localStorage, renders charts
// and tables for the individual truck.

const STORAGE_KEY = 'transport_dashboard_data';
let DATA = {};
let TRUCK_ID = '';
let charts = {};

// ─── DATA LOADING ────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const fresh = await API.get('/api/dashboard/full');
    if (fresh && fresh.trucks) {
      DATA.trucks = fresh.trucks;
      DATA.drivers = fresh.drivers || {};
      DATA.truckCost = fresh.truckCost || {};
      DATA.endOfTerm = fresh.endOfTerm || {};
      DATA.monthly = fresh.monthly || {};
      DATA.expBreakdown = fresh.expBreakdown || {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
      return;
    }
  } catch (e) {
    // Fallback to local cache when offline
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { DATA = JSON.parse(raw); } catch(e) { DATA = {}; }
  }
  if (!DATA.trucks) DATA.trucks = {};
  if (!DATA.drivers) DATA.drivers = {};
  if (!DATA.truckCost) DATA.truckCost = {};
  if (!DATA.endOfTerm) DATA.endOfTerm = {};
  if (!DATA.monthly) DATA.monthly = {};
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n >= 1000000) return 'GHS ' + (n / 1000000).toFixed(2) + 'M';
  if (n >= 1000) return 'GHS ' + (n / 1000).toFixed(0) + 'K';
  return 'GHS ' + n.toLocaleString();
}

function getISOWeeksInYear(year) {
  const y = parseInt(year);
  const jan1 = new Date(y, 0, 1);
  const dec31 = new Date(y, 11, 31);
  return (jan1.getDay() === 4 || dec31.getDay() === 4) ? 53 : 52;
}

function getWeeksForYear(year) {
  const y = parseInt(year);
  const now = new Date();
  const currentYear = now.getFullYear();
  if (y < currentYear) return getISOWeeksInYear(y);
  if (y > currentYear) return 0;
  const start = new Date(y, 0, 1);
  const diff = now - start;
  return Math.min(getISOWeeksInYear(y), Math.floor(diff / (7 * 24 * 60 * 60 * 1000)));
}

function getTruckYears() {
  const td = DATA.trucks[TRUCK_ID];
  if (!td) return [];
  return Object.keys(td).map(Number).filter(y => Number.isFinite(y)).sort((a, b) => a - b);
}

function getTruckTotals() {
  const td = DATA.trucks[TRUCK_ID];
  if (!td) return { gross: 0, exp: 0, net: 0, weeks: 0 };
  let gross = 0, exp = 0, net = 0, weeks = 0;
  for (const y in td) {
    gross += td[y].gross || 0;
    exp += td[y].exp || 0;
    net += td[y].net || 0;
    weeks += td[y].weeks || 0;
  }
  return { gross, exp, net, weeks };
}

// ─── MODAL HELPERS ───────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' error' : '');
  setTimeout(() => t.className = 'toast', 2600);
}

// ─── KPIs ────────────────────────────────────────────────────────────────────
function renderKPIs() {
  const { gross, exp, net, weeks } = getTruckTotals();
  const eff = gross ? Math.round(net / gross * 100) : 0;
  const avgWeek = weeks ? Math.round(gross / weeks) : 0;
  const el = document.getElementById('kpiStrip');
  el.innerHTML = `
    <div class="kpi">
      <div class="kpi-label">Total Gross</div>
      <div class="kpi-value">${fmt(gross)}</div>
      <div class="kpi-sub">${weeks} weeks operated</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Net Income</div>
      <div class="kpi-value">${fmt(net)}</div>
      <span class="kpi-sub" style="color:${eff >= 60 ? 'var(--green)' : 'var(--red)'}">▲ ${eff}% efficiency</span>
    </div>
    <div class="kpi">
      <div class="kpi-label">Total Expenditure</div>
      <div class="kpi-value">${fmt(exp)}</div>
      <div class="kpi-sub">${gross ? Math.round(exp / gross * 100) : 0}% of gross</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Avg Weekly Gross</div>
      <div class="kpi-value">${fmt(avgWeek)}</div>
      <div class="kpi-sub">Per operational week</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Years Active</div>
      <div class="kpi-value">${getTruckYears().length}</div>
      <div class="kpi-sub">${getTruckYears().join(', ') || '—'}</div>
    </div>
  `;
}

// ─── YEARLY CHART ────────────────────────────────────────────────────────────
function renderYearlyChart() {
  const years = getTruckYears();
  const td = DATA.trucks[TRUCK_ID] || {};
  const ctx = document.getElementById('yearlyChart').getContext('2d');
  if (charts.yearly) charts.yearly.destroy();
  charts.yearly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [
        {
          label: 'Gross', data: years.map(y => (td[y] || {}).gross || 0),
          backgroundColor: 'rgba(245,166,35,0.7)', borderColor: '#f5a623',
          borderWidth: 1.5, borderRadius: 5
        },
        {
          label: 'Expenditure', data: years.map(y => (td[y] || {}).exp || 0),
          backgroundColor: 'rgba(224,68,58,0.6)', borderColor: '#e0443a',
          borderWidth: 1.5, borderRadius: 5
        },
        {
          label: 'Net', data: years.map(y => (td[y] || {}).net || 0),
          backgroundColor: 'rgba(45,224,138,0.6)', borderColor: '#2de08a',
          borderWidth: 1.5, borderRadius: 5
        }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: '#9aa4b8', padding: 12, usePointStyle: true } },
        tooltip: {
          backgroundColor: '#1a1f2b', borderColor: '#252d3d', borderWidth: 1,
          callbacks: { label: ctx => ` ${ctx.dataset.label}: GHS ${ctx.parsed.y.toLocaleString()}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9aa4b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7a96', callback: v => 'GHS ' + (v / 1000) + 'K' } }
      }
    }
  });
}

// ─── EFFICIENCY CHART ────────────────────────────────────────────────────────
function renderEffChart() {
  const years = getTruckYears();
  const td = DATA.trucks[TRUCK_ID] || {};
  const effs = years.map(y => {
    const d = td[y];
    return d && d.gross ? Math.round(d.net / d.gross * 100) : 0;
  });
  const ctx = document.getElementById('effChart').getContext('2d');
  if (charts.eff) charts.eff.destroy();
  charts.eff = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: years,
      datasets: [{
        label: 'Efficiency %',
        data: effs,
        backgroundColor: effs.map(e => e > 80 ? 'rgba(45,224,138,0.75)' : e > 60 ? 'rgba(245,166,35,0.75)' : 'rgba(224,68,58,0.75)'),
        borderColor: effs.map(e => e > 80 ? '#2de08a' : e > 60 ? '#f5a623' : '#e0443a'),
        borderWidth: 1.5, borderRadius: 5
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#1a1f2b', borderColor: '#252d3d', borderWidth: 1,
          callbacks: { label: ctx => ` Efficiency: ${ctx.parsed.y}%` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9aa4b8' } },
        y: { max: 100, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7a96', callback: v => v + '%' } }
      }
    }
  });
}

// ─── NET TREND CHART ─────────────────────────────────────────────────────────
function renderNetTrend() {
  const years = getTruckYears();
  const td = DATA.trucks[TRUCK_ID] || {};
  const nets = years.map(y => (td[y] || {}).net || 0);
  const ctx = document.getElementById('netTrendChart').getContext('2d');
  if (charts.trend) charts.trend.destroy();
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [{
        label: 'Net Income',
        data: nets,
        borderColor: '#2de08a',
        backgroundColor: 'rgba(45,224,138,0.1)',
        borderWidth: 2.5,
        pointBackgroundColor: '#2de08a',
        pointRadius: 5,
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#1a1f2b', borderColor: '#252d3d', borderWidth: 1,
          callbacks: { label: ctx => ` Net: GHS ${ctx.parsed.y.toLocaleString()}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9aa4b8' } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#6b7a96', callback: v => 'GHS ' + (v / 1000) + 'K' } }
      }
    }
  });
}

// ─── YEAR TABLE ──────────────────────────────────────────────────────────────
function renderYearTable() {
  const years = getTruckYears();
  const td = DATA.trucks[TRUCK_ID] || {};
  const { gross: totalGross } = getTruckTotals();

  let html = `<thead><tr>
    <th>Year</th><th>Gross (GHS)</th><th>Expenditure (GHS)</th>
    <th>Net (GHS)</th><th>Weeks</th><th>Efficiency</th><th>Share of Total</th>
    ${isAdmin() ? '<th>Actions</th>' : ''}
  </tr></thead><tbody>`;

  years.forEach(y => {
    const d = td[y] || { gross: 0, exp: 0, net: 0, weeks: 0 };
    const eff = d.gross ? Math.round(d.net / d.gross * 100) : 0;
    const share = totalGross ? Math.round(d.gross / totalGross * 100) : 0;
    const effColor = eff > 80 ? 'var(--green)' : eff > 60 ? 'var(--accent)' : 'var(--red)';
    html += `<tr>
      <td style="font-weight:700;color:var(--accent)">${y}</td>
      <td style="color:var(--accent)">${d.gross.toLocaleString()}</td>
      <td style="color:var(--red)">${d.exp.toLocaleString()}</td>
      <td style="color:var(--green);font-weight:700">${d.net.toLocaleString()}</td>
      <td style="color:var(--muted);text-align:center">${d.weeks}</td>
      <td style="color:${effColor};font-weight:600">${eff}%</td>
      <td>
        <div class="bar-cell">
          <div class="mini-bar-bg"><div class="mini-bar-fill" style="width:${share}%"></div></div>
          <span style="font-size:0.7rem;color:var(--muted)">${share}%</span>
        </div>
      </td>
      ${isAdmin() ? `<td><button class="btn btn-secondary btn-sm" onclick="openEditYear(${y})">✎ Edit</button></td>` : ''}
    </tr>`;
  });

  // Total row
  const totals = getTruckTotals();
  const totalEff = totals.gross ? Math.round(totals.net / totals.gross * 100) : 0;
  html += `<tr style="border-top:2px solid var(--border);font-weight:700">
    <td style="color:var(--text)">TOTAL</td>
    <td style="color:var(--accent)">${totals.gross.toLocaleString()}</td>
    <td style="color:var(--red)">${totals.exp.toLocaleString()}</td>
    <td style="color:var(--green)">${totals.net.toLocaleString()}</td>
    <td style="color:var(--muted);text-align:center">${totals.weeks}</td>
    <td style="color:var(--text)">${totalEff}%</td>
    <td>—</td>
    ${isAdmin() ? '<td></td>' : ''}
  </tr>`;

  html += '</tbody>';
  document.getElementById('yearTable').innerHTML = html;
}

// ─── SPREADSHEET LINKS ──────────────────────────────────────────────────────
function renderSpreadsheetLinks() {
  const years = getTruckYears();
  const el = document.getElementById('spreadsheetLinks');
  if (!el) return;
  el.innerHTML = years.map(y =>
    `<a href="year.html?year=${y}" class="spread-link" style="display:inline-flex;align-items:center;gap:5px;padding:5px 14px;border-radius:6px;font-size:0.78rem;font-weight:600;background:rgba(245,166,35,0.1);border:1px solid rgba(245,166,35,0.25);color:var(--accent);text-decoration:none;transition:all 0.2s" onmouseover="this.style.background='rgba(245,166,35,0.2)'" onmouseout="this.style.background='rgba(245,166,35,0.1)'"><i class="fa-solid fa-table-cells"></i> ${y}</a>`
  ).join('');
}

// ─── ADD YEAR ────────────────────────────────────────────────────────────────
function openAddYearModal() {
  if (!isAdmin()) return showToast('View only — contact admin', true);
  const thisYear = new Date().getFullYear();
  document.getElementById('addYear').value = thisYear;
  document.getElementById('addWeeks').value = getWeeksForYear(thisYear);
  document.getElementById('addGross').value = '';
  document.getElementById('addExp').value = '';
  openModal('addYearModal');
}

async function submitAddYear() {
  if (!isAdmin()) return showToast('View only', true);
  const year = parseInt(document.getElementById('addYear').value);
  const weeks = parseInt(document.getElementById('addWeeks').value) || 0;
  const gross = parseFloat(document.getElementById('addGross').value) || 0;
  const exp = parseFloat(document.getElementById('addExp').value) || 0;
  if (!year) return showToast('Enter a valid year', true);
  if (!DATA.trucks[TRUCK_ID]) DATA.trucks[TRUCK_ID] = {};
  if (DATA.trucks[TRUCK_ID][year]) return showToast('Year already exists — edit it instead', true);
  try {
    await API.post('/api/trucks/' + encodeURIComponent(TRUCK_ID) + '/years', { year, gross, exp, weeks });
    await syncFromAPI();
    closeModal('addYearModal');
    showToast(`${year} added for ${TRUCK_ID}`);
    refreshAll();
  } catch (err) {
    showToast(err.message || 'Failed to add year', true);
  }
}

// ─── EDIT YEAR ───────────────────────────────────────────────────────────────
let editingYear = null;

function openEditYear(year) {
  if (!isAdmin()) return showToast('View only', true);
  editingYear = year;
  const d = DATA.trucks[TRUCK_ID]?.[year] || {};
  document.getElementById('editYearTitle').textContent = `Edit ${year}`;
  document.getElementById('editYearLabel').value = year;
  document.getElementById('editWeeks').value = d.weeks || 0;
  document.getElementById('editGross').value = d.gross || 0;
  document.getElementById('editExp').value = d.exp || 0;
  openModal('editYearModal');
}

async function submitEditYear() {
  if (!isAdmin()) return showToast('View only', true);
  const weeks = parseInt(document.getElementById('editWeeks').value) || 0;
  const gross = parseFloat(document.getElementById('editGross').value) || 0;
  const exp = parseFloat(document.getElementById('editExp').value) || 0;
  if (!DATA.trucks[TRUCK_ID]) DATA.trucks[TRUCK_ID] = {};
  try {
    await API.post('/api/trucks/' + encodeURIComponent(TRUCK_ID) + '/years', { year: editingYear, gross, exp, weeks });
    await syncFromAPI();
    closeModal('editYearModal');
    showToast(`${editingYear} updated`);
    refreshAll();
  } catch (err) {
    showToast(err.message || 'Failed to update year', true);
  }
}

async function deleteYearEntry() {
  if (!isAdmin()) return showToast('View only', true);
  if (!confirm(`Delete year ${editingYear} data for ${TRUCK_ID}?`)) return;
  try {
    await API.del('/api/trucks/' + encodeURIComponent(TRUCK_ID) + '/years/' + editingYear);
    await syncFromAPI();
    closeModal('editYearModal');
    showToast(`${editingYear} deleted`);
    refreshAll();
  } catch (err) {
    showToast(err.message || 'Failed to delete year', true);
  }
}

// ─── EDIT DRIVER / TRUCK SETTINGS ────────────────────────────────────────────
function openEditDriverModal() {
  if (!isAdmin()) return showToast('View only', true);  document.getElementById('truckNameInput').value = TRUCK_ID;  document.getElementById('driverNameInput').value = DATA.drivers[TRUCK_ID] || '';
  const cost = DATA.truckCost?.[TRUCK_ID] || {};
  document.getElementById('truckPricePaidInput').value = cost.pricePaid || 0;
  document.getElementById('truckInsuranceInput').value = cost.insurance || 0;
  document.getElementById('truckMaintCostInput').value = cost.maintenanceCost || 0;
  updateTruckTotalPreview();
  openModal('editDriverModal');
}

function updateTruckTotalPreview() {
  const pp = parseFloat(document.getElementById('truckPricePaidInput')?.value) || 0;
  const ins = parseFloat(document.getElementById('truckInsuranceInput')?.value) || 0;
  const mc = parseFloat(document.getElementById('truckMaintCostInput')?.value) || 0;
  const el = document.getElementById('truckTotalAmountPreview');
  if (el) el.textContent = `Total Cost: GHS ${(pp + ins + mc).toLocaleString()}`;
}

async function submitDriver() {
  if (!isAdmin()) return showToast('View only', true);
  const newName = (document.getElementById('truckNameInput').value || '').trim().toUpperCase();
  const name = document.getElementById('driverNameInput').value.trim();
  const pp = parseFloat(document.getElementById('truckPricePaidInput').value) || 0;
  const ins = parseFloat(document.getElementById('truckInsuranceInput').value) || 0;
  const mc = parseFloat(document.getElementById('truckMaintCostInput').value) || 0;

  const renamed = newName && newName !== TRUCK_ID;
  try {
    await API.put('/api/trucks/' + encodeURIComponent(TRUCK_ID), {
      newTruckId: renamed ? newName : undefined,
      driver: name,
      cost: { pricePaid: pp, insurance: ins, maintenanceCost: mc, initialValue: pp + ins + mc }
    });
    if (renamed) {
      TRUCK_ID = newName;
      const url = new URL(window.location);
      url.searchParams.set('id', TRUCK_ID);
      window.history.replaceState({}, '', url);
    }
    await syncFromAPI();
    closeModal('editDriverModal');
    showToast(renamed ? ('Truck renamed to ' + TRUCK_ID) : 'Truck settings saved');
    refreshAll();
  } catch (err) {
    showToast(err.message || 'Failed to save truck settings', true);
  }
}

// ─── DELETE TRUCK ────────────────────────────────────────────────────────────
function openDeleteTruckModal() {
  if (!isAdmin()) return showToast('View only', true);
  document.getElementById('deleteTruckName').textContent = TRUCK_ID;
  openModal('deleteTruckModal');
}

async function confirmDeleteTruck() {
  if (!isAdmin()) return showToast('View only', true);
  try {
    await API.del('/api/trucks/' + encodeURIComponent(TRUCK_ID));
    showToast(`${TRUCK_ID} deleted — recoverable for 30 days`);
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  } catch (err) {
    showToast(err.message || 'Failed to delete truck', true);
  }
}

// ─── MONTHLY / WEEKLY STUBS ─────────────────────────────────────────────────
// These are placeholders — the full editors can be expanded later
function openTruckMonthlyEditor() {
  showToast('Open the Year Spreadsheet for monthly editing', false);
}
function openTruckWeeklyEditor() {
  showToast('Open the Year Spreadsheet for weekly editing', false);
}

// ─── REFRESH ─────────────────────────────────────────────────────────────────
function refreshAll() {
  const driver = DATA.drivers[TRUCK_ID] || '—';
  document.getElementById('truckTitle').textContent = TRUCK_ID;
  document.getElementById('truckSubtitle').textContent = `Driver: ${driver}`;
  document.title = `${TRUCK_ID} — Truck Detail`;
  renderKPIs();
  renderYearlyChart();
  renderEffChart();
  renderNetTrend();
  renderYearTable();
  renderSpreadsheetLinks();
}

// ─── INIT ────────────────────────────────────────────────────────────────────
(async function init() {
  const params = new URLSearchParams(window.location.search);
  TRUCK_ID = params.get('id') || '';

  await loadData();

  if (!TRUCK_ID || !DATA.trucks[TRUCK_ID]) {
    document.getElementById('truckTitle').textContent = TRUCK_ID || 'Unknown';
    document.getElementById('truckSubtitle').textContent = 'Truck not found in data. Visit the dashboard first to sync data.';
    document.getElementById('kpiStrip').innerHTML = '<p style="color:var(--red);padding:20px">No data available for this truck. Please visit the <a href="index.html" style="color:var(--accent)">dashboard</a> first, then navigate here by clicking on a truck.</p>';
    return;
  }

  // Add event listeners for truck cost preview
  ['truckPricePaidInput', 'truckMaintCostInput'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateTruckTotalPreview);
  });

  refreshAll();
})();

// ─── SYNC FROM API ───────────────────────────────────────────────────────────
async function syncFromAPI() {
  if (!TRUCK_ID) return;
  try {
    const fresh = await API.get('/api/dashboard/full');
    if (!fresh || !fresh.trucks) return;
    DATA.trucks = fresh.trucks;
    DATA.drivers = fresh.drivers || {};
    DATA.truckCost = fresh.truckCost || {};
    DATA.endOfTerm = fresh.endOfTerm || {};
    if (fresh.monthly) DATA.monthly = fresh.monthly;
    if (fresh.expBreakdown) DATA.expBreakdown = fresh.expBreakdown;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA));
    if (DATA.trucks[TRUCK_ID]) refreshAll();
  } catch(e) { /* offline — keep using localStorage data */ }
}
syncFromAPI();

// Auto-refresh when tab gains focus (cross-computer sync)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncFromAPI();
});
