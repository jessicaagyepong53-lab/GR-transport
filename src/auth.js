// ─── AUTH MODULE ──────────────────────────────────────────────────────────────
// Shared authentication check used by sub-pages (truck, year).
// Checks server session via /api/auth/status and hides admin-only controls.

function isAdmin() {
  return window._isAdminCached === true;
}

function updateAdminUI() {
  const admin = isAdmin();
  document.querySelectorAll('[data-admin-only]').forEach(function(el) {
    el.style.display = admin ? '' : 'none';
  });
  // Disable/enable editable inputs
  document.querySelectorAll('[data-admin-input]').forEach(function(el) {
    el.disabled = !admin;
    el.style.opacity = admin ? '' : '0.5';
  });
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    const res = await fetch('/api/auth/status', { credentials: 'include' });
    const data = await res.json();
    window._isAdminCached = data.isAdmin === true;
  } catch (e) {
    window._isAdminCached = false;
  }
  updateAdminUI();
});
