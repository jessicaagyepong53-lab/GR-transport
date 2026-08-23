// ─── SETTINGS PAGE ───────────────────────────────────────────────────────────

let trucksData = [];
let referenceFiles = [];
let editingReferenceId = null;
let pendingReferenceUploads = [];
let referenceFileFilter = { category: 'all', search: '' };

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.className = 'toast', 2600);
}

async function loadSettings() {
  try {
    const [trucks, files] = await Promise.all([
      API.get('/api/trucks'),
      API.get('/api/settings/files')
    ]);
    trucksData = trucks;
    referenceFiles = files;
    renderDriverTable();
    renderCostTable();
    renderReferenceFiles();
  } catch (err) {
    showToast('Error loading data: ' + err.message, 'error');
  }
}

function formatFileSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateShort(isoDate) {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 'Unknown date';
  return d.toLocaleString();
}

function getFileIcon(mimeType) {
  if (mimeType && mimeType.startsWith('image/')) return 'fa-regular fa-image';
  if (mimeType === 'application/pdf') return 'fa-regular fa-file-pdf';
  if (mimeType && mimeType.includes('word')) return 'fa-regular fa-file-word';
  if (mimeType && (mimeType.includes('excel') || mimeType.includes('sheet'))) return 'fa-regular fa-file-excel';
  return 'fa-regular fa-file-lines';
}

function isOfficeMimeType(mimeType) {
  return mimeType === 'application/msword'
    || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || mimeType === 'application/vnd.ms-excel'
    || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
}

function isPdfFile(file) {
  const mimeType = String(file?.mimeType || '').toLowerCase();
  const name = String(file?.originalName || '').toLowerCase();
  return mimeType === 'application/pdf' || name.endsWith('.pdf');
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function closeReferenceViewer() {
  const modal = document.getElementById('referenceViewerModal');
  const body = document.getElementById('viewerBody');
  if (!modal || !body) return;
  body.innerHTML = '';
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

async function openReferenceViewer(fileId) {
  const file = referenceFiles.find(f => String(f.id) === String(fileId));
  if (!file) {
    showToast('File not found', 'error');
    return;
  }

  const modal = document.getElementById('referenceViewerModal');
  const body = document.getElementById('viewerBody');
  const title = document.getElementById('viewerTitle');
  const rawBtn = document.getElementById('viewerDownloadBtn');
  if (!modal || !body || !title || !rawBtn) return;

  title.textContent = file.originalName || 'Reference File';
  rawBtn.href = file.url;
  body.innerHTML = '';

  const mimeType = String(file.mimeType || '').toLowerCase();

  if (mimeType.startsWith('image/')) {
    body.innerHTML = `<img class="viewer-image" src="${file.url}" alt="${escapeHtml(file.originalName)}">`;
  } else if (isPdfFile(file)) {
    body.innerHTML = `<div class="viewer-fallback"><div>Loading PDF preview...</div></div>`;
    try {
      const res = await fetch(file.url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch PDF');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      body.innerHTML = `<iframe class="viewer-frame" src="${blobUrl}"></iframe>`;
    } catch {
      body.innerHTML = `<div class="viewer-fallback"><div>PDF preview failed in this browser.</div><div>Use <b>Open Raw</b> to open/download it.</div></div>`;
    }
  } else if (mimeType === 'text/plain') {
    try {
      const res = await fetch(file.url, { credentials: 'include' });
      const text = await res.text();
      body.innerHTML = `<pre class="viewer-text">${escapeHtml(text)}</pre>`;
    } catch {
      body.innerHTML = `<div class="viewer-fallback"><div>Preview failed for this text file.</div><div>Use <b>Open Raw</b> to open it directly.</div></div>`;
    }
  } else if (isOfficeMimeType(mimeType)) {
    const sourceUrl = `${window.location.origin}${file.url}`;
    if (window.location.protocol === 'https:') {
      const officeEmbedUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(sourceUrl)}`;
      body.innerHTML = `<iframe class="viewer-frame" src="${officeEmbedUrl}"></iframe>`;
    } else {
      body.innerHTML = `<div class="viewer-fallback"><div>Office preview needs HTTPS deployment.</div><div>Use <b>Open Raw</b> for this local environment.</div></div>`;
    }
  } else {
    body.innerHTML = `<div class="viewer-fallback"><div>This file type cannot be previewed in-app.</div><div>Use <b>Open Raw</b> to open or download it.</div></div>`;
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function renderReferenceFiles() {
  const list = document.getElementById('referenceFilesList');
  const results = document.getElementById('referenceFilterResults');
  if (!list) return;

  const normalizedSearch = String(referenceFileFilter.search || '').trim().toLowerCase();
  const filtered = referenceFiles.filter(file => {
    const category = String(file.category || 'General');
    if (referenceFileFilter.category !== 'all' && category !== referenceFileFilter.category) return false;
    if (!normalizedSearch) return true;
    const haystack = [
      file.originalName || '',
      file.subheading || '',
      file.notes || '',
      category
    ].join(' ').toLowerCase();
    return haystack.includes(normalizedSearch);
  });

  if (results) {
    if (!referenceFiles.length) {
      results.textContent = 'No files uploaded yet.';
    } else if (!filtered.length) {
      results.textContent = 'No files match this filter.';
    } else if (filtered.length === referenceFiles.length) {
      results.textContent = `Showing all ${filtered.length} file${filtered.length === 1 ? '' : 's'}`;
    } else {
      results.textContent = `Showing ${filtered.length} of ${referenceFiles.length} files`;
    }
  }

  if (!referenceFiles.length) {
    list.innerHTML = '<div class="file-empty">No reference files uploaded yet.</div>';
    return;
  }

  if (!filtered.length) {
    list.innerHTML = '<div class="file-empty">No files match this filter. Adjust category or search terms.</div>';
    return;
  }

  const isAdmin = window._isAdminCached === true;
  list.innerHTML = filtered.map(file => {
    const safeName = escapeHtml(file.originalName || 'File');
    const category = escapeHtml(file.category || 'General');
    const subheading = String(file.subheading || '').trim();
    const notes = String(file.notes || '').trim();

    return `<div class="file-item">
      <div class="file-item-info">
        <div class="file-item-name"><i class="${getFileIcon(file.mimeType)}"></i>${safeName}</div>
        <div class="file-item-heading"><span class="file-badge">${category}</span>${subheading ? escapeHtml(subheading) : '<span style="color:var(--muted)">No subheading</span>'}</div>
        <div class="file-item-meta">${formatFileSize(file.size)} • Uploaded ${formatDateShort(file.uploadedAt)}</div>
        ${notes ? `<div class="file-item-meta">${escapeHtml(notes)}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn" onclick="openReferenceViewer('${file.id}')"><i class="fa-solid fa-up-right-from-square"></i>Open</button>
        ${isAdmin ? `<button class="btn" onclick="openReferenceMetaModal('${file.id}')"><i class="fa-solid fa-pen"></i>Edit Details</button>` : ''}
        ${isAdmin ? `<button class="btn btn-danger" onclick="deleteReferenceFile('${file.id}')"><i class="fa-solid fa-trash"></i>Delete</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function inferCategoryAndSubheading(fileName) {
  const lower = String(fileName || '').toLowerCase();
  if (lower.includes('insurance')) return { category: 'Insurance', subheading: 'Insurance payment document' };
  if (lower.includes('cheque') || lower.includes('check')) return { category: 'Cheque', subheading: 'Cheque receipt payment' };
  if (lower.includes('cash')) return { category: 'Cash Receipt', subheading: 'Cash payment receipt' };
  if (lower.includes('truck') || lower.includes('payment')) return { category: 'Truck Payment', subheading: 'Truck payment document' };
  return { category: 'General', subheading: '' };
}

function renderPendingReferenceUploads() {
  const box = document.getElementById('pendingReferenceUploads');
  if (!box) return;

  if (!pendingReferenceUploads.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }

  box.style.display = 'grid';
  box.innerHTML = pendingReferenceUploads.map((item, idx) => `
    <div class="pending-upload-item">
      <div class="pending-upload-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</div>
      <select class="form-input" onchange="setPendingReferenceCategory(${idx}, this.value)">
        <option value="General" ${item.category === 'General' ? 'selected' : ''}>General</option>
        <option value="Insurance" ${item.category === 'Insurance' ? 'selected' : ''}>Insurance</option>
        <option value="Cheque" ${item.category === 'Cheque' ? 'selected' : ''}>Cheque</option>
        <option value="Cash Receipt" ${item.category === 'Cash Receipt' ? 'selected' : ''}>Cash Receipt</option>
        <option value="Truck Payment" ${item.category === 'Truck Payment' ? 'selected' : ''}>Truck Payment</option>
      </select>
      <input type="text" class="form-input" value="${escapeHtml(item.subheading || '')}" placeholder="Subheading" oninput="setPendingReferenceSubheading(${idx}, this.value)">
    </div>
  `).join('');
}

function setPendingReferenceCategory(index, value) {
  if (!pendingReferenceUploads[index]) return;
  pendingReferenceUploads[index].category = String(value || 'General');
}

function setPendingReferenceSubheading(index, value) {
  if (!pendingReferenceUploads[index]) return;
  pendingReferenceUploads[index].subheading = String(value || '').trim();
}

function openReferenceMetaModal(fileId) {
  const file = referenceFiles.find(f => String(f.id) === String(fileId));
  if (!file) {
    showToast('File not found', 'error');
    return;
  }

  editingReferenceId = String(file.id);
  const modal = document.getElementById('referenceMetaModal');
  const cat = document.getElementById('metaCategoryInput');
  const sub = document.getElementById('metaSubheadingInput');
  const notes = document.getElementById('metaNotesInput');
  if (!modal || !cat || !sub || !notes) return;

  cat.value = file.category || 'General';
  sub.value = file.subheading || '';
  notes.value = file.notes || '';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeReferenceMetaModal() {
  const modal = document.getElementById('referenceMetaModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  editingReferenceId = null;
}

async function saveReferenceMeta() {
  if (!editingReferenceId) return;

  const category = document.getElementById('metaCategoryInput')?.value || 'General';
  const subheading = document.getElementById('metaSubheadingInput')?.value?.trim() || '';
  const notes = document.getElementById('metaNotesInput')?.value?.trim() || '';

  try {
    await API.put(`/api/settings/files/${encodeURIComponent(editingReferenceId)}/meta`, {
      category,
      subheading,
      notes
    });
    showToast('Reference details updated', 'success');
    closeReferenceMetaModal();
    await loadSettings();
  } catch (err) {
    showToast('Could not save details: ' + err.message, 'error');
  }
}

async function uploadReferenceFiles() {
  const input = document.getElementById('referenceFileInput');
  if (!input || !input.files || !input.files.length) {
    showToast('Select at least one file', 'error');
    return;
  }

  const uploadBtn = document.getElementById('uploadReferenceBtn');
  if (uploadBtn) {
    uploadBtn.disabled = true;
    uploadBtn.style.opacity = '0.7';
  }

  try {
    const items = pendingReferenceUploads.length
      ? pendingReferenceUploads
      : Array.from(input.files).map(file => ({ file, category: 'General', subheading: '' }));

    for (const item of items) {
      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('category', item.category || 'General');
      formData.append('subheading', item.subheading || '');
      await API.postForm('/api/settings/files', formData);
    }
    input.value = '';
    pendingReferenceUploads = [];
    renderPendingReferenceUploads();
    const subheadingInput = document.getElementById('referenceSubheadingInput');
    if (subheadingInput) subheadingInput.value = '';
    showToast('Reference files uploaded', 'success');
    await loadSettings();
  } catch (err) {
    showToast('Upload failed: ' + err.message, 'error');
  } finally {
    if (uploadBtn) {
      uploadBtn.disabled = false;
      uploadBtn.style.opacity = '';
    }
  }
}

async function deleteReferenceFile(fileId) {
  if (!fileId) return;
  if (!window.confirm('Delete this reference file?')) return;

  try {
    await API.del(`/api/settings/files/${encodeURIComponent(fileId)}`);
    showToast('File deleted', 'success');
    await loadSettings();
  } catch (err) {
    showToast('Delete failed: ' + err.message, 'error');
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
  const container = document.getElementById('driverCards');
  // Collect all years across all trucks
  const allYears = new Set();
  trucksData.forEach(t => { Object.keys(t.years || {}).forEach(y => allYears.add(y)); });
  const years = [...allYears].sort();

  let html = '';
  trucksData.forEach(t => {
    const sd = t.startDates || {};
    const eot = t.endOfTerm || { active: false, date: '' };

    html += `<div class="driver-card">
      <div class="driver-card-header">
        <div class="driver-card-truck">
          <input type="text" value="${t.truckId}" data-truck="${t.truckId}" class="truck-name-input">
        </div>
        <div class="driver-card-eot">
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:0.78rem;color:${eot.active ? 'var(--red)' : 'var(--muted)'};">
            <input type="checkbox" ${eot.active ? 'checked' : ''} data-truck="${t.truckId}" class="eot-active" style="accent-color:var(--red);width:15px;height:15px;cursor:pointer;">
            <span class="eot-label">${eot.active ? 'End of Term' : 'Active'}</span>
          </label>
          <input type="date" value="${eot.date || ''}" data-truck="${t.truckId}" class="eot-date" style="padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--text);font-size:0.8rem;${!eot.active ? 'opacity:0.3;pointer-events:none;' : ''}">
        </div>
      </div>
      <div class="driver-card-fields">
        <div class="driver-card-field">
          <label><i class="fa-solid fa-user" style="margin-right:4px;"></i>Driver Name</label>
          <input type="text" value="${t.driver || ''}" data-truck="${t.truckId}" class="driver-input" placeholder="Enter driver name">
        </div>
        <div class="driver-card-field">
          <label><i class="fa-solid fa-sticky-note" style="margin-right:4px;"></i>Notes</label>
          <input type="text" value="${t.driverNotes || ''}" data-truck="${t.truckId}" class="driver-notes-input" placeholder="e.g. Driver changed Sep 2025">
        </div>
      </div>`;

    // Start dates
    if (years.length) {
      html += `<div class="driver-card-dates">`;
      years.forEach(y => {
        const hasYear = t.years && t.years[y];
        html += `<div class="date-chip">
          <label>Started ${y}</label>
          <input type="date" value="${sd[y] || ''}" data-truck="${t.truckId}" data-year="${y}" class="start-date-input"${!hasYear ? ' disabled' : ''}>
        </div>`;
      });
      html += `</div>`;
    }

    html += `</div>`;
  });

  container.innerHTML = html;

  // Auto-save on change
  container.querySelectorAll('.driver-input, .driver-notes-input, .start-date-input, .eot-date').forEach(input => {
    input.addEventListener('input', () => autoSaveDriverRow(input.dataset.truck));
    input.addEventListener('change', () => autoSaveDriverRow(input.dataset.truck));
  });
  // Truck name rename on blur or Enter
  container.querySelectorAll('.truck-name-input').forEach(input => {
    input.addEventListener('blur', () => renameTruck(input));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  });
  // Checkbox listeners for end-of-term
  container.querySelectorAll('.eot-active').forEach(cb => {
    cb.addEventListener('change', () => {
      const card = cb.closest('.driver-card');
      const dateInput = card.querySelector('.eot-date');
      const label = card.querySelector('.eot-label');
      if (cb.checked) {
        dateInput.style.opacity = '1';
        dateInput.style.pointerEvents = 'auto';
        label.textContent = 'End of Term';
        cb.closest('label').style.color = 'var(--red)';
      } else {
        dateInput.style.opacity = '0.3';
        dateInput.style.pointerEvents = 'none';
        label.textContent = 'Active';
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
    const insurance = parseFloat(row.querySelector('.cost-insurance')?.value) || 0;
    const maintenanceCost = parseFloat(row.querySelector('.cost-maint').value) || 0;
    try {
      await API.put(`/api/trucks/${encodeURIComponent(truckId)}`, { cost: { initialValue, pricePaid, insurance, maintenanceCost } });
      // Sync to localStorage
      const DATA = getLocalData();
      if (!DATA.truckCost) DATA.truckCost = {};
      DATA.truckCost[truckId] = { initialValue, pricePaid, insurance, maintenanceCost };
      setLocalData(DATA);
      showToast('Saved', 'success');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  }, 800);
}

function renderCostTable() {
  const table = document.getElementById('costTable');
  let html = `<thead><tr><th>Truck ID</th><th>Initial Value (GHS) <span style="font-size:0.65rem;color:var(--muted);font-weight:400">ref</span></th><th>Amount Paid (GHS)</th><th>Insurance Fee (GHS)</th><th>Repairs &amp; Maintenance (GHS)</th><th>Total</th></tr></thead><tbody>`;
  trucksData.forEach(t => {
    const c = t.cost || {};
    const total = (c.pricePaid || 0) + (c.insurance || 0) + (c.maintenanceCost || 0);
    html += `<tr data-truck="${t.truckId}">
      <td style="color:var(--accent);font-weight:600;font-family:'JetBrains Mono',monospace">${t.truckId}</td>
      <td><input type="number" value="${c.initialValue || 0}" data-truck="${t.truckId}" class="cost-init" oninput="updateRowTotal(this)"></td>
      <td><input type="number" value="${c.pricePaid || 0}" data-truck="${t.truckId}" class="cost-paid" oninput="updateRowTotal(this)"></td>
      <td><input type="number" value="${c.insurance || 0}" data-truck="${t.truckId}" class="cost-insurance" oninput="updateRowTotal(this)"></td>
      <td><input type="number" value="${c.maintenanceCost || 0}" data-truck="${t.truckId}" class="cost-maint" oninput="updateRowTotal(this)"></td>
      <td class="row-total" style="color:var(--blue);font-weight:600;font-family:'JetBrains Mono',monospace;white-space:nowrap;">GHS ${total.toLocaleString()}</td>
    </tr>`;
  });
  html += '</tbody>';
  table.innerHTML = html;

  // Auto-save on change
  table.querySelectorAll('.cost-init, .cost-paid, .cost-insurance, .cost-maint').forEach(input => {
    input.addEventListener('input', () => { updateRowTotal(input); autoSaveCostRow(input.dataset.truck); });
  });
}

function updateRowTotal(input) {
  const row = input.closest('tr');
  const paid = parseFloat(row.querySelector('.cost-paid').value) || 0;
  const insurance = parseFloat(row.querySelector('.cost-insurance')?.value) || 0;
  const maint = parseFloat(row.querySelector('.cost-maint').value) || 0;
  row.querySelector('.row-total').textContent = 'GHS ' + (paid + insurance + maint).toLocaleString();
}

function updateNewTruckTotal() {
  const paid = parseFloat(document.getElementById('newTruckPaid').value) || 0;
  const insurance = parseFloat(document.getElementById('newTruckInsurance').value) || 0;
  const maint = parseFloat(document.getElementById('newTruckMaint').value) || 0;
  document.getElementById('newTruckTotal').textContent = 'GHS ' + (paid + insurance + maint).toLocaleString();
}

async function saveCosts() {
  const rows = document.querySelectorAll('#costTable tbody tr');
  try {
    for (const row of rows) {
      const truckId = row.querySelector('.cost-init')?.dataset.truck;
      if (!truckId) continue;
      const initialValue = parseFloat(row.querySelector('.cost-init').value) || 0;
      const pricePaid = parseFloat(row.querySelector('.cost-paid').value) || 0;
      const insurance = parseFloat(row.querySelector('.cost-insurance')?.value) || 0;
      const maintenanceCost = parseFloat(row.querySelector('.cost-maint').value) || 0;
      await API.put(`/api/trucks/${encodeURIComponent(truckId)}`, {
        cost: { initialValue, pricePaid, insurance, maintenanceCost }
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
  const insurance = parseFloat(document.getElementById('newTruckInsurance').value) || 0;
  const maintenanceCost = parseFloat(document.getElementById('newTruckMaint').value) || 0;

  if (!truckId) return showToast('Enter a Truck ID', 'error');

  try {
    await API.post('/api/trucks', {
      truckId,
      driver,
      cost: { initialValue, pricePaid, insurance, maintenanceCost }
    });
    showToast(`Truck ${truckId} added successfully`, 'success');
    document.getElementById('newTruckId').value = '';
    document.getElementById('newTruckDriver').value = '';
    document.getElementById('newTruckInit').value = '0';
    document.getElementById('newTruckPaid').value = '0';
    document.getElementById('newTruckInsurance').value = '0';
    document.getElementById('newTruckMaint').value = '0';
    updateNewTruckTotal();
    await loadSettings();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ─── PIN RESET ───────────────────────────────────────────────────────────────
function onResetMethodChange() {
  const method = document.getElementById('resetMethod').value;
  document.getElementById('resetMethod_recoveryKey').style.display = method === 'recoveryKey' ? '' : 'none';
  document.getElementById('resetMethod_secretQuestion').style.display = method === 'secretQuestion' ? '' : 'none';
  document.getElementById('resetMethod_partialPin').style.display = method === 'partialPin' ? '' : 'none';
}

async function loadSecurityQuestion() {
  const el = document.getElementById('secretQuestionText');
  if (!el) return;
  try {
    const data = await API.get('/api/settings/security-question');
    el.textContent = data.question || 'No recovery question has been set up yet — use another method.';
  } catch {
    el.textContent = 'Could not load the recovery question — use another method.';
  }
}

async function resetPin() {
  const method = document.getElementById('resetMethod').value;
  const newPin = document.getElementById('resetNewPin').value.trim();
  if (!newPin) return showToast('Enter a new PIN', 'error');
  if (newPin.length < 4) return showToast('PIN must be at least 4 characters', 'error');

  const body = { method, newPin };

  if (method === 'recoveryKey') {
    const recoveryKey = document.getElementById('recoveryKey').value.trim();
    if (!recoveryKey) return showToast('Enter the recovery key', 'error');
    body.recoveryKey = recoveryKey;
  } else if (method === 'secretQuestion') {
    const secretAnswer = document.getElementById('secretAnswer').value.trim();
    if (!secretAnswer) return showToast('Enter your answer', 'error');
    body.secretAnswer = secretAnswer;
  } else if (method === 'partialPin') {
    const partialPin = document.getElementById('partialPin').value.trim();
    if (!partialPin) return showToast('Enter the digits you remember', 'error');
    body.partialPin = partialPin;
  }

  try {
    await API.post('/api/settings/pin/reset', body);
    showToast('PIN has been reset — you are now logged in', 'success');
    document.getElementById('recoveryKey').value = '';
    document.getElementById('secretAnswer').value = '';
    document.getElementById('partialPin').value = '';
    document.getElementById('resetNewPin').value = '';
    window._isAdminCached = true;
    updateAdminUI();
  } catch (err) {
    showToast(err.message || 'Failed to reset PIN', 'error');
  }
}

async function saveSecurityQuestion() {
  const question = document.getElementById('newSecurityQuestion').value.trim();
  const answer = document.getElementById('newSecurityAnswer').value.trim();
  if (!question || !answer) return showToast('Enter both a question and an answer', 'error');

  try {
    await API.put('/api/settings/security-question', { question, answer });
    showToast('Recovery question saved', 'success');
    document.getElementById('newSecurityQuestion').value = '';
    document.getElementById('newSecurityAnswer').value = '';
    loadSecurityQuestion();
  } catch (err) {
    showToast(err.message || 'Failed to save recovery question', 'error');
  }
}

document.addEventListener('DOMContentLoaded', loadSettings);
document.addEventListener('DOMContentLoaded', loadSecurityQuestion);

document.addEventListener('DOMContentLoaded', () => {
  const uploadBtn = document.getElementById('uploadReferenceBtn');
  if (uploadBtn) uploadBtn.addEventListener('click', uploadReferenceFiles);

  const fileInput = document.getElementById('referenceFileInput');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      const defaultCategory = document.getElementById('referenceCategoryInput')?.value || 'General';
      const defaultSubheading = document.getElementById('referenceSubheadingInput')?.value?.trim() || '';
      pendingReferenceUploads = files.map(file => {
        const inferred = inferCategoryAndSubheading(file.name);
        return {
          file,
          category: defaultCategory !== 'General' ? defaultCategory : inferred.category,
          subheading: defaultSubheading || inferred.subheading
        };
      });
      renderPendingReferenceUploads();
    });
  }

  const filterCategory = document.getElementById('referenceFilterCategory');
  const filterSearch = document.getElementById('referenceFilterSearch');
  const filterClear = document.getElementById('referenceFilterClearBtn');

  if (filterCategory) {
    filterCategory.addEventListener('change', () => {
      referenceFileFilter.category = filterCategory.value || 'all';
      renderReferenceFiles();
    });
  }

  if (filterSearch) {
    filterSearch.addEventListener('input', () => {
      referenceFileFilter.search = filterSearch.value || '';
      renderReferenceFiles();
    });
  }

  if (filterClear) {
    filterClear.addEventListener('click', () => {
      referenceFileFilter = { category: 'all', search: '' };
      if (filterCategory) filterCategory.value = 'all';
      if (filterSearch) filterSearch.value = '';
      renderReferenceFiles();
    });
  }

  const modal = document.getElementById('referenceViewerModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeReferenceViewer();
    });
  }

  const metaModal = document.getElementById('referenceMetaModal');
  if (metaModal) {
    metaModal.addEventListener('click', (e) => {
      if (e.target === metaModal) closeReferenceMetaModal();
    });
  }
});

// Auto-refresh when tab gains focus
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') loadSettings();
});