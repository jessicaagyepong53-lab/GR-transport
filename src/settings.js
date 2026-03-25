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

// ─── DRIVER TABLE ────────────────────────────────────────────────────────────
function renderDriverTable() {
  const table = document.getElementById('driverTable');
  let html = `<thead><tr><th>Truck ID</th><th>Driver Name</th></tr></thead><tbody>`;
  trucksData.forEach(t => {
    html += `<tr>
      <td style="color:var(--accent);font-weight:600;font-family:'JetBrains Mono',monospace">${t.truckId}</td>
      <td><input type="text" value="${t.driver || ''}" data-truck="${t.truckId}" class="driver-input"></td>
    </tr>`;
  });
  html += '</tbody>';
  table.innerHTML = html;
}

async function saveDrivers() {
  const inputs = document.querySelectorAll('.driver-input');
  try {
    for (const input of inputs) {
      const truckId = input.dataset.truck;
      const driver = input.value.trim();
      await API.put(`/api/drivers/${encodeURIComponent(truckId)}`, { driver });
    }
    showToast('Driver assignments saved', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ─── COST TABLE ──────────────────────────────────────────────────────────────
function renderCostTable() {
  const table = document.getElementById('costTable');
  let html = `<thead><tr><th>Truck ID</th><th>Initial Value (GHS)</th><th>Amount Paid (GHS)</th><th>Repairs &amp; Maintenance (GHS)</th><th>Total</th></tr></thead><tbody>`;
  trucksData.forEach(t => {
    const c = t.cost || {};
    const total = (c.initialValue || 0) + (c.pricePaid || 0) + (c.maintenanceCost || 0);
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
}

function updateRowTotal(input) {
  const row = input.closest('tr');
  const init = parseFloat(row.querySelector('.cost-init').value) || 0;
  const paid = parseFloat(row.querySelector('.cost-paid').value) || 0;
  const maint = parseFloat(row.querySelector('.cost-maint').value) || 0;
  row.querySelector('.row-total').textContent = 'GHS ' + (init + paid + maint).toLocaleString();
}

function updateNewTruckTotal() {
  const init = parseFloat(document.getElementById('newTruckInit').value) || 0;
  const paid = parseFloat(document.getElementById('newTruckPaid').value) || 0;
  const maint = parseFloat(document.getElementById('newTruckMaint').value) || 0;
  document.getElementById('newTruckTotal').textContent = 'GHS ' + (init + paid + maint).toLocaleString();
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

// ─── PIN CHANGE ──────────────────────────────────────────────────────────────
async function changePin() {
  const currentPin = document.getElementById('currentPin').value.trim();
  const newPin = document.getElementById('newPin').value.trim();
  if (!currentPin || !newPin) return showToast('Fill both PIN fields', 'error');
  if (newPin.length < 4) return showToast('PIN must be at least 4 characters', 'error');

  try {
    await API.put('/api/settings/pin', { currentPin, newPin });
    showToast('PIN changed successfully', 'success');
    document.getElementById('currentPin').value = '';
    document.getElementById('newPin').value = '';
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

document.addEventListener('DOMContentLoaded', loadSettings);
