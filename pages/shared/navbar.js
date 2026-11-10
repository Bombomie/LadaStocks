/* ============================================================
 * Lada Stocks — Reusable Navbar (<lada-navbar>)
 * ------------------------------------------------------------
 * One file, zero dependencies. Drop-in replacement for the
 * copy-pasted <header> on every page.
 *
 * SETUP (once)
 *   1. Save this file as:  <pages-root>/shared/navbar.js
 *      (the same folder as shared/config.js)
 *
 * USAGE (on every page that needs the navbar)
 *   In <head>:
 *     <script src="../shared/navbar.js" defer></script>
 *   In <body>, where <header> used to be:
 *     <lada-navbar></lada-navbar>
 *
 * WHAT IT DOES
 *   - renders the pill navbar (logo, links, user area) with
 *     its own encapsulated styles (shadow DOM), so page CSS
 *     never conflicts with it
 *   - highlights the link matching the current page
 *   - fetches the logged-in username from /api/auth/me and
 *     redirects to the login page on 401 (session guard)
 *   - collapses into a hamburger dropdown below 960px
 *
 * OPTIONAL ATTRIBUTES
 *   <lada-navbar username="Alex"></lada-navbar>      skip the /me lookup
 *   <lada-navbar auth="off"></lada-navbar>           public page: no redirect on 401
 *   <lada-navbar api-base="http://localhost:20269"></lada-navbar>
 *
 * TO ADD / REORDER A PAGE
 *   Edit the NAV_ITEMS array below — every page updates at once.
 * ============================================================ */

const LOGIN_URL = '../authentication/login/login.html';

const NAV_ITEMS = [
  { label: 'Dashboard',    href: '../dashboard/dashboard.html' },
  { label: 'Portfolio',    href: '../portfolio/portfolio.html' },
  { label: 'Wallet',       href: '../wallet/wallet.html' },
  { label: 'Watchlist',    href: '../watchlist/watchlist.html' },
  { label: 'Transactions', href: '../transactions/transactions.html' },
  { label: 'Charts',       href: '../charts/charts.html' },
];

// IMPORTANT: defaults to SAME-ORIGIN (''), because the Express server
// serves both the pages and the API. Cookies are host-specific — calling
// a different host than the one that set them (e.g. login checks
// localhost but dashboard checks the Render URL) causes an infinite
// login <-> dashboard redirect loop. Only override via window.API_BASE_URL
// (shared/config.js) or the api-base attribute if you split the
// frontend and API onto different hosts one day.
function getApiBase(el) {
  return (
    el.getAttribute('api-base') ||
    window.API_BASE_URL ||
    window.LADA_CONFIG?.API_BASE_URL ||
    window.CONFIG?.API_BASE_URL ||
    ''
  );
}

const STYLES = `
  :host {
    display: block;
    font-family: 'Lexend Deca', 'Segoe UI', system-ui, sans-serif;
  }

  header {
    position: absolute;
    top: 20px;
    left: 20px;
    right: 20px;
    height: var(--header-height, 80px);
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 40px;
    padding: 12px 24px;
    background-color: rgba(10, 31, 68, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 50px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    z-index: 1000;
  }

  .logo img {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: block;
  }

  .menu-toggle {
    display: none;
    background: none;
    border: none;
    color: #ffffff;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    padding: 4px 8px;
  }

  .nav-links {
    display: flex;
    list-style: none;
    gap: 10px;
    margin: 0;
    padding: 0;
    align-items: center;
  }

  .nav-links a {
    display: inline-block;
    padding: 8px 18px;
    border-radius: 50px;
    border: 1px solid var(--gold, #FFC349);
    color: var(--gold, #FFC349);
    text-decoration: none;
    font-weight: bold;
    font-size: 14px;
    white-space: nowrap;
    transition: background-color 0.2s ease;
  }

  .nav-links a:hover,
  .nav-links a.active {
    background-color: var(--gold, #FFC349);
    color: #0a1f44;
  }

  .nav-right {
    display: flex;
    align-items: center;
    gap: 16px;
    color: #ffffff;
    margin-left: auto;
  }

  .username {
    font-weight: 600;
    font-size: 16px;
  }

  .avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    display: block;
  }

  @media (max-width: 960px) {
    header {
      gap: 16px;
      padding: 10px 16px;
    }

    .menu-toggle {
      display: block;
    }

    .username {
      display: none;
    }

    .nav-links {
      display: none;
      position: absolute;
      top: calc(100% + 10px);
      left: 0;
      right: 0;
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
      padding: 14px;
      background-color: rgba(10, 31, 68, 0.92);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
    }

    .nav-links.open {
      display: flex;
    }

    .nav-links a {
      display: block;
      text-align: center;
    }
  }
`;

class LadaNavbar extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;

    const root = this.attachShadow({ mode: 'open' });

    const linksHtml = NAV_ITEMS.map(
      (item) => `        <li><a href="${item.href}">${item.label}</a></li>`
    ).join('\n');

    root.innerHTML = `
      <style>${STYLES}</style>
      <header>
        <a href="../dashboard/dashboard.html" class="logo">
          <img src="../../Images/LadaStocks.png" alt="Lada Stocks logo" />
        </a>

        <button class="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false">&#9776;</button>

        <ul class="nav-links">
${linksHtml}
        </ul>

        <div class="nav-right">
          <span class="username"></span>
          <a href="../User/user.html">
            <img src="../../Images/profile.png" alt="User avatar" class="avatar" />
          </a>
        </div>
      </header>
    `;

    this.highlightActiveLink(root);
    this.wireMenuToggle(root);
    this.loadUsername(root);
  }

  highlightActiveLink(root) {
    const currentPage =
      window.location.pathname.split('/').pop().toLowerCase() || 'index.html';

    root.querySelectorAll('.nav-links a').forEach((link) => {
      const target = (link.getAttribute('href') || '')
        .split('/')
        .pop()
        .toLowerCase();
      link.classList.toggle('active', target === currentPage);
    });
  }

  wireMenuToggle(root) {
    const toggle = root.querySelector('.menu-toggle');
    const links = root.querySelector('.nav-links');

    toggle.addEventListener('click', () => {
      const isOpen = links.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    links.addEventListener('click', (event) => {
      if (event.target.closest('a')) {
        links.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  async loadUsername(root) {
    const usernameEl = root.querySelector('.username');

    const staticName = this.getAttribute('username');
    if (staticName) {
      usernameEl.textContent = staticName;
      return;
    }

    // Public pages (login, signup, landing) can opt out entirely.
    if (this.getAttribute('auth') === 'off') return;

    try {
      const response = await fetch(`${getApiBase(this)}/api/auth/me`, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (response.status === 401) {
        window.location.replace(LOGIN_URL);
        return;
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Could not load user session.');
      }

      usernameEl.textContent = data.user.username || 'User';

      // Reflect the user's Cloudinary avatar (if one has been uploaded).
      if (data.user.avatar_url) {
        const avatarEl = root.querySelector('.avatar');
        avatarEl.onerror = () => { avatarEl.src = '../../Images/profile.png'; };
        avatarEl.src = data.user.avatar_url;
      }
    } catch (error) {
      // 401 is the only reliable "logged out" signal. Anything else
      // (Render cold start, network blip, 5xx) should NOT bounce the
      // user to the login page — just show a placeholder name.
      console.error('Navbar authentication error:', error);
      usernameEl.textContent = 'User';
    }
  }
}

if (!customElements.get('lada-navbar')) {
  customElements.define('lada-navbar', LadaNavbar);
}
