// --- CONCRETE MIXER NAVIGATION --------------------------------------------
// Equipment pages use their own blue/black navigation, separate from transport.
//
// ACCESS GATE: all-equipment.html is the only Equipment Hire page a direct
// link/bookmark should ever land on. Every other mixer page (mixers.html,
// mixer-reports.html, mixer-recovery.html, mixer-settings.html) requires
// either ?dash=1 in the URL or a same-flagged referrer — otherwise it
// redirects to all-equipment.html before anything renders. This is a
// routing convenience, not a security boundary: the real write protection
// is still the mixer PIN (requireMixerAdmin) enforced server-side.

(function() {
  const GATED_PAGES = ['mixers.html', 'mixer-reports.html', 'mixer-recovery.html', 'mixer-settings.html', 'mixer-clients.html'];

  function cameFromTransportReferrer() {
    try { return new URL(document.referrer).searchParams.get('dash') === '1'; } catch { return false; }
  }

  function enforceAccessGate() {
    const currentFile = window.location.pathname.split('/').pop() || 'all-equipment.html';
    if (!GATED_PAGES.includes(currentFile)) return false; // all-equipment.html or unknown — never gated
    const params = new URLSearchParams(window.location.search);
    const authorized = params.get('dash') === '1' || cameFromTransportReferrer();
    if (!authorized) {
      window.location.replace('all-equipment.html');
      return true; // redirecting — caller should stop building the page chrome
    }
    return false;
  }

  // Run the gate check immediately, before the nav or page content builds,
  // so a restricted page never flashes on screen for an unauthorized visitor.
  if (enforceAccessGate()) return;

  const navItems = [
    { href: 'all-equipment.html', icon: 'fa-list-check', label: 'All Equipment' },
    { href: 'mixer-reports.html', icon: 'fa-file-export', label: 'Reports' },
    { href: 'mixer-clients.html', icon: 'fa-users', label: 'Client History' },
    { href: 'mixer-recovery.html', icon: 'fa-trash-can-arrow-up', label: 'Recovery' },
    { href: 'mixer-settings.html', icon: 'fa-gear', label: 'Settings' },
  ];

  function createNav() {
    const params = new URLSearchParams(window.location.search);
    const currentCategory = params.get('category');
    const fromTransport = params.get('dash') === '1' || cameFromTransportReferrer();
    const currentFile = window.location.pathname.split('/').pop() || 'mixers.html';
    // A direct/unauthorized visitor (no ?dash=1) only ever sees "All Equipment"
    // in the sidebar — the gated pages aren't even offered as links, matching
    // the fact that clicking them would just bounce back here anyway.
    const visibleNavItems = fromTransport
      ? [{ href: 'mixers.html', icon: 'fa-toolbox', label: 'Equipment Hire' }, ...navItems]
      : [navItems[0]];
    if (!document.getElementById('mixerFont')) {
      const font = document.createElement('link');
      font.id = 'mixerFont';
      font.rel = 'stylesheet';
      font.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap';
      document.head.appendChild(font);
    }
    const nav = document.createElement('nav');
    nav.id = 'mixerNav';
    nav.innerHTML = `
      <style>
        body.has-mixer-nav { font-family: 'Space Grotesk', sans-serif; }
        body.has-mixer-nav button, body.has-mixer-nav input, body.has-mixer-nav select, body.has-mixer-nav textarea { font-family: 'Space Grotesk', sans-serif; }
        body.has-mixer-nav .title,
        body.has-mixer-nav .page-title,
        body.has-mixer-nav .section-title,
        body.has-mixer-nav .section-heading h2,
        body.has-mixer-nav .card-title,
        body.has-mixer-nav .kpi-value,
        body.has-mixer-nav h1,
        body.has-mixer-nav h2,
        body.has-mixer-nav h3 { font-family: 'Space Grotesk', sans-serif; letter-spacing: 0; font-weight: 700; }
        #mixerCategoryTabs { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 16px; }
        #mixerCategoryTabs button { display:inline-flex; align-items:center; gap:7px; padding:9px 14px; border:1px solid #1e3550; border-radius:7px; background:#111a26; color:#7890aa; cursor:pointer; font-size:.78rem; font-weight:600; }
        #mixerCategoryTabs button:hover, #mixerCategoryTabs button.active { background:rgba(74,158,255,.14); border-color:#4a9eff; color:#70b5ff; }
        body.has-mixer-nav .report-actions { flex-wrap: nowrap; align-items: center; }
        body.has-mixer-nav .report-btn { white-space: nowrap; }
        body.has-mixer-nav { background: #070b12; color: #e8f1fb; }
        body.has-mixer-nav::before { content:''; position:fixed; inset:0; pointer-events:none; z-index:0; opacity:.55; background-image: linear-gradient(rgba(74,158,255,.035) 1px,transparent 1px), linear-gradient(90deg,rgba(74,158,255,.035) 1px,transparent 1px), radial-gradient(circle at 78% -8%,rgba(74,158,255,.16),transparent 30%); background-size:42px 42px,42px 42px,100% 100%; }
        body.has-mixer-nav .wrapper { max-width: 1480px; padding: 34px 38px 54px; }
        body.has-mixer-nav .header { border-bottom-color: #1b3653; }
        body.has-mixer-nav .page-title, body.has-mixer-nav .title { color: #70b5ff; background: linear-gradient(110deg,#70b5ff,#d9efff 72%); background-clip:text; -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
        body.has-mixer-nav .page-subtitle, body.has-mixer-nav .subtitle { color: #7890aa; }
        body.has-mixer-nav .kpi, body.has-mixer-nav .eq-card, body.has-mixer-nav .contract-row, body.has-mixer-nav .card, body.has-mixer-nav .chart-card, body.has-mixer-nav .table-wrap, body.has-mixer-nav .panel { background: rgba(15,26,40,.88); border-color: #1c3856; box-shadow: 0 14px 35px rgba(0,0,0,.16); }
        body.has-mixer-nav .kpi:hover, body.has-mixer-nav .eq-card:hover { border-color: rgba(74,158,255,.7); }
        body.has-mixer-nav .btn, body.has-mixer-nav .button, body.has-mixer-nav .back, body.has-mixer-nav .export-btn { border-color:#24476b; background:#102237; color:#b8d8f4; }
        body.has-mixer-nav .btn:hover, body.has-mixer-nav .button:hover, body.has-mixer-nav .back:hover, body.has-mixer-nav .export-btn:hover { border-color:#4a9eff; color:#70b5ff; background:#142c46; }
        body.has-mixer-nav .btn-primary { background:#4a9eff; border-color:#4a9eff; color:#06101c; }
        body.has-mixer-nav .btn-primary:hover { background:#70b5ff; color:#06101c; }
        body.has-mixer-nav input, body.has-mixer-nav select, body.has-mixer-nav textarea { background:#091522; border-color:#24476b; color:#e8f1fb; }
        body.has-mixer-nav input:focus, body.has-mixer-nav select:focus, body.has-mixer-nav textarea:focus { outline:none; border-color:#4a9eff; box-shadow:0 0 0 3px rgba(74,158,255,.12); }
        body.has-mixer-nav .section-heading, body.has-mixer-nav .section-title { color:#d9efff; }
        body.has-mixer-nav table th { color:#7890aa; }
        body.has-mixer-nav table td { border-bottom-color:rgba(28,56,86,.72); }
        body.has-mixer-nav .empty-state { background:rgba(9,21,34,.7); border-color:#24476b; }
        body.has-mixer-nav .footer-note { color:#526f8d; }
        body.has-mixer-nav .logo-mark, body.has-mixer-nav .logo { box-shadow:0 10px 24px rgba(37,126,221,.24); }
        body.has-mixer-nav .notif-row, body.has-mixer-nav .info-banner { box-shadow:0 10px 24px rgba(0,0,0,.12); }
        body.has-mixer-nav .year-tab, body.has-mixer-nav .tab { background:#0e1d2d; border-color:#24476b; color:#7890aa; }
        body.has-mixer-nav .year-tab:hover, body.has-mixer-nav .year-tab.active, body.has-mixer-nav .tab:hover, body.has-mixer-nav .tab.active { background:#17416b; border-color:#4a9eff; color:#d9efff; }
        @media (max-width:900px) { body.has-mixer-nav .wrapper { padding:24px 16px 42px; } }
        body.has-mixer-nav .wrapper { margin-left: 236px; }
        body.mixer-nav-collapsed.has-mixer-nav .wrapper { margin-left: 0; }
        #mixerNav {
          position: fixed; top: 0; left: 0; bottom: 0; width: 236px;
          background: #080b10; border-right: 1px solid #1e3550;
          z-index: 1000; display: flex; flex-direction: column;
          padding: 20px 0; transition: transform 0.3s;
        }
        #mixerNav .mixer-nav-brand {
          padding: 0 18px 18px; border-bottom: 1px solid #1e3550; margin-bottom: 12px;
          font-family: 'Space Grotesk', sans-serif; font-size: 1.05rem; letter-spacing: 0; font-weight: 700;
          color: #4a9eff; display: flex; align-items: center; gap: 10px;
        }
        #mixerNav .mixer-nav-brand i { font-size: 1.1rem; }
        #mixerNav .mixer-nav-links { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 0 8px; }
        #mixerNav .mixer-nav-link {
          display: flex; align-items: center; gap: 10px; padding: 10px 14px;
          border-radius: 8px; font-size: 0.8rem; font-weight: 500;
          color: #8ca2bd; text-decoration: none; transition: all 0.2s;
        }
        #mixerNav .mixer-nav-link:hover { background: rgba(74,158,255,0.1); color: #70b5ff; }
        #mixerNav .mixer-nav-link.active { background: rgba(74,158,255,0.16); color: #70b5ff; font-weight: 600; }
        #mixerNav .mixer-nav-link i { width: 18px; text-align: center; font-size: 0.9rem; }
        #mixerNav .mixer-nav-auth { padding: 12px 8px; border-top: 1px solid #1e3550; margin-top: auto; }
        #mixerNav .mixer-nav-auth-btn {
          display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px 14px;
          border-radius: 8px; font-size: 0.8rem; font-weight: 500; color: #8ca2bd;
          background: none; border: 1px solid #1e3550; cursor: pointer; transition: all 0.2s;
          font-family: 'DM Sans', sans-serif;
        }
        #mixerNav .mixer-nav-auth-btn:hover { background: rgba(74,158,255,0.1); color: #70b5ff; border-color: #4a9eff; }
        #mixerNav .mixer-nav-auth-btn.logged-in { color: #ff756c; border-color: rgba(224,68,58,0.45); background: rgba(224,68,58,0.08); }
        #mixerNav .mixer-nav-auth-btn.logged-in:hover { color: #ffaaa4; border-color: #e0443a; background: rgba(224,68,58,0.16); }
        #mixerQuickPinModal { display:none; position:fixed; inset:0; z-index:3000; align-items:center; justify-content:center; background:rgba(0,0,0,.72); }
        #mixerQuickPinModal.open { display:flex; }
        #mixerQuickPinModal .mixer-quick-card { width:330px; max-width:calc(100vw - 32px); padding:24px; border:1px solid #24476b; border-radius:14px; background:#0f1a28; box-shadow:0 24px 70px rgba(0,0,0,.45); }
        #mixerQuickPinModal h2 { margin:0 0 8px; color:#70b5ff; font-size:1.2rem; }
        #mixerQuickPinModal p { margin:0 0 16px; color:#7890aa; font-size:.8rem; }
        #mixerQuickPinModal input { width:100%; padding:11px; border:1px solid #24476b; border-radius:7px; background:#091522; color:#e8f1fb; box-sizing:border-box; }
        #mixerQuickPinModal .mixer-quick-actions { display:flex; gap:8px; justify-content:flex-end; margin-top:14px; }
        #mixerQuickPinModal button { border:1px solid #24476b; border-radius:7px; padding:9px 13px; background:#102237; color:#b8d8f4; cursor:pointer; font-family:'Space Grotesk',sans-serif; }
        #mixerQuickPinModal .mixer-quick-submit { border-color:#4a9eff; background:#4a9eff; color:#06101c; font-weight:700; }
        #mixerQuickPinModal .mixer-quick-error { min-height:18px; margin-top:8px; color:#e0443a; font-size:.75rem; }
        #mixerNav .mixer-nav-footer { padding: 10px 18px 0; font-size: 0.66rem; color: #4e6680; text-align: center; }
        body.mixer-nav-collapsed #mixerNav { transform: translateX(-100%); }
        body.mixer-nav-collapsed #mixerNavToggle { display: flex; }
        @media (max-width: 900px) {
          body.has-mixer-nav .wrapper { margin-left: 0; }
          #mixerNav { transform: translateX(-100%); }
          #mixerNav.open { transform: translateX(0); box-shadow: 4px 0 24px rgba(0,0,0,0.55); }
          #mixerNavToggle { display: flex; }
        }
        #mixerNavToggle {
          display: none; position: fixed; top: 12px; left: 12px; z-index: 1001;
          width: 40px; height: 40px; border-radius: 8px; background: #111a26;
          border: 1px solid #1e3550; color: #4a9eff; font-size: 1.1rem; cursor: pointer;
          align-items: center; justify-content: center;
        }
      </style>
      <div class="mixer-nav-brand"><i class="fa-solid fa-toolbox" title="Close equipment navigation"></i>GR Equipment</div>
      <div class="mixer-nav-links">
        ${[...visibleNavItems, ...(fromTransport ? [{ href: 'index.html', icon: 'fa-arrow-left', label: 'Transport Dashboard', transport: true }] : [])].map(item => {
          const itemCategory = new URL(item.href, window.location.href).searchParams.get('category');
          const itemFile = new URL(item.href, window.location.href).pathname.split('/').pop();
          const active = itemFile === currentFile && ((itemCategory || null) === (currentCategory || null)) ? 'active' : '';
          const target = fromTransport && !item.transport ? `${item.href}${item.href.includes('?') ? '&' : '?'}dash=1` : item.href;
          const transportLogout = item.transport ? ' data-transport-return' : '';
          return `<a href="${target}" class="mixer-nav-link ${active}"${transportLogout}><i class="fa-solid ${item.icon}"></i>${item.label}</a>`;
        }).join('')}
      </div>
      <div class="mixer-nav-auth">
        <button class="mixer-nav-auth-btn" id="mixerNavAuthBtn"><i class="fa-solid fa-lock"></i><span>Equipment Hire Login</span></button>
      </div>
      <div class="mixer-nav-footer">&copy; 2026 GR Equipment</div>
    `;

    const toggle = document.createElement('button');
    toggle.id = 'mixerNavToggle';
    toggle.title = 'Open equipment navigation';
    toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
    toggle.onclick = () => {
      if (document.body.classList.contains('mixer-nav-collapsed')) {
        document.body.classList.remove('mixer-nav-collapsed');
        return;
      }
      nav.classList.toggle('open');
    };

    document.body.prepend(nav);
    document.body.prepend(toggle);
    document.body.classList.add('has-mixer-nav');
    const authButton = nav.querySelector('#mixerNavAuthBtn');
    if (authButton) authButton.onclick = () => {
      if (typeof showMixerPinModal === 'function') showMixerPinModal();
      else showStandaloneMixerLogin();
    };
    refreshStandaloneMixerAuth();

    nav.querySelector('.mixer-nav-brand i').addEventListener('click', () => {
      if (window.innerWidth <= 900) {
        nav.classList.remove('open');
        return;
      }
      document.body.classList.add('mixer-nav-collapsed');
    });

    nav.querySelectorAll('.mixer-nav-link').forEach(link => {
      link.addEventListener('click', () => nav.classList.remove('open'));
    });
    const transportReturn = nav.querySelector('[data-transport-return]');
    if (transportReturn) transportReturn.addEventListener('click', async event => {
      event.preventDefault();
      try { await fetch('/api/mixer-auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
      window.location.href = transportReturn.href;
    });

    if (currentFile === 'all-equipment.html') setupAllEquipmentCategories();
  }

  function showStandaloneMixerLogin() {
    let modal = document.getElementById('mixerQuickPinModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'mixerQuickPinModal';
      modal.innerHTML = '<div class="mixer-quick-card"><h2>Equipment Hire Login</h2><p>Enter the separate PIN for equipment hire editing.</p><input id="mixerQuickPin" type="password" autocomplete="off" placeholder="Equipment Hire PIN"><div id="mixerQuickError" class="mixer-quick-error"></div><div class="mixer-quick-actions"><button type="button" id="mixerQuickCancel">Cancel</button><button type="button" class="mixer-quick-submit" id="mixerQuickSubmit">Unlock</button></div></div>';
      document.body.appendChild(modal);
      const close = () => modal.classList.remove('open');
      const submit = async () => {
        const input = document.getElementById('mixerQuickPin');
        const error = document.getElementById('mixerQuickError');
        try {
          const response = await fetch('/api/mixer-auth/verify', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify({ pin: input.value.trim() }) });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Invalid mixer PIN');
          close();
          window.location.reload();
        } catch (err) { error.textContent = err.message; input.select(); }
      };
      document.getElementById('mixerQuickCancel').onclick = close;
      document.getElementById('mixerQuickSubmit').onclick = submit;
      document.getElementById('mixerQuickPin').onkeydown = event => { if (event.key === 'Enter') submit(); };
    }
    modal.classList.add('open');
    const input = document.getElementById('mixerQuickPin');
    input.value = '';
    document.getElementById('mixerQuickError').textContent = '';
    input.focus();
  }

  async function refreshStandaloneMixerAuth() {
    const button = document.getElementById('mixerNavAuthBtn');
    if (!button) return;
    try {
      const response = await fetch('/api/mixer-auth/status', { credentials: 'include' });
      const data = await response.json();
      if (data.isAdmin) {
        button.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i><span>Equipment Hire Logout</span>';
        button.classList.add('logged-in');
        button.onclick = async () => {
          await fetch('/api/mixer-auth/logout', { method: 'POST', credentials: 'include' });
          window.location.reload();
        };
      } else {
        button.innerHTML = '<i class="fa-solid fa-lock"></i><span>Equipment Hire Login</span>';
        button.classList.remove('logged-in');
        button.onclick = () => {
          if (typeof showMixerPinModal === 'function') showMixerPinModal();
          else showStandaloneMixerLogin();
        };
      }
    } catch {}
  }

  window.showStandaloneMixerLogin = showStandaloneMixerLogin;
  window.refreshStandaloneMixerAuth = refreshStandaloneMixerAuth;

  function setupAllEquipmentCategories() {
    const controls = document.querySelector('.controls');
    const categorySelect = document.getElementById('category');
    if (!controls || !categorySelect || document.getElementById('mixerCategoryTabs')) return;
    const tabs = document.createElement('div');
    tabs.id = 'mixerCategoryTabs';
    tabs.innerHTML = [
      ['all', 'fa-layer-group', 'All Equipment'],
      ['mixer', 'fa-truck-ramp-box', 'Concrete Mixers'],
      ['scaffold', 'fa-ruler-vertical', 'Scaffold'],
      ['compactor', 'fa-weight-hanging', 'Compactors'],
      ['gutter-mould', 'fa-water', 'Gutter Moulds'],
    ].map(([value, icon, label]) => `<button type="button" data-category="${value}"><i class="fa-solid ${icon}"></i>${label}</button>`).join('');
    controls.parentNode.insertBefore(tabs, controls);
    const sync = () => {
      tabs.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.category === categorySelect.value));
    };
    tabs.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      categorySelect.value = button.dataset.category;
      categorySelect.dispatchEvent(new Event('change'));
      sync();
    }));
    categorySelect.addEventListener('change', sync);
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createNav);
  } else {
    createNav();
  }
})();