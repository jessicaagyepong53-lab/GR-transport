// ─── WEEKLY ENTRY PAGE ───────────────────────────────────────────────────────

let allTrucks = [];
let truckYearMap = {};
let currentEntry = null;

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.className = 'toast', 2600);
}

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  // Try API first, then fall back to localStorage truck list
  try {
    allTrucks = await API.get('/api/trucks');
  } catch {
    allTrucks = [];
  }
  if (!allTrucks || !allTrucks.length) {
    try {
      const raw = localStorage.getItem('transport_dashboard_data');
      if (raw) {
        const data = JSON.parse(raw);
        const drivers = data.drivers || {};
        truckYearMap = data.trucks || {};
        allTrucks = Object.keys(truckYearMap).map(id => ({ truckId: id, driver: drivers[id] || '' }));
      }
    } catch { /* ignore */ }
  }
  populateTruckSelect();
  populateYearSelect();
  populateWeekSelect();
  loadWeek();
  loadHistory();
}

function populateTruckSelect() {
  const sel = document.getElementById('truckSelect');
  const selectedYear = document.getElementById('yearSelect')?.value;
  const prevTruck = sel.value;

  // Filter trucks that have data for the selected year
  let filtered = allTrucks;
  if (selectedYear && Object.keys(truckYearMap).length) {
    filtered = allTrucks.filter(t => truckYearMap[t.truckId] && truckYearMap[t.truckId][selectedYear]);
  }

  if (!filtered.length) {
    sel.innerHTML = '<option value="">No trucks for this year</option>';
    return;
  }
  sel.innerHTML = filtered.map(t =>
    `<option value="${t.truckId}">${t.truckId}${t.driver ? ' \u2014 ' + t.driver : ''}</option>`
  ).join('');

  // Restore previous selection if still available
  if (prevTruck && filtered.some(t => t.truckId === prevTruck)) {
    sel.value = prevTruck;
  }
}

function populateYearSelect() {
  const sel = document.getElementById('yearSelect');
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = 2024; y <= 2040; y++) years.push(y);
  sel.innerHTML = years.map(y =>
    `<option value="${y}"${y === currentYear ? ' selected' : ''}>${y}</option>`
  ).join('');
}

function getWeekMonday(year, week) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const w1Monday = new Date(jan4);
  w1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(w1Monday);
  monday.setDate(w1Monday.getDate() + (week - 1) * 7);
  return monday;
}

function fmtShortDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

function populateWeekSelect() {
  const sel = document.getElementById('weekSelect');
  const year = parseInt(document.getElementById('yearSelect').value) || new Date().getFullYear();
  const currentWeek = getISOWeek(new Date());
  const currentYear = new Date().getFullYear();
  let html = '';
  for (let w = 1; w <= 52; w++) {
    const mon = getWeekMonday(year, w);
    const sat = new Date(mon);
    sat.setDate(mon.getDate() + 5);
    const label = `W${w} \u00b7 ${fmtShortDate(mon)} \u2013 ${fmtShortDate(sat)}`;
    const selected = (year === currentYear && w === currentWeek) ? ' selected' : '';
    html += `<option value="${w}"${selected}>${label}</option>`;
  }
  sel.innerHTML = html;
}

function getISOWeek(dt) {
  const d = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function getSelected() {
  return {
    truckId: document.getElementById('truckSelect').value,
    year: parseInt(document.getElementById('yearSelect').value),
    week: parseInt(document.getElementById('weekSelect').value)
  };
}

// ─── WEEKLY ENTRY ────────────────────────────────────────────────────────────
function updateTotals() {
  const gross = parseFloat(document.getElementById('weekGross').value) || 0;
  const exp = parseFloat(document.getElementById('weekExp').value) || 0;
  const net = gross - exp;
  document.getElementById('totalGross').textContent = `GHS ${gross.toLocaleString()}`;
  document.getElementById('totalExp').textContent = `GHS ${exp.toLocaleString()}`;
  document.getElementById('totalNet').textContent = `GHS ${net.toLocaleString()}`;
  document.getElementById('totalNet').style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
}

function fillEntry(entry) {
  clearEntries(true);
  if (!entry) return;
  // Sum days array into weekly totals (backward compat with old daily data)
  if (entry.days && entry.days.length) {
    const gross = entry.days.reduce((s, d) => s + (d.gross || 0), 0);
    const exp = entry.days.reduce((s, d) => s + (d.exp || 0), 0);
    document.getElementById('weekGross').value = gross || '';
    document.getElementById('weekExp').value = exp || '';
  } else {
    document.getElementById('weekGross').value = entry.gross || '';
    document.getElementById('weekExp').value = entry.exp || '';
  }
  updateTotals();
}

function clearEntries(silent) {
  document.getElementById('weekGross').value = '';
  document.getElementById('weekExp').value = '';
  document.getElementById('weekNotes').value = '';
  document.getElementById('weekRemarks').value = '';
  updateTotals();
  if (!silent) showToast('Entries cleared', '');
}

// ─── LOAD / SAVE ─────────────────────────────────────────────────────────────
async function loadWeek() {
  const { truckId, year, week } = getSelected();
  if (!truckId) return;
  try {
    const data = await API.get(`/api/weekly/${encodeURIComponent(truckId)}/${year}`);
    const entry = Array.isArray(data) ? data.find(e => e.week === week) : null;
    currentEntry = entry;
    if (entry) {
      fillEntry(entry);
      document.getElementById('weekNotes').value = entry.notes || '';
      document.getElementById('weekRemarks').value = entry.remarks || '';
    } else {
      clearEntries(true);
    }
  } catch {
    clearEntries(true);
  }
}

async function saveWeek() {
  const { truckId, year, week } = getSelected();
  if (!truckId) return showToast('Select a truck', 'error');

  const gross = parseFloat(document.getElementById('weekGross').value) || 0;
  const exp = parseFloat(document.getElementById('weekExp').value) || 0;
  const notes = document.getElementById('weekNotes').value.trim();
  const remarks = document.getElementById('weekRemarks').value.trim();

  // Store as single "week" day entry for API compatibility
  const days = [{ day: 'week', gross, exp }];

  try {
    await API.put(`/api/weekly/${encodeURIComponent(truckId)}/${year}/${week}`, { days, notes, remarks });
    showToast(`Week ${week} saved for ${truckId}`, 'success');
    loadHistory();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function nextWeek() {
  await saveWeek();
  const sel = document.getElementById('weekSelect');
  const current = parseInt(sel.value);
  if (current < 52) {
    sel.value = current + 1;
    onWeekChange();
  }
}

function onSelectChange() {
  populateTruckSelect();
  populateWeekSelect();
  loadWeek();
  loadHistory();
}

function onWeekChange() {
  loadWeek();
}

// ─── HISTORY ─────────────────────────────────────────────────────────────────
async function loadHistory() {
  const { truckId, year } = getSelected();
  if (!truckId) return;
  const table = document.getElementById('historyTable');
  try {
    const data = await API.get(`/api/weekly/${encodeURIComponent(truckId)}/${year}`);
    if (!data || !data.length) {
      table.innerHTML = '<tbody><tr><td style="text-align:center;color:var(--muted);padding:20px">No entries yet</td></tr></tbody>';
      return;
    }
    const sorted = data.sort((a, b) => a.week - b.week);
    let html = `<thead><tr><th>Week</th><th>Date Range</th><th>Gross</th><th>Expenses</th><th>Net</th><th>Notes</th><th>Remarks</th></tr></thead><tbody>`;
    sorted.forEach(e => {
      const g = (e.days || []).reduce((s, d) => s + (d.gross || 0), 0);
      const x = (e.days || []).reduce((s, d) => s + (d.exp || 0), 0);
      const n = g - x;
      const mon = getWeekMonday(year, e.week);
      const sat = new Date(mon); sat.setDate(mon.getDate() + 5);
      const range = `${fmtShortDate(mon)} \u2013 ${fmtShortDate(sat)}`;
      html += `<tr>
        <td><span class="week-link" onclick="jumpToWeek(${e.week})">W${e.week}</span></td>
        <td style="color:var(--label);font-size:0.75rem">${range}</td>
        <td style="color:var(--blue)">GHS ${g.toLocaleString()}</td>
        <td style="color:var(--red)">GHS ${x.toLocaleString()}</td>
        <td style="color:${n >= 0 ? 'var(--green)' : 'var(--red)'}">GHS ${n.toLocaleString()}</td>
        <td style="color:var(--muted);font-family:'DM Sans',sans-serif;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.notes || '\u2014'}</td>
        <td style="color:var(--muted);font-family:'DM Sans',sans-serif;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.remarks || '\u2014'}</td>
      </tr>`;
    });
    html += '</tbody>';
    table.innerHTML = html;
  } catch {
    table.innerHTML = '<tbody><tr><td style="text-align:center;color:var(--muted);padding:20px">Could not load history</td></tr></tbody>';
  }
}

function jumpToWeek(w) {
  document.getElementById('weekSelect').value = w;
  onWeekChange();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.addEventListener('DOMContentLoaded', init);
