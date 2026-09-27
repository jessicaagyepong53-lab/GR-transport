// ─── EQUIPMENT HIRE PAGE ─────────────────────────────────────────────────
// Own login (separate from the truck dashboard's PIN). Covers 4 equipment
// categories plus hire contracts with expiry/overdue notifications.

const API = {
  async get(path) {
    const res = await fetch(path, { credentials: 'include' });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  },
  async put(path, body) {
    const res = await fetch(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  },
  async del(path) {
    const res = await fetch(path, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || res.statusText); }
    return res.json();
  }
};

const CATEGORIES = [
  { value: 'all', label: 'All Equipment', icon: 'fa-layer-group' },
  { value: 'mixer', label: 'Concrete Mixers', icon: 'fa-truck-ramp-box' },
  { value: 'scaffold', label: 'Scaffold', icon: 'fa-ruler-vertical' },
  { value: 'compactor', label: 'Compactors', icon: 'fa-weight-hanging' },
  { value: 'gutter-mould', label: 'Gutter Moulds', icon: 'fa-water' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

let isAdmin = false;
let equipment = [];
let contracts = [];
let openCards = new Set();
const requestedCategory = new URLSearchParams(window.location.search).get('category');
let activeCategory = CATEGORIES.some(c => c.value === requestedCategory) ? requestedCategory : 'all';
let activeYear = new URLSearchParams(window.location.search).get('year') || 'all';

function recordYear(value) {
  if (!value) return null;
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? String(year) : null;
}
function getAvailableYears() {
  const years = new Set();
  years.add(String(new Date().getFullYear()));
  equipment.forEach(item => { const year = recordYear(item.createdAt); if (year) years.add(year); });
  contracts.forEach(contract => {
    const startYear = recordYear(contract.startDate);
    const endYear = recordYear(contract.endDate);
    if (startYear) years.add(startYear);
    if (endYear) years.add(endYear);
  });
  if (!years.size) years.add(String(new Date().getFullYear()));
  return [...years].sort((a, b) => Number(a) - Number(b));
}
function matchesActiveYear(item, fields) {
  return activeYear === 'all' || fields.some(field => recordYear(item[field]) === activeYear);
}
function getVisibleEquipment() {
  return equipment.filter(item => matchesActiveYear(item, ['createdAt']));
}
function getVisibleContracts() {
  return contracts.filter(contract => matchesActiveYear(contract, ['startDate', 'endDate']));
}
function updateMixerHeader() {
  const subtitle = document.getElementById('mixerHeaderSubtitle');
  const saved = document.getElementById('mixerLastSaved');
  if (!subtitle || !saved) return;
  const years = getAvailableYears();
  const yearLabel = years.length === 1 ? years[0] : `${years[0]}–${years[years.length - 1]}`;
  subtitle.textContent = `Equipment Hire Business · ${yearLabel} · All Equipment`;
  const dates = [...equipment, ...contracts].flatMap(item => [item.updatedAt, item.createdAt]).filter(Boolean).map(value => new Date(value)).filter(date => !Number.isNaN(date.getTime()));
  const latest = dates.sort((a, b) => b - a)[0];
  const params = new URLSearchParams(window.location.search);
  const access = params.get('dash') === '1' ? 'Transport dashboard path' : 'Direct mixer path';
  if (!latest) {
    saved.innerHTML = `<i class="fa-regular fa-clock" style="color:var(--accent)"></i>Last saved: No mixer data yet · ${access}`;
    return;
  }
  const day = latest.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = latest.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  saved.innerHTML = `<i class="fa-regular fa-clock" style="color:var(--accent)"></i>Last saved: ${day} at ${time} · ${access}`;
}

function fmt(n) {
  n = Number(n || 0);
  if (Math.abs(n) >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.className = 'toast', 2600);
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const end = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((end - now) / (24 * 60 * 60 * 1000));
}

// ─── AUTH ────────────────────────────────────────────────────────────────
async function refreshMixerAuth() {
  try {
    const data = await API.get('/api/mixer-auth/status');
    isAdmin = data.isAdmin === true;
  } catch { isAdmin = false; }
  updateAuthUI();
}
function updateAuthUI() {
  const btn = document.getElementById('mixerAuthBtn');
  const navBtn = document.getElementById('mixerNavAuthBtn');
  const addEqBtn = document.getElementById('mixerAddBtn');
  const addCtBtn = document.getElementById('mixerAddContractBtn');
  if (isAdmin) {
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i>Logout';
      btn.onclick = mixerLogout;
    }
    if (navBtn) {
      navBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i><span>Equipment Hire Logout</span>';
      navBtn.onclick = mixerLogout;
      navBtn.classList.add('logged-in');
    }
    addEqBtn.style.display = '';
    addCtBtn.style.display = '';
  } else {
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-lock"></i>Login';
      btn.onclick = showMixerPinModal;
    }
    if (navBtn) {
      navBtn.innerHTML = '<i class="fa-solid fa-lock"></i><span>Equipment Hire Login</span>';
      navBtn.onclick = showMixerPinModal;
      navBtn.classList.remove('logged-in');
    }
    addEqBtn.style.display = 'none';
    addCtBtn.style.display = 'none';
  }
  renderEquipment();
  renderContracts();
}
async function mixerLogout() {
  try { await API.post('/api/mixer-auth/logout', {}); } catch {}
  isAdmin = false;
  updateAuthUI();
}
function showMixerPinModal() {
  if (typeof window.showStandaloneMixerLogin === 'function') {
    window.showStandaloneMixerLogin();
    return;
  }
  document.getElementById('mixerPinModal').classList.add('open');
  document.getElementById('mixerPinInput').value = '';
  document.getElementById('mixerPinError').textContent = '';
  setTimeout(() => document.getElementById('mixerPinInput').focus(), 100);
}
function closeMixerPinModal() { document.getElementById('mixerPinModal').classList.remove('open'); }
async function submitMixerPin() {
  const input = document.getElementById('mixerPinInput');
  const error = document.getElementById('mixerPinError');
  const pin = input.value.trim();
  if (!pin) { error.textContent = 'Enter a PIN'; return; }
  try {
    await API.post('/api/mixer-auth/verify', { pin });
    isAdmin = true;
    closeMixerPinModal();
    updateAuthUI();
    showToast('Logged in', 'success');
  } catch (err) {
    error.textContent = err.message || 'Invalid PIN';
    input.value = ''; input.focus();
  }
}
document.addEventListener('keydown', e => {
  const legacyModal = document.getElementById('mixerPinModal');
  if (e.key === 'Enter' && legacyModal?.classList.contains('open')) submitMixerPin();
});

// Show the transport route only when equipment was opened from transport.
function maybeShowBackLink() {
  const params = new URLSearchParams(window.location.search);
  const allEquipmentLink = document.getElementById('allEquipmentLink');
  if (params.get('dash') === '1' && allEquipmentLink) allEquipmentLink.href = 'all-equipment.html?dash=1';
}

// ─── LOAD ────────────────────────────────────────────────────────────────
async function loadAll() {
  try { equipment = await API.get('/api/equipment'); } catch (e) { equipment = []; showToast('Could not load equipment: ' + e.message, 'error'); }
  try { contracts = await API.get('/api/contracts'); } catch (e) { contracts = []; showToast('Could not load contracts: ' + e.message, 'error'); }
  updateMixerHeader();
  renderYearTabs();
  renderNotifications();
  renderKPIs();
  renderTabs();
  renderEquipment();
  renderContracts();
}

function renderYearTabs() {
  const container = document.getElementById('mixerYearTabs');
  if (!container) return;
  const years = getAvailableYears();
  if (activeYear !== 'all' && !years.includes(activeYear)) activeYear = 'all';
  container.innerHTML = ['all', ...years].map(year =>
    `<button class="year-tab ${activeYear === year ? 'active' : ''}" onclick="setMixerYear('${year}')">${year === 'all' ? 'All Years' : year}</button>`
  ).join('');
}
function setMixerYear(year) {
  activeYear = year;
  renderYearTabs();
  renderNotifications();
  renderKPIs();
  renderEquipment();
  renderContracts();
}

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────
function renderNotifications() {
  const banner = document.getElementById('notifBanner');
  const active = getVisibleContracts().filter(c => !c.returned);
  const ending = active.filter(c => { const d = daysUntil(c.endDate); return d !== null && d >= 0 && d <= 7; });
  const overdue = active.filter(c => { const d = daysUntil(c.endDate); return d !== null && d < 0; });

  let html = '';
  if (overdue.length) {
    html += `<div class="notif-row danger" onclick="scrollToContracts()"><i class="fa-solid fa-triangle-exclamation"></i>${overdue.length} agreement${overdue.length !== 1 ? 's' : ''} overdue for return — ${overdue.map(c => c.clientName).join(', ')}</div>`;
  }
  if (ending.length) {
    html += `<div class="notif-row warn" onclick="scrollToContracts()"><i class="fa-solid fa-hourglass-half"></i>${ending.length} agreement${ending.length !== 1 ? 's' : ''} ending within a week — ${ending.map(c => `${c.clientName} (${daysUntil(c.endDate)}d)`).join(', ')}</div>`;
  }
  banner.innerHTML = html;
  banner.style.display = html ? 'flex' : 'none';
}
function scrollToContracts() {
  document.getElementById('contractList').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── KPIs ────────────────────────────────────────────────────────────────
function renderKPIs() {
  const visibleEquipment = getVisibleEquipment();
  const visibleContracts = getVisibleContracts();
  const totalCost = visibleEquipment.reduce((s, e) => s + (e.cost?.pricePaid || 0) + (e.cost?.insurance || 0) + (e.cost?.maintenanceCost || 0), 0);
  const onHire = visibleEquipment.filter(e => e.status === 'on-hire').length;
  const activeContracts = visibleContracts.filter(c => !c.returned).length;
  const contractValue = visibleContracts.filter(c => !c.returned).reduce((s, c) => s + (c.totalValue || 0), 0);
  document.getElementById('kpiStrip').innerHTML = `
    <div class="kpi"><div class="kpi-label">Total Equipment</div><div class="kpi-value">${visibleEquipment.length}</div><div class="kpi-sub">${onHire} currently on hire</div></div>
    <div class="kpi"><div class="kpi-label">Active Contracts</div><div class="kpi-value" style="color:var(--orange)">${activeContracts}</div><div class="kpi-sub">${visibleContracts.length} total in view</div></div>
    <div class="kpi"><div class="kpi-label">Value on Hire</div><div class="kpi-value" style="color:var(--green)">${fmt(contractValue)}</div><div class="kpi-sub">Active contracts</div></div>
    <div class="kpi"><div class="kpi-label">Equipment Cost Basis</div><div class="kpi-value" style="color:var(--blue)">${fmt(totalCost)}</div><div class="kpi-sub">Price + insurance + maintenance</div></div>
  `;
}

// ─── TABS ────────────────────────────────────────────────────────────────
function renderTabs() {
  document.getElementById('categoryTabs').innerHTML = CATEGORIES.map(c =>
    `<div class="tab ${c.value === activeCategory ? 'active' : ''}" onclick="setCategory('${c.value}')"><i class="fa-solid ${c.icon}"></i> ${c.label}</div>`
  ).join('');
}
function setCategory(cat) {
  activeCategory = cat;
  renderTabs();
  renderEquipment();
}

// ─── EQUIPMENT ───────────────────────────────────────────────────────────
function renderEquipment() {
  const heading = document.getElementById('equipmentHeading');
  const label = CATEGORY_LABEL[activeCategory] || 'Equipment';
  heading.innerHTML = `<i class="fa-solid fa-toolbox" style="color:var(--accent);margin-right:6px"></i>${label}`;

  const list = document.getElementById('equipmentList');
  const visibleEquipment = getVisibleEquipment();
  const filtered = activeCategory === 'all' ? visibleEquipment : visibleEquipment.filter(e => e.category === activeCategory);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-toolbox"></i><p>No equipment in this category yet. ${isAdmin ? 'Click "Add Equipment" to get started.' : 'Log in as admin to add some.'}</p></div>`;
    return;
  }
  list.innerHTML = filtered.map(renderEquipmentCard).join('');
}

function renderEquipmentCard(e) {
  const isOpen = openCards.has(e.equipmentId);
  const totalCost = (e.cost?.pricePaid || 0) + (e.cost?.insurance || 0) + (e.cost?.maintenanceCost || 0);
  const maintRows = (e.maintenanceLog || []).slice().reverse().map(m => `
    <tr>
      <td>${m.date || '—'}</td>
      <td>${m.description || '—'}</td>
      <td style="color:var(--red)">${fmt(m.cost)}</td>
      ${isAdmin ? `<td><button class="del-btn" onclick="deleteMaintenance('${e.equipmentId}','${m._id}')"><i class="fa-solid fa-trash"></i></button></td>` : ''}
    </tr>`).join('') || `<tr><td colspan="4" style="color:var(--muted);text-align:center">No maintenance logged yet</td></tr>`;

  return `<div class="eq-card">
    <div class="eq-head" onclick="toggleCard('${e.equipmentId}')">
      <div>
        <div class="eq-id">${e.equipmentId} <span class="status-badge ${e.status}">${e.status.replace('-', ' ')}</span></div>
        <div class="eq-meta">${CATEGORY_LABEL[e.category] || e.category} · ${e.model || '—'}</div>
      </div>
      <div style="display:flex;gap:16px;align-items:center">
        <div style="text-align:right"><div style="font-size:0.62rem;color:var(--muted);text-transform:uppercase">Cost Basis</div><div style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--blue)">${fmt(totalCost)}</div></div>
        <i class="fa-solid fa-chevron-${isOpen ? 'up' : 'down'}" style="color:var(--muted)"></i>
      </div>
    </div>
    <div class="eq-body${isOpen ? ' open' : ''}">
      ${isAdmin ? `<div class="inline-form" style="margin-bottom:14px">
        <select id="statusSel_${e.equipmentId}">
          <option value="available" ${e.status === 'available' ? 'selected' : ''}>Available</option>
          <option value="on-hire" ${e.status === 'on-hire' ? 'selected' : ''}>On Hire</option>
          <option value="maintenance" ${e.status === 'maintenance' ? 'selected' : ''}>Maintenance</option>
          <option value="retired" ${e.status === 'retired' ? 'selected' : ''}>Retired</option>
        </select>
        <button class="btn btn-sm" onclick="updateStatus('${e.equipmentId}')"><i class="fa-solid fa-check"></i>Update Status</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEquipment('${e.equipmentId}')"><i class="fa-solid fa-trash"></i>Delete</button>
      </div>` : ''}
      <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);font-weight:700;margin-bottom:8px;">Maintenance Log</div>
      <table class="mini"><thead><tr><th>Date</th><th>Description</th><th>Cost</th>${isAdmin ? '<th></th>' : ''}</tr></thead><tbody>${maintRows}</tbody></table>
      ${isAdmin ? `<div class="inline-form">
        <input type="date" id="maintDate_${e.equipmentId}">
        <input type="text" class="wide" id="maintDesc_${e.equipmentId}" placeholder="Description">
        <input type="number" id="maintCost_${e.equipmentId}" placeholder="Cost">
        <button class="btn btn-primary btn-sm" onclick="addMaintenance('${e.equipmentId}')"><i class="fa-solid fa-plus"></i>Add</button>
      </div>` : ''}
    </div>
  </div>`;
}

function toggleCard(id) {
  if (openCards.has(id)) openCards.delete(id); else openCards.add(id);
  renderEquipment();
}

function openAddEquipment() { document.getElementById('addEquipmentCard').style.display = ''; }
async function submitAddEquipment() {
  const equipmentId = document.getElementById('newEqId').value.trim();
  if (!equipmentId) return showToast('Enter an equipment ID', 'error');
  const category = document.getElementById('newEqCategory').value;
  const model = document.getElementById('newEqModel').value.trim();
  const pricePaid = parseFloat(document.getElementById('newEqPricePaid').value) || 0;
  const insurance = parseFloat(document.getElementById('newEqInsurance').value) || 0;
  try {
    await API.post('/api/equipment', { equipmentId, category, model, cost: { pricePaid, insurance, maintenanceCost: 0 } });
    document.getElementById('addEquipmentCard').style.display = 'none';
    ['newEqId','newEqModel','newEqPricePaid','newEqInsurance'].forEach(id => document.getElementById(id).value = '');
    showToast('Equipment added', 'success');
    await loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}
async function updateStatus(id) {
  const status = document.getElementById(`statusSel_${id}`).value;
  try {
    openCards.add(id);
    await API.put(`/api/equipment/${encodeURIComponent(id)}`, { status });
    showToast('Status updated', 'success');
    await loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteEquipment(id) {
  if (!confirm(`Delete ${id}? This cannot be undone.`)) return;
  try {
    await API.del(`/api/equipment/${encodeURIComponent(id)}`);
    showToast('Equipment deleted', 'success');
    await loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}
async function addMaintenance(id) {
  const date = document.getElementById(`maintDate_${id}`).value;
  const description = document.getElementById(`maintDesc_${id}`).value.trim();
  const cost = parseFloat(document.getElementById(`maintCost_${id}`).value) || 0;
  try {
    openCards.add(id);
    await API.post(`/api/equipment/${encodeURIComponent(id)}/maintenance`, { date, description, cost });
    showToast('Maintenance logged', 'success');
    await loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}
async function deleteMaintenance(id, entryId) {
  if (!confirm('Delete this maintenance entry?')) return;
  try {
    openCards.add(id);
    await API.del(`/api/equipment/${encodeURIComponent(id)}/maintenance/${entryId}`);
    showToast('Entry deleted', 'success');
    await loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── CONTRACTS ───────────────────────────────────────────────────────────
function renderContracts() {
  const list = document.getElementById('contractList');
  const visibleContracts = getVisibleContracts();
  if (!visibleContracts.length) {
    list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-contract"></i><p>No contracts yet. ${isAdmin ? 'Click "New Contract" to add one.' : 'Log in as admin to add one.'}</p></div>`;
    return;
  }
  const sorted = visibleContracts.slice().sort((a, b) => (a.returned === b.returned ? 0 : a.returned ? 1 : -1) || new Date(a.endDate) - new Date(b.endDate));
  list.innerHTML = sorted.map(renderContractRow).join('');
}

function contractTotals(c) {
  const totalValue = Number(c?.totalValue || 0);
  const payments = Array.isArray(c?.payments) ? c.payments : [];
  const totalPaid = payments.reduce((sum, p) => sum + Number(p?.amount || 0), 0);
  const balance = totalValue - totalPaid;
  return { totalValue, totalPaid, balance };
}

function renderContractRow(c) {
  const d = daysUntil(c.endDate);
  let cls = '';
  let statusLabel = 'Active';
  if (c.returned) { cls = 'done'; statusLabel = 'Completed'; }
  else if (d !== null && d < 0) { cls = 'overdue'; statusLabel = `${Math.abs(d)} day${Math.abs(d) !== 1 ? 's' : ''} overdue`; }
  else if (d !== null && d <= 7) { cls = 'ending'; statusLabel = `Ending in ${d} day${d !== 1 ? 's' : ''}`; }

  const itemsText = (c.items || []).map(i => `${i.quantity}\u00d7 ${CATEGORY_LABEL[i.category] || i.category}${i.equipmentId ? ' (' + i.equipmentId + ')' : ''}${i.description ? ' \u2014 ' + i.description : ''}`).join(', ');
  const { totalPaid, balance } = contractTotals(c);
  const conditionTag = c.returned && c.conditionStatus
    ? `<span class="condition-tag ${c.conditionStatus}">${c.conditionStatus.replace('-', ' ')}</span>`
    : '';

  return `<div class="contract-row ${cls}">
    <div class="contract-top">
      <div>
        <div class="contract-client">${c.clientName}${conditionTag}</div>
        <div class="contract-dates">${c.startDate} \u2192 ${c.endDate} \u00b7 ${statusLabel}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <span class="pill ${c.paymentStatus}">${c.paymentStatus}</span>
        <div style="text-align:right"><div style="font-size:0.62rem;color:var(--muted);text-transform:uppercase">Value</div><div style="font-family:'JetBrains Mono',monospace;font-weight:700;color:var(--green)">${fmt(c.totalValue)}</div></div>
      </div>
    </div>
    <div class="contract-items">${itemsText || 'No items listed'}${c.clientPhone ? ' \u00b7 ' + c.clientPhone : ''}${c.notes ? ' \u00b7 ' + c.notes : ''}</div>
    <div class="contract-balance">Paid <strong>${fmt(totalPaid)}</strong> \u00b7 Balance <strong style="color:${balance > 0 ? 'var(--red)' : 'var(--green)'}">${fmt(balance)}</strong>${c.paymentDueDate ? ` \u00b7 Due ${c.paymentDueDate}` : ''}</div>
    ${isAdmin ? `<div class="contract-actions">
      <button class="btn btn-sm" onclick="openPaymentModal('${c._id}')"><i class="fa-solid fa-file-invoice-dollar"></i>${c.returned ? 'View Payments &amp; Return' : 'Manage Payments / Return'}</button>
      <button class="btn btn-danger btn-sm" onclick="deleteContract('${c._id}')"><i class="fa-solid fa-trash"></i>Delete</button>
    </div>` : ''}
  </div>`;
}

function openAddContract() { document.getElementById('addContractCard').style.display = ''; }
async function submitAddContract() {
  const clientName = document.getElementById('newCtClient').value.trim();
  if (!clientName) return showToast('Enter a client name', 'error');
  const clientPhone = document.getElementById('newCtPhone').value.trim();
  const clientAddress = document.getElementById('newCtAddress').value.trim();
  const category = document.getElementById('newCtCategory').value;
  const equipmentId = document.getElementById('newCtEquipmentId').value.trim();
  const quantity = parseInt(document.getElementById('newCtQty').value) || 1;
  const startDate = document.getElementById('newCtStart').value;
  const endDate = document.getElementById('newCtEnd').value;
  const rateUnit = document.getElementById('newCtRateUnit').value;
  const rate = parseFloat(document.getElementById('newCtRate').value) || 0;
  const totalValue = parseFloat(document.getElementById('newCtTotal').value) || 0;
  const deposit = parseFloat(document.getElementById('newCtDeposit').value) || 0;
  const paymentDueDate = document.getElementById('newCtPaymentDue').value;
  const notes = document.getElementById('newCtNotes').value.trim();
  if (!startDate || !endDate) return showToast('Enter a start and end date', 'error');

  try {
    await API.post('/api/contracts', {
      clientName, clientPhone, clientAddress,
      items: [{ category, equipmentId, quantity }],
      startDate, endDate, rate, rateUnit, totalValue, deposit, paymentDueDate, notes
    });
    document.getElementById('addContractCard').style.display = 'none';
    ['newCtClient','newCtPhone','newCtAddress','newCtEquipmentId','newCtStart','newCtEnd','newCtRate','newCtTotal','newCtDeposit','newCtPaymentDue','newCtNotes'].forEach(id => document.getElementById(id).value = '');
    showToast('Contract saved', 'success');
    await loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── PAYMENT LEDGER + RETURN MODAL ─────────────────────────────────────────
let activePaymentContractId = null;

function findContract(id) {
  return contracts.find(c => String(c._id) === String(id));
}

function openPaymentModal(id) {
  activePaymentContractId = id;
  const errEl = document.getElementById('pmError');
  if (errEl) errEl.textContent = '';
  document.getElementById('pmNewDate').value = new Date().toISOString().slice(0, 10);
  document.getElementById('pmNewAmount').value = '';
  document.getElementById('pmNewMethod').value = '';
  document.getElementById('pmNewNote').value = '';
  renderPaymentModal();
  document.getElementById('paymentModal').classList.add('open');
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.remove('open');
  activePaymentContractId = null;
}

function renderPaymentModal() {
  const c = findContract(activePaymentContractId);
  if (!c) { closePaymentModal(); return; }

  document.getElementById('pmClientName').textContent = c.clientName;
  const { totalValue, totalPaid, balance } = contractTotals(c);

  document.getElementById('pmSummaryGrid').innerHTML = `
    <div class="pm-summary-item"><div class="pm-summary-label">Total Value</div><div class="pm-summary-value" style="color:var(--green)">${fmt(totalValue)}</div></div>
    <div class="pm-summary-item"><div class="pm-summary-label">Paid</div><div class="pm-summary-value" style="color:var(--accent)">${fmt(totalPaid)}</div></div>
    <div class="pm-summary-item"><div class="pm-summary-label">Balance</div><div class="pm-summary-value" style="color:${balance > 0 ? 'var(--red)' : 'var(--green)'}">${fmt(balance)}</div></div>
  `;

  const payments = (c.payments || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  document.getElementById('pmPaymentsList').innerHTML = payments.length
    ? payments.map(p => `<div class="pm-payment-row">
        <span>${p.date}</span>
        <span style="color:var(--green);font-weight:700">${fmt(p.amount)}</span>
        <span style="color:var(--muted)">${p.method || '\u2014'}</span>
        <span style="color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.note || ''}</span>
        <button class="pm-del" onclick="deletePaymentEntry('${p._id}')" title="Remove"><i class="fa-solid fa-trash"></i></button>
      </div>`).join('')
    : '<div class="pm-empty">No payments recorded yet.</div>';

  const returnSection = document.getElementById('pmReturnSection');
  if (c.returned) {
    returnSection.innerHTML = `
      <div class="pm-section-title">Return Summary</div>
      <div class="pm-returned-summary">
        Returned <strong>${c.returnedDate || '\u2014'}</strong> \u00b7
        Condition: <strong>${(c.conditionStatus || '\u2014').replace('-', ' ')}</strong><br>
        Deposit refunded: <strong>${fmt(c.depositRefund || 0)}</strong> of ${fmt(c.deposit || 0)} collected
        ${c.returnNotes ? `<br>Notes: ${c.returnNotes}` : ''}
      </div>`;
  } else {
    returnSection.innerHTML = `
      <div class="pm-section-title">Return / Condition Check</div>
      <div class="pm-return-form">
        <div>
          <label>Condition on Return</label>
          <select id="pmCondition">
            <option value="good">Good</option>
            <option value="minor-wear">Minor Wear</option>
            <option value="damaged">Damaged</option>
          </select>
        </div>
        <div>
          <label>Deposit Refund (GHS)</label>
          <input type="number" id="pmDepositRefund" min="0" max="${c.deposit || 0}" value="${c.deposit || 0}">
        </div>
        <div class="full">
          <label>Return Notes</label>
          <textarea id="pmReturnNotes" rows="2" placeholder="Optional \u2014 condition details, damage description, etc."></textarea>
        </div>
        <div class="full">
          <button class="btn btn-primary" style="width:100%;justify-content:center" onclick="submitReturn()"><i class="fa-solid fa-rotate-left"></i>Mark Returned</button>
        </div>
      </div>
      <div style="font-size:.72rem;color:var(--muted);margin-top:8px;"><i class="fa-solid fa-circle-info"></i> Marking "Damaged" automatically sends this contract's equipment to Maintenance status instead of Available.</div>
    `;
    const condSel = document.getElementById('pmCondition');
    condSel.addEventListener('change', () => {
      const refundInput = document.getElementById('pmDepositRefund');
      refundInput.value = condSel.value === 'damaged' ? 0 : (c.deposit || 0);
    });
  }
}

async function addPaymentEntry() {
  const id = activePaymentContractId;
  if (!id) return;
  const date = document.getElementById('pmNewDate').value;
  const amount = parseFloat(document.getElementById('pmNewAmount').value);
  const method = document.getElementById('pmNewMethod').value;
  const note = document.getElementById('pmNewNote').value.trim();
  const errorEl = document.getElementById('pmError');
  errorEl.textContent = '';

  if (!date) { errorEl.textContent = 'Enter a payment date.'; return; }
  if (!Number.isFinite(amount) || amount <= 0) { errorEl.textContent = 'Enter a valid payment amount.'; return; }

  try {
    const updated = await API.post(`/api/contracts/${id}/payments`, { date, amount, method, note });
    const idx = contracts.findIndex(c => String(c._id) === String(id));
    if (idx >= 0) contracts[idx] = updated;
    document.getElementById('pmNewAmount').value = '';
    document.getElementById('pmNewNote').value = '';
    renderPaymentModal();
    renderContracts();
    renderNotifications();
    showToast('Payment recorded', 'success');
  } catch (e) { errorEl.textContent = e.message; }
}

async function deletePaymentEntry(paymentId) {
  const id = activePaymentContractId;
  if (!id) return;
  if (!confirm('Remove this payment entry?')) return;
  try {
    const updated = await API.del(`/api/contracts/${id}/payments/${paymentId}`);
    const idx = contracts.findIndex(c => String(c._id) === String(id));
    if (idx >= 0) contracts[idx] = updated;
    renderPaymentModal();
    renderContracts();
    showToast('Payment removed', 'success');
  } catch (e) { showToast(e.message, 'error'); }
}

async function submitReturn() {
  const id = activePaymentContractId;
  if (!id) return;
  const conditionStatus = document.getElementById('pmCondition').value;
  const depositRefund = parseFloat(document.getElementById('pmDepositRefund').value) || 0;
  const returnNotes = document.getElementById('pmReturnNotes').value.trim();
  const errorEl = document.getElementById('pmError');
  errorEl.textContent = '';

  const confirmMsg = conditionStatus === 'damaged'
    ? 'Mark returned as DAMAGED? The equipment will be sent to Maintenance status.'
    : 'Mark this contract as returned?';
  if (!confirm(confirmMsg)) return;

  try {
    const updated = await API.put(`/api/contracts/${id}/return`, { conditionStatus, depositRefund, returnNotes });
    const idx = contracts.findIndex(c => String(c._id) === String(id));
    if (idx >= 0) contracts[idx] = updated;
    renderPaymentModal();
    await loadAll(); // equipment statuses may have changed too
    showToast('Contract marked returned', 'success');
  } catch (e) { errorEl.textContent = e.message; }
}

async function deleteContract(id) {
  if (!confirm('Delete this contract? This cannot be undone.')) return;
  try {
    await API.del(`/api/contracts/${id}`);
    showToast('Contract deleted', 'success');
    await loadAll();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─── INIT ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  let cameFromTransport = false;
  try { cameFromTransport = new URL(document.referrer).searchParams.get('dash') === '1'; } catch {}
  if (window.location.pathname.endsWith('/mixers.html') && new URLSearchParams(window.location.search).get('dash') !== '1' && !cameFromTransport) {
    window.location.replace('all-equipment.html');
    return;
  }
  const paymentModalOverlay = document.getElementById('paymentModal');
  if (paymentModalOverlay) paymentModalOverlay.addEventListener('click', e => { if (e.target === paymentModalOverlay) closePaymentModal(); });
  maybeShowBackLink();
  await refreshMixerAuth();
  await loadAll();
});