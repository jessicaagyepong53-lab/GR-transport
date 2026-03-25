// ─── AUTH MODAL ──────────────────────────────────────────────────────────────
// Renders a PIN entry modal. Call showPinModal() from any page.

function isAdmin() {
  return window._isAdminCached === true;
}

async function refreshAdminStatus() {
  try {
    const data = await API.get('/api/auth/status');
    window._isAdminCached = data.isAdmin === true;
  } catch {
    window._isAdminCached = false;
  }
  updateAdminUI();
  return window._isAdminCached;
}

function updateAdminUI() {
  const admin = isAdmin();
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.style.display = admin ? '' : 'none';
  });

  const lockBtn = document.getElementById('adminLockBtn');
  if (lockBtn) {
    lockBtn.innerHTML = admin
      ? '<i class="fa-solid fa-lock-open"></i> Admin'
      : '<i class="fa-solid fa-lock"></i> Login';
    lockBtn.title = admin ? 'Click to logout' : 'Click to enter admin PIN';
    lockBtn.onclick = admin ? handleLogout : showPinModal;
  }
}

async function handleLogout() {
  try {
    await API.post('/api/auth/logout', {});
    window._isAdminCached = false;
    updateAdminUI();
  } catch { /* ignore */ }
}

function showPinModal() {
  let modal = document.getElementById('pinModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'pinModal';
    modal.innerHTML = `
      <style>
        #pinModal { display:none; position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.7); align-items:center; justify-content:center; }
        #pinModal.open { display:flex; }
        #pinModal .pin-card {
          background:#1a1f2b; border:1px solid #252d3d; border-radius:16px;
          padding:32px; width:320px; max-width:90vw; text-align:center;
        }
        #pinModal h3 { font-family:'Bebas Neue',sans-serif; font-size:1.5rem; color:#f5a623; letter-spacing:2px; margin-bottom:16px; }
        #pinModal input {
          width:100%; padding:12px; font-size:1.2rem; text-align:center;
          letter-spacing:8px; border:1px solid #252d3d; border-radius:8px;
          background:#0a0c10; color:#e8ecf4; margin-bottom:16px;
        }
        #pinModal input:focus { border-color:#f5a623; outline:none; }
        #pinModal .pin-btns { display:flex; gap:10px; justify-content:center; }
        #pinModal .pin-btn {
          padding:10px 24px; border-radius:8px; font-size:0.85rem; font-weight:600;
          cursor:pointer; border:1px solid #252d3d; transition:all 0.2s;
        }
        #pinModal .pin-submit { background:#f5a623; border-color:#f5a623; color:#0a0c10; }
        #pinModal .pin-submit:hover { background:#ffb940; }
        #pinModal .pin-cancel { background:#181c24; color:#9aa4b8; }
        #pinModal .pin-cancel:hover { border-color:#f5a623; color:#f5a623; }
        #pinModal .pin-error { color:#e0443a; font-size:0.8rem; margin-top:8px; min-height:1.2em; }
      </style>
      <div class="pin-card">
        <h3><i class="fa-solid fa-lock" style="margin-right:8px"></i>Admin Login</h3>
        <input type="password" id="pinInput" maxlength="20" placeholder="Enter PIN" autocomplete="off">
        <div class="pin-btns">
          <button class="pin-btn pin-submit" onclick="submitPin()">Unlock</button>
          <button class="pin-btn pin-cancel" onclick="closePinModal()">Cancel</button>
        </div>
        <div class="pin-error" id="pinError"></div>
      </div>
    `;
    document.body.appendChild(modal);
    // Close on backdrop click
    modal.addEventListener('click', e => { if (e.target === modal) closePinModal(); });
  }
  modal.classList.add('open');
  document.getElementById('pinInput').value = '';
  document.getElementById('pinError').textContent = '';
  setTimeout(() => document.getElementById('pinInput').focus(), 100);
}

function closePinModal() {
  const modal = document.getElementById('pinModal');
  if (modal) modal.classList.remove('open');
}

async function submitPin() {
  const input = document.getElementById('pinInput');
  const error = document.getElementById('pinError');
  const pin = input.value.trim();
  if (!pin) { error.textContent = 'Please enter a PIN'; return; }

  try {
    await verifyPin(pin);
    window._isAdminCached = true;
    closePinModal();
    updateAdminUI();
  } catch (err) {
    error.textContent = err.message || 'Invalid PIN';
    input.value = '';
    input.focus();
  }
}

// Enter key support
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && document.getElementById('pinModal')?.classList.contains('open')) {
    submitPin();
  }
});

// Init: check admin status on load
document.addEventListener('DOMContentLoaded', async () => {
  await refreshAdminStatus();

  // Inject admin lock button into header if not already present
  if (!document.getElementById('adminLockBtn')) {
    const header = document.querySelector('.header');
    if (header) {
      const btn = document.createElement('button');
      btn.id = 'adminLockBtn';
      btn.style.cssText = 'padding:8px 16px;border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;border:1px solid #252d3d;background:#181c24;color:#9aa4b8;transition:all 0.2s;display:flex;align-items:center;gap:6px;';
      header.appendChild(btn);
      updateAdminUI();
    }
  }
});
