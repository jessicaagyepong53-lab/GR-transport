// ─── RECOVERY BIN PAGE ───────────────────────────────────────────────────────
// Loads trashed items from API, renders cards, supports restore/delete/purge.

let trashItems = [];

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => t.className = 'toast', 2600);
}

function fmt(n) {
  if (n >= 1000000) return 'GHS ' + (n/1000000).toFixed(2) + 'M';
  if (n >= 1000) return 'GHS ' + (n/1000).toFixed(0) + 'K';
  return 'GHS ' + n.toLocaleString();
}

// ─── LOAD TRASH ──────────────────────────────────────────────────────────────
async function loadTrash() {
  try {
    trashItems = await API.get('/api/recovery');
  } catch (err) {
    // Fallback to localStorage
    try {
      const raw = localStorage.getItem('transport_dashboard_trash');
      trashItems = raw ? JSON.parse(raw) : [];
    } catch (e) {
      trashItems = [];
    }
    // Also check truck_recovery
    try {
      const raw2 = localStorage.getItem('truck_recovery');
      if (raw2) {
        const items = JSON.parse(raw2);
        items.forEach(item => {
          trashItems.push({
            _id: item.id || Date.now(),
            type: item.type || 'unknown',
            label: item.data?.truckId || item.data?.year || 'Unknown',
            data: item.data,
            deletedAt: item.deletedAt,
            daysLeft: Math.max(0, 30 - Math.floor((Date.now() - new Date(item.deletedAt).getTime()) / (24*60*60*1000)))
          });
        });
      }
    } catch (e) { /* ignore */ }
  }
}

// ─── RENDER TRASH ────────────────────────────────────────────────────────────
function renderTrash() {
  const list = document.getElementById('trashList');
  const countEl = document.getElementById('trashCount');
  const purgeBtn = document.getElementById('purgeBtn');

  countEl.innerHTML = `<i class="fa-solid fa-trash" aria-hidden="true"></i>${trashItems.length} deleted item${trashItems.length !== 1 ? 's' : ''}`;
  if (purgeBtn) purgeBtn.style.display = trashItems.length > 0 ? '' : 'none';

  if (trashItems.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <i class="fa-solid fa-check-circle" aria-hidden="true"></i>
      <p>Recovery bin is empty — nothing to restore.</p>
    </div>`;
    return;
  }

  list.innerHTML = trashItems.map(item => {
    const daysLeft = item.daysLeft != null ? item.daysLeft : 30;
    const daysClass = daysLeft <= 5 ? 'days-left' : daysLeft <= 15 ? 'days-warn' : 'days-ok';
    const typeClass = item.type === 'truck' ? 'truck' : item.type === 'yearEntry' ? 'entry' : 'year';
    const typeLabel = item.type === 'truck' ? 'Truck' : item.type === 'yearEntry' ? 'Year Entry' : item.type;
    const dateStr = new Date(item.deletedAt).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });

    let detail = '';
    if (item.type === 'truck' && item.data?.truck) {
      const t = item.data.truck;
      const years = item.data.yearEntries?.length || 0;
      detail = `Driver: <span>${t.driver || '—'}</span> · ${years} year entries`;
    } else if (item.type === 'yearEntry' && item.data) {
      detail = `Gross: <span>${fmt(item.data.gross || 0)}</span> · Exp: <span>${fmt(item.data.exp || 0)}</span> · Net: <span>${fmt(item.data.net || 0)}</span>`;
    } else if (item.data) {
      detail = JSON.stringify(item.data).slice(0, 120);
    }

    return `<div class="trash-card">
      <div class="trash-info">
        <div class="trash-type ${typeClass}">${typeLabel}</div>
        <div class="trash-label">${item.label || '—'}</div>
        <div class="trash-detail">${detail}</div>
      </div>
      <div class="trash-meta">
        <div>Deleted: ${dateStr}</div>
        <div class="${daysClass}"><i class="fa-solid fa-clock"></i>${daysLeft} days left</div>
      </div>
      <div class="trash-actions"${!isAdmin() ? ' style="display:none"' : ''}>
        <button class="btn btn-recover" onclick="restoreItem('${item._id}')">
          <i class="fa-solid fa-rotate-left"></i>Restore
        </button>
        <button class="btn btn-danger" onclick="deleteItem('${item._id}')">
          <i class="fa-solid fa-trash"></i>Delete
        </button>
      </div>
    </div>`;
  }).join('');
}

// ─── ACTIONS ─────────────────────────────────────────────────────────────────
async function restoreItem(id) {
  try {
    await API.post(`/api/recovery/${id}/restore`, {});
    showToast('Item restored successfully', 'success');
    await loadTrash();
    renderTrash();
  } catch (err) {
    showToast('Error restoring: ' + err.message, '');
  }
}

async function deleteItem(id) {
  if (!confirm('Permanently delete this item? This cannot be undone.')) return;
  try {
    await API.del(`/api/recovery/${id}`);
    showToast('Item permanently deleted', 'info');
    await loadTrash();
    renderTrash();
  } catch (err) {
    showToast('Error deleting: ' + err.message, '');
  }
}

async function purgeAll() {
  if (!confirm('Permanently delete ALL items in the recovery bin? This cannot be undone.')) return;
  try {
    await API.del('/api/recovery');
    showToast('Recovery bin emptied', 'info');
    await loadTrash();
    renderTrash();
  } catch (err) {
    showToast('Error purging: ' + err.message, '');
  }
}

// ─── INIT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadTrash();
  renderTrash();

  const admin = await checkAdmin();
  if (!admin) {
    document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
  }
});
