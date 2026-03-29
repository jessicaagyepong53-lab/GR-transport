// ─── SETTINGS PAGE ───────────────────────────────────────────────────────────

let trucksData = [];

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.className = 'toast', 2600);
}

async function loadSettings() {
  try {
    trucksData = await API.get('/api/trucks');
    renderDriverTable();
    renderCostTable();
  } catch (err) {
    showToast('Error loading data: ' + err.message, 'error');
  }
}

// ─── LOCALSTORAGE SYNC ───────────────────────────────────────────────────────
function getLocalData() {
  try { return JSON.parse(localStorage.getItem('transport_dashboard_data')) || {}; } catch(e) { return {}; }
}
function setLocalData(data) {
  localStorage.setItem('transport_dashboard_data', JSON.stringify(data));
}

// ─── DRIVER TABLE ────────────────────────────────────────────────────────────
let _driverSaveTimer = null;
function autoSaveDriverRow(truckId) {
  clearTimeout(_driverSaveTimer);
  _driverSaveTimer = setTimeout(async () => {
    const driverInput = document.querySelector(`.driver-input[data-truck="${truckId}"]`);
    const notesInput = document.querySelector(`.driver-notes-input[data-truck="${truckId}"]`);
    if (!driverInput) return;
    const driver = driverInput.value.trim();
    const driverNotes = notesInput ? notesInput.value.trim() : '';
    // Collect per-year start dates
    const startDates = {};
    document.querySelectorAll(`.start-date-input[data-truck="${truckId}"]`).forEach(d => {
      if (d.value) startDates[d.dataset.year] = d.value;
    });
    // Collect end of term
    const eotCheck = document.querySelector(`.eot-active[data-truck="${truckId}"]`);
    const eotDate = document.querySelector(`.eot-date[data-truck="${truckId}"]`);
    const endOfTerm = {
      active: eotCheck ? eotCheck.checked : false,
      date: eotDate ? eotDate.value : ''
    };
    try {
      await API.put(`/api/drivers/${encodeURIComponent(truckId)}`, { driver, driverNotes, startDates, endOfTerm });
      // Sync to localStorage
      const DATA = getLocalData();
      if (DATA.drivers) DATA.drivers[truckId] = driver;
      if (DATA.endOfTerm) DATA.endOfTerm[truckId] = endOfTerm;
      setLocalData(DATA);
      showToast('Saved', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }, 800);
}

// ─── RENAME TRUCK ────────────────────────────────────────────────────────────
async function renameTruck(input) {
  const oldId = input.dataset.truck;
  const newId = input.value.trim().toUpperCase();
  if (!newId || newId === oldId) { input.value = oldId; return; }
  // Check for duplicate in current data
  if (trucksData.some(t => t.truckId === newId)) {
    showToast('A truck with that name already exists', 'error');
    input.value = oldId;
    return;
  }
  try {
    await API.put(`/api/trucks/${encodeURIComponent(oldId)}`, { newTruckId: newId });
    showToast(`Renamed ${oldId} → ${newId}`, 'success');
    // Update localStorage — move ALL keys from old to new
    const DATA = getLocalData();
    if (DATA.trucks?.[oldId]) { DATA.trucks[newId] = DATA.trucks[oldId]; delete DATA.trucks[oldId]; }
    if (DATA.drivers?.[oldId]) { DATA.drivers[newId] = DATA.drivers[oldId]; delete DATA.drivers[oldId]; }
    if (DATA.truckCost?.[oldId]) { DATA.truckCost[newId] = DATA.truckCost[oldId]; delete DATA.truckCost[oldId]; }
    if (DATA.endOfTerm?.[oldId]) { DATA.endOfTerm[newId] = DATA.endOfTerm[oldId]; delete DATA.endOfTerm[oldId]; }
    if (DATA.monthly?.[oldId]) { DATA.monthly[newId] = DATA.monthly[oldId]; delete DATA.monthly[oldId]; }
    if (DATA.weekly?.[oldId]) { DATA.weekly[newId] = DATA.weekly[oldId]; delete DATA.weekly[oldId]; }
    if (DATA.entryMeta?.[oldId]) { DATA.entryMeta[newId] = DATA.entryMeta[oldId]; delete DATA.entryMeta[oldId]; }
    setLocalData(DATA);
    // Update truck_recovery if any entries reference the old name
    try {
      const recRaw = localStorage.getItem('truck_recovery');
      if (recRaw) {
        const recovery = JSON.parse(recRaw);
        let changed = false;
        recovery.forEach(r => {
          if (r.data?.truckId === oldId) { r.data.truckId = newId; changed = true; }
        });
        if (changed) localStorage.setItem('truck_recovery', JSON.stringify(recovery));
      }
    } catch(e) {}
    await loadSettings();
  } catch (err) {
    showToast('Rename failed: ' + err.message, 'error');
    input.value = oldId;
  }
}

function renderDriverTable() {
  const table = document.getElementById('driverTable');
  // Collect all years across all trucks
  const allYears = new Set();
  trucksData.forEach(t => { Object.keys(t.years || {}).forEach(y => allYears.add(y)); });
  const years = [...allYears].sort();

  let html = `<thead><tr><th>Truck ID</th><th>Driver</th>`;
  years.forEach(y => { html += `<th>Started ${y}</th>`; });
  html += `<th>Notes</th><th>End of Term</th></tr></thead><tbody>`;

  trucksData.forEach(t => {
    const sd = t.startDates || {};
    const eot = t.endOfTerm || { active: false, date: '' };
    html += `<tr>
      <td><input type="text" value="${t.truckId}" data-truck="${t.truckId}" class="truck-name-input" style="color:var(--accent);font-weight:600;font-family:'JetBrains Mono',monospace;text-transform:uppercase"></td>
      <td><input type="text" value="${t.driver || ''}" data-truck="${t.truckId}" class="driver-input"></td>`;
    years.forEach(y => {
      const hasYear = t.years && t.years[y];
      html += `<td><input type="date" value="${sd[y] || ''}" data-truck="${t.truckId}" data-year="${y}" class="start-date-input"${!hasYear ? ' disabled style="opacity:0.3"' : ''}></td>`;
    });
    html += `<td><input type="text" value="${t.driverNotes || ''}" data-truck="${t.truckId}" class="driver-notes-input" placeholder="e.g. Driver changed Sep 2025"></td>
      <td style="white-space:nowrap;">
        <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:0.78rem;color:${eot.active ? 'var(--red)' : 'var(--muted)'};">
          <input type="checkbox" ${eot.active ? 'checked' : ''} data-truck="${t.truckId}" class="eot-active" style="accent-color:var(--red);width:15px;height:15px;cursor:pointer;">
          <span class="eot-label">${eot.active ? 'Yes' : 'No'}</span>
        </label>
        <input type="date" value="${eot.date || ''}" data-truck="${t.truckId}" class="eot-date" style="margin-top:4px;display:block;${!eot.active ? 'opacity:0.3;pointer-events:none;' : ''}">
      </td>
    </tr>`;
  });
  html += '</tbody>';
  table.innerHTML = html;

  // Auto-save on change
  table.querySelectorAll('.driver-input, .driver-notes-input, .start-date-input, .eot-date').forEach(input => {
    input.addEventListener('input', () => autoSaveDriverRow(input.dataset.truck));
    input.addEventListener('change', () => autoSaveDriverRow(input.dataset.truck));
  });
  // Truck name rename on blur or Enter
  table.querySelectorAll('.truck-name-input').forEach(input => {
    input.addEventListener('blur', () => renameTruck(input));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  });
  // Checkbox listeners for end-of-term
  table.querySelectorAll('.eot-active').forEach(cb => {
    cb.addEventListener('change', () => {
      const row = cb.closest('tr');
      const dateInput = row.querySelector('.eot-date');
      const label = row.querySelector('.eot-label');
      if (cb.checked) {
        dateInput.style.opacity = '1';
        dateInput.style.pointerEvents = 'auto';
        label.textContent = 'Yes';
        cb.closest('label').style.color = 'var(--red)';
      } else {
        dateInput.style.opacity = '0.3';
        dateInput.style.pointerEvents = 'none';
        label.textContent = 'No';
        cb.closest('label').style.color = 'var(--muted)';
      }
      autoSaveDriverRow(cb.dataset.truck);
    });
  });
}

async function saveDrivers() {
  const inputs = document.querySelectorAll('.driver-input');
  try {
    for (const input of inputs) {
      const truckId = input.dataset.truck;
      const driver = input.value.trim();
      const notesInput = document.querySelector(`.driver-notes-input[data-truck="${truckId}"]`);
      const driverNotes = notesInput ? notesInput.value.trim() : '';
      const startDates = {};
      document.querySelectorAll(`.start-date-input[data-truck="${truckId}"]`).forEach(d => {
        if (d.value) startDates[d.dataset.year] = d.value;
      });
      const eotCheck = document.querySelector(`.eot-active[data-truck="${truckId}"]`);
      const eotDate = document.querySelector(`.eot-date[data-truck="${truckId}"]`);
      const endOfTerm = {
        active: eotCheck ? eotCheck.checked : false,
        date: eotDate ? eotDate.value : ''
      };
      await API.put(`/api/drivers/${encodeURIComponent(truckId)}`, { driver, driverNotes, startDates, endOfTerm });
    }
    showToast('Driver assignments saved', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ─── COST TABLE ──────────────────────────────────────────────────────────────
let _costSaveTimer = null;
function autoSaveCostRow(truckId) {
  clearTimeout(_costSaveTimer);
  _costSaveTimer = setTimeout(async () => {
    const row = document.querySelector(`.cost-init[data-truck="${truckId}"]`)?.closest('tr');
    if (!row) return;
    const initialValue = parseFloat(row.querySelector('.cost-init').value) || 0;
    const pricePaid = parseFloat(row.querySelector('.cost-paid').value) || 0;
    const maintenanceCost = parseFloat(row.querySelector('.cost-maint').value) || 0;
    try {
      await API.put(`/api/trucks/${encodeURIComponent(truckId)}`, { cost: { initialValue, pricePaid, maintenanceCost } });
      // Sync to localStorage
      const DATA = getLocalData();
      if (!DATA.truckCost) DATA.truckCost = {};
      DATA.truckCost[truckId] = { initialValue, pricePaid, maintenanceCost };
      setLocalData(DATA);
      showToast('Saved', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }, 800);
}

function renderCostTable() {
  const table = document.getElementById('costTable');
  let html = `<thead><tr><th>Truck ID</th><th>Initial Value (GHS) <span style="font-size:0.65rem;color:var(--muted);font-weight:400">ref</span></th><th>Amount Paid (GHS)</th><th>Repairs &amp; Maintenance (GHS)</th><th>Total</th></tr></thead><tbody>`;
  trucksData.forEach(t => {
    const c = t.cost || {};
    const total = (c.pricePaid || 0) + (c.maintenanceCost || 0);
    html += `<tr data-truck="${t.truckId}">
      <td style="color:var(--accent);font-weight:600;font-family:'JetBrains Mono',monospace">${t.truckId}</td>
      <td><input type="number" value="${c.initialValue || 0}" data-truck="${t.truckId}" class="cost-init" oninput="updateRowTotal(this)"></td>
      <td><input type="number" value="${c.pricePaid || 0}" data-truck="${t.truckId}" class="cost-paid" oninput="updateRowTotal(this)"></td>
      <td><input type="number" value="${c.maintenanceCost || 0}" data-truck="${t.truckId}" class="cost-maint" oninput="updateRowTotal(this)"></td>
      <td class="row-total" style="color:var(--blue);font-weight:600;font-family:'JetBrains Mono',monospace;white-space:nowrap;">GHS ${total.toLocaleString()}</td>
    </tr>`;
  });
  html += '</tbody>';
  table.innerHTML = html;

  // Auto-save on change
  table.querySelectorAll('.cost-init, .cost-paid, .cost-maint').forEach(input => {
    input.addEventListener('input', () => { updateRowTotal(input); autoSaveCostRow(input.dataset.truck); });
  });
}

function updateRowTotal(input) {
  const row = input.closest('tr');
  const paid = parseFloat(row.querySelector('.cost-paid').value) || 0;
  const maint = parseFloat(row.querySelector('.cost-maint').value) || 0;
  row.querySelector('.row-total').textContent = 'GHS ' + (paid + maint).toLocaleString();
}

function updateNewTruckTotal() {
  const paid = parseFloat(document.getElementById('newTruckPaid').value) || 0;
  const maint = parseFloat(document.getElementById('newTruckMaint').value) || 0;
  document.getElementById('newTruckTotal').textContent = 'GHS ' + (paid + maint).toLocaleString();
}

async function saveCosts() {
  const rows = document.querySelectorAll('#costTable tbody tr');
  try {
    for (const row of rows) {
      const truckId = row.querySelector('.cost-init')?.dataset.truck;
      if (!truckId) continue;
      const initialValue = parseFloat(row.querySelector('.cost-init').value) || 0;
      const pricePaid = parseFloat(row.querySelector('.cost-paid').value) || 0;
      const maintenanceCost = parseFloat(row.querySelector('.cost-maint').value) || 0;
      await API.put(`/api/trucks/${encodeURIComponent(truckId)}`, {
        cost: { initialValue, pricePaid, maintenanceCost }
      });
    }
    showToast('Truck costs saved', 'success');
    await loadSettings(); // refresh totals
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ─── ADD NEW TRUCK ───────────────────────────────────────────────────────────
async function addNewTruck() {
  const truckId = document.getElementById('newTruckId').value.trim();
  const driver = document.getElementById('newTruckDriver').value.trim();
  const initialValue = parseFloat(document.getElementById('newTruckInit').value) || 0;
  const pricePaid = parseFloat(document.getElementById('newTruckPaid').value) || 0;
  const maintenanceCost = parseFloat(document.getElementById('newTruckMaint').value) || 0;

  if (!truckId) return showToast('Enter a Truck ID', 'error');

  try {
    await API.post('/api/trucks', {
      truckId,
      driver,
      cost: { initialValue, pricePaid, maintenanceCost }
    });
    showToast(`Truck ${truckId} added successfully`, 'success');
    document.getElementById('newTruckId').value = '';
    document.getElementById('newTruckDriver').value = '';
    document.getElementById('newTruckInit').value = '0';
    document.getElementById('newTruckPaid').value = '0';
    document.getElementById('newTruckMaint').value = '0';
    updateNewTruckTotal();
    await loadSettings();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ─── PIN RESET ───────────────────────────────────────────────────────────────
async function resetPin() {
  const recoveryKey = document.getElementById('recoveryKey').value.trim();
  const newPin = document.getElementById('resetNewPin').value.trim();
  if (!recoveryKey || !newPin) return showToast('Fill recovery key and new PIN', 'error');
  if (newPin.length < 4) return showToast('PIN must be at least 4 characters', 'error');

  try {
    await API.post('/api/settings/pin/reset', { recoveryKey, newPin });
    showToast('PIN has been reset — you are now logged in', 'success');
    document.getElementById('recoveryKey').value = '';
    document.getElementById('resetNewPin').value = '';
    window._isAdminCached = true;
    updateAdminUI();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', loadSettings);
