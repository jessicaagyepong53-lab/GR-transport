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
  let html = `<thead><tr><th>Truck ID</th><th>Initial Value (GHS)</th><th>Price Paid (GHS)</th><th>Maintenance Cost (GHS)</th><th>Total</th></tr></thead><tbody>`;
  trucksData.forEach(t => {
    const c = t.cost || {};
    const total = (c.initialValue || 0) + (c.pricePaid || 0) + (c.maintenanceCost || 0);
    html += `<tr>
      <td style="color:var(--accent);font-weight:600;font-family:'JetBrains Mono',monospace">${t.truckId}</td>
      <td><input type="number" value="${c.initialValue || 0}" data-truck="${t.truckId}" class="cost-init"></td>
      <td><input type="number" value="${c.pricePaid || 0}" data-truck="${t.truckId}" class="cost-paid"></td>
      <td><input type="number" value="${c.maintenanceCost || 0}" data-truck="${t.truckId}" class="cost-maint"></td>
      <td style="color:var(--blue);font-weight:600;font-family:'JetBrains Mono',monospace">GHS ${total.toLocaleString()}</td>
    </tr>`;
  });
  html += '</tbody>';
  table.innerHTML = html;
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
