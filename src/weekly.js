// ─── WEEKLY ENTRY PAGE ───────────────────────────────────────────────────────

let allTrucks = [];
let truckYearMap = {};
let currentEntry = null;
let yearlyTotals = { gross: 0, maint: 0, other: 0 };
let currentWeekOriginal = { gross: 0, maint: 0, other: 0 };
let totalsMode = 'year'; // 'year' or 'week'

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.className = 'toast', 2600);
}

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
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
  await loadHistory();
  await loadWeek();
}

function populateTruckSelect() {
  const sel = document.getElementById('truckSelect');
  const selectedYear = document.getElementById('yearSelect')?.value;
  const prevTruck = sel.value;
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

function fmtDateRange(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(d.getDate()).padStart(2, '0');
  return `${dd} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getMonthName(d) {
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return months[d.getMonth()];
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

// ─── TOTALS ──────────────────────────────────────────────────────────────────
function updateTotals() {
  if (totalsMode === 'week') {
    // Show current form values (the selected week)
    const gross = parseFloat(document.getElementById('weekGross').value) || 0;
    const maint = parseFloat(document.getElementById('weekMaint').value) || 0;
    const other = parseFloat(document.getElementById('weekOther').value) || 0;
    const totalExp = maint + other;
    const net = gross - totalExp;
    document.getElementById('totalGross').textContent = `GHS ${gross.toLocaleString()}`;
    document.getElementById('totalMaint').textContent = `GHS ${maint.toLocaleString()}`;
    document.getElementById('totalOther').textContent = `GHS ${other.toLocaleString()}`;
    document.getElementById('totalExp').textContent = `GHS ${totalExp.toLocaleString()}`;
    document.getElementById('totalNet').textContent = `GHS ${net.toLocaleString()}`;
    document.getElementById('totalNet').style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
  } else {
    // Year totals: all weeks summed, with form values replacing the original for current week
    const formGross = parseFloat(document.getElementById('weekGross').value) || 0;
    const formMaint = parseFloat(document.getElementById('weekMaint').value) || 0;
    const formOther = parseFloat(document.getElementById('weekOther').value) || 0;
    const gross = (yearlyTotals.gross - currentWeekOriginal.gross) + formGross;
    const maint = (yearlyTotals.maint - currentWeekOriginal.maint) + formMaint;
    const other = (yearlyTotals.other - currentWeekOriginal.other) + formOther;
    const totalExp = maint + other;
    const net = gross - totalExp;
    document.getElementById('totalGross').textContent = `GHS ${gross.toLocaleString()}`;
    document.getElementById('totalMaint').textContent = `GHS ${maint.toLocaleString()}`;
    document.getElementById('totalOther').textContent = `GHS ${other.toLocaleString()}`;
    document.getElementById('totalExp').textContent = `GHS ${totalExp.toLocaleString()}`;
    document.getElementById('totalNet').textContent = `GHS ${net.toLocaleString()}`;
    document.getElementById('totalNet').style.color = net >= 0 ? 'var(--green)' : 'var(--red)';
  }
}

function setTotalsMode(mode, weekNum) {
  totalsMode = mode;
  const label = document.getElementById('totalsLabel');
  const toggle = document.getElementById('totalsToggle');
  if (mode === 'week') {
    label.innerHTML = `<i class="fa-solid fa-calendar-week"></i>Week ${weekNum || ''} Total`;
    toggle.style.display = 'inline-flex';
  } else {
    label.innerHTML = '<i class="fa-solid fa-chart-pie"></i>Year Total';
    toggle.style.display = 'none';
  }
  updateTotals();
}

function showYearTotals() {
  setTotalsMode('year');
}

function fillEntry(entry) {
  clearEntries(true);
  if (!entry) return;
  currentWeekOriginal = { gross: entry.gross || 0, maint: entry.maint || 0, other: entry.other || 0 };
  document.getElementById('weekDays').value = entry.daysWorked != null ? entry.daysWorked : '';
  document.getElementById('weekGross').value = entry.gross || '';
  document.getElementById('weekMaint').value = entry.maint || '';
  document.getElementById('weekOther').value = entry.other || '';
  document.getElementById('weekNotes').value = entry.notes || '';
  document.getElementById('weekRemarks').value = entry.remarks || '';
  updateTotals();
}

function clearEntries(silent) {
  document.getElementById('weekDays').value = '';
  document.getElementById('weekGross').value = '';
  document.getElementById('weekMaint').value = '';
  document.getElementById('weekOther').value = '';
  document.getElementById('weekNotes').value = '';
  document.getElementById('weekRemarks').value = '';
  currentWeekOriginal = { gross: 0, maint: 0, other: 0 };
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

  const daysVal = document.getElementById('weekDays').value;
  const daysWorked = daysVal !== '' ? parseInt(daysVal) : null;
  const gross = parseFloat(document.getElementById('weekGross').value) || 0;
  const maint = parseFloat(document.getElementById('weekMaint').value) || 0;
  const other = parseFloat(document.getElementById('weekOther').value) || 0;
  const notes = document.getElementById('weekNotes').value.trim();
  const remarks = document.getElementById('weekRemarks').value.trim();

  try {
    await API.put(`/api/weekly/${encodeURIComponent(truckId)}/${year}/${week}`, {
      daysWorked, gross, maint, other, notes, remarks
    });
    // Update currentWeekOriginal to match what was just saved
    currentWeekOriginal = { gross, maint, other };
    showToast(`Week ${week} saved for ${truckId}`, 'success');
    updateWeekTimestamp();
    await loadHistory();
    await loadWeek();
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
    await loadWeek();
    await loadHistory();
  }
}

async function onSelectChange() {
  populateTruckSelect();
  populateWeekSelect();
  setTotalsMode('year');
  await loadHistory();
  await loadWeek();
}

async function onWeekChange() {
  await loadWeek();
}

// ─── HISTORY TABLE ───────────────────────────────────────────────────────────
function fmtGHS(v) {
  const n = Number(v || 0);
  if (n === 0) return 'GH\u20B5 0.00';
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-GH\u20B5 ${formatted}` : `GH\u20B5 ${formatted}`;
}

async function loadHistory() {
  const { truckId, year, week: currentWeek } = getSelected();
  if (!truckId) return;
  const tbody = document.getElementById('historyBody');
  const tfoot = document.getElementById('historyFoot');

  try {
    const [data, trucks] = await Promise.all([
      API.get(`/api/weekly/${encodeURIComponent(truckId)}/${year}`),
      API.get('/api/trucks')
    ]);

    const truck = trucks.find(t => t.truckId === truckId);
    const truckCost = truck && truck.cost ? truck.cost.initialValue || 0 : 0;

    if (!data || !data.length) {
      tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:var(--muted);padding:24px;">No entries yet for this truck & year.</td></tr>';
      tfoot.innerHTML = '';
      yearlyTotals = { gross: 0, maint: 0, other: 0 };
      updateTotals();
      return;
    }

    const sorted = data.sort((a, b) => a.week - b.week);
    let breakEven = -truckCost;
    let lastMonth = '';
    let monthWeekCounter = 0;
    let totGross = 0, totMaint = 0, totOther = 0, totExp = 0, totNet = 0;
    let totalWeeks = 0, totDays = 0;

    // Compute yearly totals for the totals bar
    yearlyTotals = { gross: 0, maint: 0, other: 0 };
    sorted.forEach(e => {
      yearlyTotals.gross += e.gross || 0;
      yearlyTotals.maint += e.maint || 0;
      yearlyTotals.other += e.other || 0;
    });
    updateTotals();

    let html = '';
    sorted.forEach(e => {
      const g = e.gross || 0;
      const m = e.maint || 0;
      const o = e.other || 0;
      const exp = m + o;
      const net = g - exp;
      breakEven += net;

      totGross += g;
      totMaint += m;
      totOther += o;
      totExp += exp;
      totNet += net;
      totalWeeks++;
      if (e.daysWorked != null) totDays++;

      const mon = getWeekMonday(year, e.week);
      const sat = new Date(mon);
      sat.setDate(mon.getDate() + 5);
      const monthName = getMonthName(mon);
      const showMonth = monthName !== lastMonth;
      if (showMonth) monthWeekCounter = 1; else monthWeekCounter++;
      lastMonth = monthName;

      const range = `${fmtDateRange(mon)} - ${fmtDateRange(sat)}`;
      const dw = e.daysWorked != null ? e.daysWorked : 'N/A';
      const isActive = e.week === currentWeek;

      html += `<tr class="${isActive ? 'active-row' : ''}">
        <td class="month-cell">${showMonth ? monthName : ''}</td>
        <td><span class="week-link" onclick="jumpToWeek(${e.week})">Week ${monthWeekCounter}</span></td>
        <td style="color:var(--label);font-size:0.72rem;">${range}</td>
        <td>${dw}</td>
        <td class="col-gross">${fmtGHS(g)}</td>
        <td class="col-maint">${fmtGHS(m)}</td>
        <td class="col-other">${fmtGHS(o)}</td>
        <td class="col-exp">${fmtGHS(exp)}</td>
        <td class="col-net" style="color:${net >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtGHS(net)}</td>
        <td class="col-be" style="color:${breakEven >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtGHS(breakEven)}</td>
        <td class="notes-cell">${e.notes || '\u2014'}</td>
        <td class="notes-cell">${e.remarks || '\u2014'}</td>
        <td><button class="edit-btn" data-admin-only onclick="editWeekEntry(${e.week})"><i class="fa-solid fa-pen-to-square"></i></button><button class="delete-btn" data-admin-only onclick="deleteWeekEntry(${e.week})"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`;
    });
    tbody.innerHTML = html;

    tfoot.innerHTML = `<tr>
      <td colspan="3" style="text-align:right;color:var(--accent);">TOTAL:</td>
      <td>${totDays}</td>
      <td class="col-gross">${fmtGHS(totGross)}</td>
      <td class="col-maint">${fmtGHS(totMaint)}</td>
      <td class="col-other">${fmtGHS(totOther)}</td>
      <td class="col-exp">${fmtGHS(totExp)}</td>
      <td class="col-net" style="color:${totNet >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtGHS(totNet)}</td>
      <td class="col-be" style="color:${breakEven >= 0 ? 'var(--green)' : 'var(--red)'}">${fmtGHS(breakEven)}</td>
      <td colspan="3"></td>
    </tr>`;
  } catch {
    tbody.innerHTML = '<tr><td colspan="13" style="text-align:center;color:var(--muted);padding:24px;">Could not load history</td></tr>';
    tfoot.innerHTML = '';
  }
}

function jumpToWeek(w) {
  document.getElementById('weekSelect').value = w;
  setTotalsMode('week', w);
  onWeekChange();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function editWeekEntry(w) {
  document.getElementById('weekSelect').value = w;
  setTotalsMode('week', w);
  await loadWeek();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  showToast(`Editing Week ${w} — make changes and Save`, '');
}

async function deleteWeekEntry(w) {
  const { truckId, year } = getSelected();
  if (!truckId) return;
  const mon = getWeekMonday(year, w);
  const sat = new Date(mon);
  sat.setDate(mon.getDate() + 5);
  const range = `${fmtDateRange(mon)} - ${fmtDateRange(sat)}`;
  if (!confirm(`Delete entry for Week ${w} (${range})?\nThis cannot be undone.`)) return;
  try {
    await API.del(`/api/weekly/${encodeURIComponent(truckId)}/${year}/${w}`);
    showToast(`Week ${w} deleted`, 'success');
    // If we just deleted the currently loaded week, clear the form
    const currentWeek = parseInt(document.getElementById('weekSelect').value);
    if (currentWeek === w) {
      currentEntry = null;
      clearEntries(true);
    }
    await loadHistory();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function addNewEntry() {
  const { truckId, year } = getSelected();
  if (!truckId) return showToast('Select a truck first', 'error');
  try {
    const data = await API.get(`/api/weekly/${encodeURIComponent(truckId)}/${year}`);
    const usedWeeks = new Set((data || []).map(e => e.week));
    let nextFree = null;
    for (let w = 1; w <= 52; w++) {
      if (!usedWeeks.has(w)) { nextFree = w; break; }
    }
    if (!nextFree) return showToast('All 52 weeks have entries', 'error');
    document.getElementById('weekSelect').value = nextFree;
    clearEntries(true);
    currentEntry = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Adding Week ${nextFree} — fill in data and Save`, '');
  } catch {
    showToast('Error finding next week', 'error');
  }
}

function updateWeekTimestamp() {
  const el = document.getElementById('weekLastSaved');
  if (!el) return;
  const now = new Date();
  const day = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const time = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  el.innerHTML = `<i class="fa-regular fa-clock" style="color:#f5a623"></i>Saved: ${day} at ${time}`;
}

document.addEventListener('DOMContentLoaded', init);

// Auto-refresh when tab gains focus (another computer may have edited data)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    loadHistory();
    loadWeek();
  }
});
