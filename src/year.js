// ─── YEAR SPREADSHEET PAGE ───────────────────────────────────────────────────
// Reads ?year= from URL, loads data from API, renders editable spreadsheets.

const MONTH_ORDER = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
let currentYear = null;
let yearData = { trucks: {}, monthly: {}, expBreakdown: {} };
let allYears = [];
let isDirty = false;

function fmt(n) {
  if (n >= 1000000) return 'GHS ' + (n/1000000).toFixed(2) + 'M';
  if (n >= 1000) return 'GHS ' + (n/1000).toFixed(0) + 'K';
  return 'GHS ' + n.toLocaleString();
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.className = 'toast', 2600);
}

// ─── LOAD DATA ───────────────────────────────────────────────────────────────
async function loadData() {
  try {
    const data = await API.get('/api/dashboard/full');
    yearData = data;
    allYears = [...new Set([
      ...Object.keys(data.trucks || {}).flatMap(id => Object.keys(data.trucks[id]).map(Number)),
      ...Object.keys(data.monthly || {}).filter(y => y !== 'all').map(Number)
    ])].sort();
  } catch (err) {
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem('transport_dashboard_data');
      if (raw) yearData = JSON.parse(raw);
    } catch (e) { /* ignore */ }
    allYears = [...new Set([
      ...Object.keys(yearData.trucks || {}).flatMap(id => Object.keys(yearData.trucks[id]).map(Number)),
      ...Object.keys(yearData.monthly || {}).filter(y => y !== 'all').map(Number)
    ])].sort();
  }
}

// ─── RENDER YEAR NAV ─────────────────────────────────────────────────────────
function renderYearNav() {
  const nav = document.getElementById('yearNav');
  nav.innerHTML = allYears.map(y =>
    `<a href="year.html?year=${y}" class="${y === currentYear ? 'active' : ''}">${y}</a>`
  ).join('');
}

// ─── RENDER TRUCK TABLE ──────────────────────────────────────────────────────
function isTruckEOT(truckId) {
  return !!(yearData.endOfTerm && yearData.endOfTerm[truckId]);
}

function renderTruckTable() {
  const table = document.getElementById('truckTable');
  const trucks = yearData.trucks || {};
  const drivers = yearData.drivers || {};
  const weeksWorkedData = yearData.weeksWorked || {};
  const truckCostData = yearData.truckCost || {};
  const admin = isAdmin();
  let rows = [];

  for (const id in trucks) {
    const entry = trucks[id][currentYear];
    if (entry) {
      const ww = (weeksWorkedData[id] && weeksWorkedData[id][currentYear]) || 0;
      const insurance = (truckCostData[id] && truckCostData[id].insurance) || 0;
      rows.push({ id, driver: drivers[id] || '—', eot: isTruckEOT(id), weeksWorked: ww, insurance, ...entry });
    }
  }
  rows.sort((a, b) => b.net - a.net);

  const activeRows = rows.filter(r => !r.eot);
  const eotRows = rows.filter(r => r.eot);
  document.getElementById('truckCount').textContent = activeRows.length + ' active' + (eotRows.length ? ` · ${eotRows.length} end of term` : '');

  let html = `<thead><tr>
    <th>Truck ID</th><th>Driver</th><th class="num">Gross (GHS)</th>
    <th class="num">Expenditure (GHS)</th><th class="num">Net (GHS)</th>
    <th class="num">Insurance Fee (GHS)</th>
    <th class="num">Weeks Worked</th>
    ${admin ? '<th style="text-align:center">Actions</th>' : ''}
  </tr></thead><tbody>`;

  let totGross = 0, totExp = 0, totNet = 0, totWeeksWorked = 0, totInsurance = 0;
  rows.forEach(r => {
    // Only add active trucks to totals
    if (!r.eot) {
      totGross += r.gross; totExp += r.exp; totNet += r.net; totWeeksWorked += r.weeksWorked; totInsurance += r.insurance;
    }
    const netClass = r.net >= 0 ? 'positive' : 'negative';
    const eotClass = r.eot ? ' eot-row' : '';
    html += `<tr class="${eotClass}">
      <td class="label-cell">
        <a href="truck.html?id=${encodeURIComponent(r.id)}">${r.id}</a>
        ${r.eot ? '<span class="eot-badge">END OF TERM</span>' : ''}
      </td>
      <td class="label-cell" style="color:var(--label)">${r.driver}</td>
      <td><input class="truck-gross" data-truck="${r.id}" type="number" value="${r.gross}" onchange="markDirty()"${r.eot || !admin ? ' disabled' : ''}></td>
      <td><input class="truck-exp" data-truck="${r.id}" type="number" value="${r.exp}" onchange="markDirty()"${r.eot || !admin ? ' disabled' : ''}></td>
      <td class="computed ${netClass}">${fmt(r.net)}</td>
      <td class="computed neutral">${r.insurance ? fmt(r.insurance) : '—'}</td>
      <td class="computed neutral">${r.weeksWorked}</td>
      ${admin ? `<td class="actions-cell">
        <div class="truck-actions">
          <button class="act-btn edit" onclick="editTruckEntry('${r.id}')" title="Edit truck"><i class="fa-solid fa-pencil"></i></button>
          <button class="act-btn eot${r.eot ? ' active' : ''}" onclick="toggleEOT('${r.id}')" title="${r.eot ? 'Restore truck' : 'End of term'}"><i class="fa-solid fa-${r.eot ? 'rotate-left' : 'stop'}"></i></button>
          <button class="act-btn del" onclick="confirmDeleteTruck('${r.id}')" title="Delete truck"><i class="fa-solid fa-xmark"></i></button>
        </div>
      </td>` : ''}
    </tr>`;
  });

  html += `<tr class="total-row">
    <td class="label-cell">TOTAL</td><td></td>
    <td class="computed neutral">${fmt(totGross)}</td>
    <td class="computed negative">${fmt(totExp)}</td>
    <td class="computed ${totNet >= 0 ? 'positive' : 'negative'}">${fmt(totNet)}</td>
    <td class="computed neutral">${totInsurance ? fmt(totInsurance) : '—'}</td>
    <td class="computed neutral">${totWeeksWorked}</td>
    ${admin ? '<td></td>' : ''}
  </tr></tbody>`;

  table.innerHTML = html;
}

// ─── RENDER MONTHLY TABLE ────────────────────────────────────────────────────
function renderMonthlyTable() {
  const table = document.getElementById('monthlyTable');
  const m = yearData.monthly?.[currentYear] || { labels: [], gross: [], exp: [] };

  let html = `<thead><tr>
    <th>Month</th><th class="num">Gross (GHS)</th>
    <th class="num">Expenditure (GHS)</th><th class="num">Net (GHS)</th>
  </tr></thead><tbody>`;

  let totGross = 0, totExp = 0;
  m.labels.forEach((label, i) => {
    const g = m.gross[i] || 0;
    const e = m.exp[i] || 0;
    const net = g - e;
    totGross += g; totExp += e;
    html += `<tr>
      <td class="label-cell">${label}</td>
      <td><input class="month-gross" data-month="${label}" type="number" value="${g}" onchange="markDirty()"${!isAdmin() ? ' disabled' : ''}></td>
      <td><input class="month-exp" data-month="${label}" type="number" value="${e}" onchange="markDirty()"${!isAdmin() ? ' disabled' : ''}></td>
      <td class="computed ${net >= 0 ? 'positive' : 'negative'}">${fmt(net)}</td>
    </tr>`;
  });

  const totNet = totGross - totExp;
  html += `<tr class="total-row">
    <td class="label-cell">TOTAL</td>
    <td class="computed neutral">${fmt(totGross)}</td>
    <td class="computed negative">${fmt(totExp)}</td>
    <td class="computed ${totNet >= 0 ? 'positive' : 'negative'}">${fmt(totNet)}</td>
  </tr></tbody>`;

  table.innerHTML = html;
}

// ─── RENDER EXPENSE TABLE ────────────────────────────────────────────────────
function renderExpTable() {
  const table = document.getElementById('expTable');
  const e = yearData.expBreakdown?.[currentYear] || { maint: 0, other: 0 };
  const total = (e.maint || 0) + (e.other || 0);

  table.innerHTML = `<thead><tr>
    <th>Category</th><th class="num">Amount (GHS)</th><th class="num">% of Total</th>
  </tr></thead><tbody>
    <tr>
      <td class="label-cell"><i class="fa-solid fa-oil-can" style="color:var(--green);margin-right:6px"></i>Maintenance (Oil Changes)</td>
      <td><input id="expMaint" type="number" value="${e.maint || 0}" onchange="markDirty()"${!isAdmin() ? ' disabled' : ''}></td>
      <td class="computed neutral">${total ? Math.round((e.maint || 0)/total*100) : 0}%</td>
    </tr>
    <tr>
      <td class="label-cell"><i class="fa-solid fa-gear" style="color:var(--red);margin-right:6px"></i>Other Expenses (Parts)</td>
      <td><input id="expOther" type="number" value="${e.other || 0}" onchange="markDirty()"${!isAdmin() ? ' disabled' : ''}></td>
      <td class="computed neutral">${total ? Math.round((e.other || 0)/total*100) : 0}%</td>
    </tr>
    <tr class="total-row">
      <td class="label-cell">TOTAL</td>
      <td class="computed negative">${fmt(total)}</td>
      <td class="computed neutral">100%</td>
    </tr>
  </tbody>`;
}

// ─── ADD TRUCK ROW ───────────────────────────────────────────────────────────
function addTruckRow() {
  const tbody = document.querySelector('#truckTable tbody');
  if (!tbody) return;
  const totalRow = tbody.querySelector('.total-row');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="label-cell"><input type="text" value="NEW TRUCK" class="new-truck-id" style="width:100%;background:transparent;border:1px dashed var(--accent);color:var(--accent);padding:6px;border-radius:4px;font-family:'JetBrains Mono',monospace;font-size:0.8rem"></td>
    <td class="label-cell"><input type="text" value="" class="new-truck-driver" placeholder="Driver" style="width:100%;background:transparent;border:1px dashed var(--border);color:var(--label);padding:6px;border-radius:4px;font-size:0.8rem"></td>
    <td><input class="truck-gross" type="number" value="0" onchange="markDirty()"></td>
    <td><input class="truck-exp" type="number" value="0" onchange="markDirty()"></td>
    <td class="computed neutral">GHS 0</td>
    <td class="computed neutral">—</td>
    <td class="computed neutral">0</td>
  `;
  if (totalRow) tbody.insertBefore(tr, totalRow);
  else tbody.appendChild(tr);
  markDirty();
}

function markDirty() {
  isDirty = true;
  const status = document.getElementById('saveStatus');
  if (status) { status.textContent = ''; status.classList.remove('show'); }
}

// ─── SAVE ALL ────────────────────────────────────────────────────────────────
async function saveAll() {
  try {
    // Save truck year entries
    const truckRows = document.querySelectorAll('#truckTable tbody tr:not(.total-row)');
    for (const tr of truckRows) {
      const newIdInput = tr.querySelector('.new-truck-id');
      const truckId = newIdInput
        ? newIdInput.value.trim().toUpperCase()
        : tr.querySelector('.label-cell a')?.textContent?.trim();
      if (!truckId) continue;

      const gross = parseFloat(tr.querySelector('.truck-gross')?.value) || 0;
      const exp = parseFloat(tr.querySelector('.truck-exp')?.value) || 0;
      const weeks = 0;

      // If new truck, create it first
      if (newIdInput) {
        const driver = tr.querySelector('.new-truck-driver')?.value?.trim() || '';
        try {
          await API.post('/api/trucks', { truckId, driver });
        } catch (e) {
          // Truck might already exist, that's fine
        }
      }

      await API.post(`/api/trucks/${encodeURIComponent(truckId)}/years`, {
        year: currentYear, gross, exp, weeks
      });
    }

    // Save monthly entries
    const monthRows = document.querySelectorAll('#monthlyTable tbody tr:not(.total-row)');
    const monthEntries = [];
    monthRows.forEach(tr => {
      const month = tr.querySelector('.label-cell')?.textContent?.trim();
      const gross = parseFloat(tr.querySelector('.month-gross')?.value) || 0;
      const exp = parseFloat(tr.querySelector('.month-exp')?.value) || 0;
      if (month) monthEntries.push({ month, gross, exp });
    });
    await API.put(`/api/monthly/bulk/${currentYear}`, { entries: monthEntries });

    // Save expense breakdown
    const maint = parseFloat(document.getElementById('expMaint')?.value) || 0;
    const other = parseFloat(document.getElementById('expOther')?.value) || 0;
    await API.put(`/api/expenses/${currentYear}`, { maint, other });

    isDirty = false;
    const now = new Date();
    localStorage.setItem(`year_lastSaved_${currentYear}`, now.toISOString());
    updateLastSaved(now);
    const status = document.getElementById('saveStatus');
    if (status) { status.innerHTML = '<i class="fa-solid fa-check"></i>All changes saved'; status.classList.add('show'); }
    showToast('All changes saved successfully', 'success');

    // Reload to refresh computed values
    await loadData();
    renderAll();
  } catch (err) {
    showToast('Error saving: ' + err.message, 'error');
  }
}

async function resetYear() {
  if (isDirty && !confirm('Discard unsaved changes?')) return;
  await loadData();
  renderAll();
  isDirty = false;
  showToast('Reset to saved data', 'success');
}

// ─── RENDER ALL ──────────────────────────────────────────────────────────────
function renderAll() {
  document.getElementById('pageTitle').textContent = currentYear + ' Data';
  document.getElementById('pageSubtitle').textContent = `Spreadsheet Editor · Year ${currentYear}`;
  renderYearNav();
  renderTruckTable();
  renderMonthlyTable();
  renderExpTable();
  loadLastSaved();
}

function updateLastSaved(date) {
  const el = document.getElementById('lastSaved');
  if (!el || !date) { if (el) el.innerHTML = ''; return; }
  const d = new Date(date);
  const day = d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
  el.innerHTML = `<i class="fa-regular fa-clock" style="color:var(--accent)"></i>Last saved: ${day} at ${time}`;
}

function loadLastSaved() {
  const raw = localStorage.getItem(`year_lastSaved_${currentYear}`);
  updateLastSaved(raw ? new Date(raw) : null);
}

// ─── TRUCK ACTIONS ───────────────────────────────────────────────────────────

function editTruckEntry(truckId) {
  const row = document.querySelector(`input.truck-gross[data-truck="${truckId}"]`)?.closest('tr');
  if (!row) return;
  const inputs = row.querySelectorAll('input[type="number"]');
  const isDisabled = inputs[0]?.disabled;
  if (isDisabled) {
    // Enable editing temporarily even for EOT trucks
    inputs.forEach(inp => { inp.disabled = false; inp.focus(); });
    inputs[0].focus();
    inputs[0].select();
    showToast(`Editing ${truckId} — save when done`);
  } else {
    inputs[0].focus();
    inputs[0].select();
  }
}

async function toggleEOT(truckId) {
  const wasEOT = isTruckEOT(truckId);
  const action = wasEOT ? 'restore' : 'mark as end of term';
  openConfirm(
    wasEOT ? 'Restore Truck' : 'End of Term',
    `Are you sure you want to ${action} <strong>${truckId}</strong>?${!wasEOT ? '<br><small style="color:var(--muted)">Its existing data will be preserved but inputs will be locked.</small>' : ''}`,
    wasEOT ? 'accent' : 'danger',
    wasEOT ? 'Restore' : 'End of Term',
    async () => {
      try {
        await API.put(`/api/trucks/${encodeURIComponent(truckId)}`, {
          endOfTerm: { active: !wasEOT, date: wasEOT ? '' : new Date().toISOString().split('T')[0] }
        });
        showToast(wasEOT ? `${truckId} restored to service` : `${truckId} marked end of term`, wasEOT ? 'success' : '');
        await loadData();
        renderAll();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    }
  );
}

function confirmDeleteTruck(truckId) {
  openConfirm(
    'Delete Truck',
    `Delete <strong>${truckId}</strong> and all its year data?<br><small style="color:var(--muted)">Data will be moved to the Recovery Bin.</small>`,
    'danger',
    'Delete',
    async () => {
      try {
        await API.del(`/api/trucks/${encodeURIComponent(truckId)}`);
        showToast(`${truckId} deleted`, 'success');
        await loadData();
        renderAll();
      } catch (err) {
        showToast('Error: ' + err.message, 'error');
      }
    }
  );
}

// ─── CONFIRM MODAL ───────────────────────────────────────────────────────────
let _confirmCb = null;

function openConfirm(title, msg, btnClass, btnLabel, cb) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMsg').innerHTML = msg;
  const actionBtn = document.getElementById('confirmAction');
  actionBtn.className = 'cbtn ' + btnClass;
  actionBtn.textContent = btnLabel;
  _confirmCb = cb;
  actionBtn.onclick = async () => { closeConfirm(); if (_confirmCb) await _confirmCb(); _confirmCb = null; };
  document.getElementById('confirmOverlay').classList.add('show');
}

function closeConfirm() {
  document.getElementById('confirmOverlay').classList.remove('show');
  _confirmCb = null;
}

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const params = new URLSearchParams(window.location.search);
  currentYear = parseInt(params.get('year')) || new Date().getFullYear();

  await loadData();
  renderAll();

  // Update admin UI — re-render after auth check so inputs respect admin state
  await refreshAdminStatus();
  renderAll();
});

// Auto-refresh when tab gains focus
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    await loadData();
    renderAll();
  }
});
