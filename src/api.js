// ─── API CLIENT ──────────────────────────────────────────────────────────────
// Shared fetch wrapper used by all pages to communicate with the backend.

const API = {
  base: '',  // Same origin

  async get(path) {
    const res = await fetch(this.base + path, { credentials: 'include' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async post(path, body) {
    const res = await fetch(this.base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async put(path, body) {
    const res = await fetch(this.base + path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  },

  async del(path) {
    const res = await fetch(this.base + path, {
      method: 'DELETE',
      credentials: 'include'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }
};

// Auth helpers
async function checkAdmin() {
  try {
    const data = await API.get('/api/auth/status');
    return data.isAdmin === true;
  } catch {
    return false;
  }
}

async function verifyPin(pin) {
  return API.post('/api/auth/verify', { pin });
}

async function logoutAdmin() {
  return API.post('/api/auth/logout', {});
}
