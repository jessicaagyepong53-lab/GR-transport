// ─── AUTH MODULE ──────────────────────────────────────────────────────────────
// Shared authentication / admin check used by sub-pages (truck, year, recovery).
// Currently always returns true (single-user mode). Replace with real auth
// logic if needed (e.g. PIN check, localStorage flag, etc.).

function isAdmin() {
  return true;
}

// Hide elements with [data-admin-only] when not admin
document.addEventListener('DOMContentLoaded', function() {
  if (!isAdmin()) {
    document.querySelectorAll('[data-admin-only]').forEach(function(el) {
      el.style.display = 'none';
    });
  }
});
