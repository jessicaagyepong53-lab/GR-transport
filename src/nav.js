// ─── SHARED NAVIGATION ───────────────────────────────────────────────────────
// Injects a consistent sidebar/nav into all pages.

(function() {
  const NAV_ITEMS = [
    { href: 'index.html', icon: 'fa-chart-pie', label: 'Dashboard' },
    { href: 'weekly.html', icon: 'fa-calendar-week', label: 'Weekly Entry' },
    { href: 'reports.html', icon: 'fa-file-export', label: 'Reports' },
    { href: 'recovery.html', icon: 'fa-trash-can-arrow-up', label: 'Recovery' },
    { href: 'settings.html', icon: 'fa-gear', label: 'Settings' },
  ];

  function getCurrentPage() {
    const path = window.location.pathname;
    const file = path.split('/').pop() || 'index.html';
    return file;
  }

  function createNav() {
    const current = getCurrentPage();
    const nav = document.createElement('nav');
    nav.id = 'siteNav';
    nav.innerHTML = `
      <style>
        #siteNav {
          position: fixed; top: 0; left: 0; bottom: 0; width: 220px;
          background: #111418; border-right: 1px solid #252d3d;
          z-index: 1000; display: flex; flex-direction: column;
          padding: 20px 0; transition: transform 0.3s;
        }
        #siteNav .nav-brand {
          padding: 0 18px 18px; border-bottom: 1px solid #252d3d; margin-bottom: 12px;
          font-family: 'Bebas Neue', sans-serif; font-size: 1.3rem; letter-spacing: 2px;
          color: #f5a623; display: flex; align-items: center; gap: 10px;
        }
        #siteNav .nav-brand i { font-size: 1.1rem; }
        #siteNav .nav-links { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 0 8px; }
        #siteNav .nav-link {
          display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border-radius: 8px; font-size: 0.82rem;
          font-weight: 500; color: #9aa4b8; text-decoration: none;
          transition: all 0.2s; letter-spacing: 0.3px;
        }
        #siteNav .nav-link:hover { background: rgba(245,166,35,0.08); color: #f5a623; }
        #siteNav .nav-link.active { background: rgba(245,166,35,0.12); color: #f5a623; font-weight: 600; }
        #siteNav .nav-link i { width: 18px; text-align: center; font-size: 0.9rem; }
        #siteNav .nav-auth {
          padding: 12px 8px; border-top: 1px solid #252d3d; margin-top: auto;
        }
        #siteNav .nav-auth-btn {
          display: flex; align-items: center; gap: 10px; width: 100%;
          padding: 10px 14px; border-radius: 8px; font-size: 0.82rem;
          font-weight: 500; color: #9aa4b8; background: none; border: 1px solid #252d3d;
          cursor: pointer; transition: all 0.2s; letter-spacing: 0.3px;
          font-family: 'DM Sans', sans-serif;
        }
        #siteNav .nav-auth-btn:hover { background: rgba(245,166,35,0.08); color: #f5a623; border-color: #f5a623; }
        #siteNav .nav-auth-btn.logged-in { color: #2de08a; border-color: rgba(45,224,138,0.25); }
        #siteNav .nav-auth-btn.logged-in:hover { color: #e0443a; border-color: rgba(224,68,58,0.3); background: rgba(224,68,58,0.06); }
        #siteNav .nav-footer {
          padding: 10px 18px 0; font-size: 0.68rem; color: #6b7a96; text-align: center;
        }

        /* Brand icon hover — indicates clickable collapse */
        #siteNav .nav-brand i {
          cursor: pointer; transition: color 0.2s, transform 0.2s;
        }
        #siteNav .nav-brand i:hover { color: #fff; transform: scale(1.15); }

        /* Hamburger button — hidden by default on desktop */
        #navToggle {
          display: none; position: fixed; top: 12px; left: 12px; z-index: 1001;
          width: 40px; height: 40px; border-radius: 8px;
          background: #1a1f2b; border: 1px solid #252d3d;
          color: #f5a623; font-size: 1.1rem; cursor: pointer;
          align-items: center; justify-content: center;
        }

        /* Push content right */
        body.has-nav .wrapper { margin-left: 220px; }

        /* Collapsed state — nav hidden, hamburger visible, full-width content */
        body.nav-collapsed #siteNav { transform: translateX(-100%); }
        body.nav-collapsed #navToggle { display: flex; }
        body.nav-collapsed.has-nav .wrapper { margin-left: 0; }

        @media (max-width: 900px) {
          #siteNav { transform: translateX(-100%); }
          #siteNav.open { transform: translateX(0); box-shadow: 4px 0 24px rgba(0,0,0,0.5); }
          #navToggle { display: flex; }
          body.has-nav .wrapper { margin-left: 0; }
        }
      </style>
      <div class="nav-brand"><i class="fa-solid fa-truck-fast"></i>GR-Transport</div>
      <div class="nav-links">
        ${NAV_ITEMS.map(item => {
          const active = current === item.href ? 'active' : '';
          const adminAttr = item.admin ? 'data-admin-only' : '';
          return `<a href="${item.href}" class="nav-link ${active}" ${adminAttr}>
            <i class="fa-solid ${item.icon}"></i>${item.label}
          </a>`;
        }).join('')}
      </div>
      <div class="nav-auth">
        <button class="nav-auth-btn" id="navAuthBtn">
          <i class="fa-solid fa-lock"></i><span>Login</span>
        </button>
      </div>
      <div class="nav-footer">&copy; 2026 GR-Transport</div>
    `;

    // Hamburger button
    const toggle = document.createElement('button');
    toggle.id = 'navToggle';
    toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
    toggle.onclick = () => {
      // Desktop collapsed → reopen
      if (document.body.classList.contains('nav-collapsed')) {
        document.body.classList.remove('nav-collapsed');
        return;
      }
      // Mobile → toggle open
      nav.classList.toggle('open');
    };

    document.body.prepend(nav);
    document.body.prepend(toggle);
    document.body.classList.add('has-nav');

    // Brand icon click → collapse sidebar
    const brandIcon = nav.querySelector('.nav-brand i');
    if (brandIcon) {
      brandIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        // On mobile, just close the overlay
        if (window.innerWidth <= 900) {
          nav.classList.remove('open');
          return;
        }
        // On desktop, collapse sidebar
        document.body.classList.add('nav-collapsed');
      });
    }

    // Close nav on link click (mobile)
    nav.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => nav.classList.remove('open'));
    });

    // Sync auth button state (auth-modal may have resolved before nav was created)
    if (typeof updateAdminUI === 'function') updateAdminUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createNav);
  } else {
    createNav();
  }
})();
