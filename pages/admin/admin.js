// admin.js — admin dashboard logic (users, wallet balances, portfolio value)
// ------------------------------------------------------------
// Data shape mirrors database/supabase_schema.sql:
//   users    -> user_id, username, email, created_at, last_login
//   wallets  -> balance, starting_balance
//   holdings -> quantity, avg_buy_price (+ stocks.symbol)
// `status` is NOT a column in the current schema; it is mocked here.
// To make it real, add e.g. users.status ('active' | 'suspended').
//
// Until a backend endpoint exists (e.g. GET /api/admin/users), set
// USE_MOCK_DATA = true to preview with placeholder rows. When the
// endpoint is ready, set it to false; loadUsers() expects the same
// shape as MOCK_USERS below. No API keys are used on this page.
// ------------------------------------------------------------

const USE_MOCK_DATA = true;
const ADMIN_USERS_ENDPOINT = '/api/admin/users'; // not implemented yet

const MOCK_USERS = [
  { user_id: 'u-001', username: 'lada_fan',    email: 'lada.fan@example.com',  status: 'active',    created_at: '2026-01-14', last_login: '2026-11-18T09:12:00Z',
    wallet: { balance: 84250.75, starting_balance: 100000 },
    holdings: [ { symbol: 'AAPL', quantity: 40, price: 228.1 }, { symbol: 'MSFT', quantity: 12, price: 431.5 }, { symbol: 'NVDA', quantity: 25, price: 141.2 } ] },
  { user_id: 'u-002', username: 'trader_joe',  email: 'joe@example.com',       status: 'active',    created_at: '2026-02-03', last_login: '2026-11-17T21:40:00Z',
    wallet: { balance: 12430.1, starting_balance: 100000 },
    holdings: [ { symbol: 'TSLA', quantity: 150, price: 352.6 }, { symbol: 'AMZN', quantity: 80, price: 214.9 }, { symbol: 'SPY', quantity: 30, price: 598.3 } ] },
  { user_id: 'u-003', username: 'maria_c',     email: 'maria.c@example.com',   status: 'active',    created_at: '2026-03-22', last_login: '2026-11-18T06:05:00Z',
    wallet: { balance: 100000, starting_balance: 100000 },
    holdings: [] },
  { user_id: 'u-004', username: 'bullrun88',   email: 'bullrun88@example.com', status: 'suspended', created_at: '2026-04-09', last_login: '2026-10-02T13:25:00Z',
    wallet: { balance: 3120.55, starting_balance: 100000 },
    holdings: [ { symbol: 'GME', quantity: 900, price: 31.4 }, { symbol: 'AMC', quantity: 2000, price: 5.2 } ] },
  { user_id: 'u-005', username: 'dividend_dan', email: 'dan@example.com',      status: 'active',    created_at: '2026-05-30', last_login: '2026-11-16T18:00:00Z',
    wallet: { balance: 45890.0, starting_balance: 100000 },
    holdings: [ { symbol: 'KO', quantity: 200, price: 71.8 }, { symbol: 'JNJ', quantity: 90, price: 158.4 }, { symbol: 'VTI', quantity: 60, price: 305.2 } ] },
  { user_id: 'u-006', username: 'newbie_nina', email: 'nina@example.com',      status: 'active',    created_at: '2026-11-10', last_login: '2026-11-18T10:30:00Z',
    wallet: { balance: 97750.4, starting_balance: 100000 },
    holdings: [ { symbol: 'AAPL', quantity: 10, price: 228.1 } ] },
  { user_id: 'u-007', username: 'spam_account', email: 'spam@example.net',     status: 'suspended', created_at: '2026-09-18', last_login: null,
    wallet: { balance: 100000, starting_balance: 100000 },
    holdings: [] },
];

let users = [];
let selectedUserId = null;

// ----- helpers ------------------------------------------------------

const $ = (id) => document.getElementById(id);
const fmtUSD = (n) => (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US') : 'Never');

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

const portfolioValue = (u) => u.holdings.reduce((s, h) => s + h.quantity * h.price, 0);
const netWorth = (u) => u.wallet.balance + portfolioValue(u);

// ----- data loading -------------------------------------------------

async function loadUsers() {
  if (USE_MOCK_DATA) {
    // Deep copy so actions in the UI don't mutate the constant.
    users = JSON.parse(JSON.stringify(MOCK_USERS));
    $('mockBanner').hidden = false;
    return;
  }

  $('mockBanner').hidden = true;
  const res = await fetch(ADMIN_USERS_ENDPOINT, { credentials: 'include' });
  if (!res.ok) throw new Error('Could not load users');
  users = await res.json();
}

// ----- rendering ----------------------------------------------------

function getVisibleUsers() {
  const query = $('userSearch').value.trim().toLowerCase();
  const status = $('statusFilter').value;
  const sortBy = $('sortBy').value;

  const list = users.filter((u) => {
    const matchesText = !query || u.username.toLowerCase().includes(query) || u.email.toLowerCase().includes(query);
    const matchesStatus = status === 'all' || u.status === status;
    return matchesText && matchesStatus;
  });

  const sorters = {
    username:  (a, b) => a.username.localeCompare(b.username),
    balance:   (a, b) => b.wallet.balance - a.wallet.balance,
    portfolio: (a, b) => portfolioValue(b) - portfolioValue(a),
    net:       (a, b) => netWorth(b) - netWorth(a),
    created:   (a, b) => new Date(b.created_at) - new Date(a.created_at),
  };
  return list.sort(sorters[sortBy]);
}

function renderSummary() {
  const active = users.filter((u) => u.status === 'active').length;
  $('totalUsers').textContent = users.length;
  $('statusSplit').textContent = `${active} / ${users.length - active}`;
  $('totalCash').textContent = fmtUSD(users.reduce((s, u) => s + u.wallet.balance, 0));
  $('totalPortfolio').textContent = fmtUSD(users.reduce((s, u) => s + portfolioValue(u), 0));
}

function renderTable() {
  const tbody = $('userBody');
  const list = getVisibleUsers();

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">No users match your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((u) => {
    const pnl = netWorth(u) - u.wallet.starting_balance;
    return `
      <tr data-id="${esc(u.user_id)}" class="${u.user_id === selectedUserId ? 'selected' : ''}">
        <td><div class="user-cell"><span class="uname">${esc(u.username)}</span><span class="uemail">${esc(u.email)}</span></div></td>
        <td><span class="badge ${esc(u.status)}">${u.status === 'active' ? 'Active' : 'Suspended'}</span></td>
        <td>${fmtUSD(u.wallet.balance)}</td>
        <td>${fmtUSD(portfolioValue(u))}</td>
        <td class="change ${pnl >= 0 ? 'up' : 'down'}">${fmtUSD(netWorth(u))}</td>
        <td>${fmtDate(u.last_login)}</td>
        <td>
          <div class="row-actions">
            <button class="mini-btn" data-action="view" type="button">View</button>
            <button class="mini-btn ${u.status === 'active' ? 'danger' : 'ok'}" data-action="toggle" type="button">
              ${u.status === 'active' ? 'Suspend' : 'Activate'}
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderDetails() {
  const box = $('userDetails');
  const u = users.find((x) => x.user_id === selectedUserId);

  if (!u) {
    box.innerHTML = '<p class="muted">Select a user to see wallet and holdings details.</p>';
    return;
  }

  const pnl = netWorth(u) - u.wallet.starting_balance;
  const holdingsRows = u.holdings.length
    ? u.holdings.map((h) => `
        <tr>
          <td>${esc(h.symbol)}</td>
          <td>${h.quantity}</td>
          <td>${fmtUSD(h.price)}</td>
          <td>${fmtUSD(h.quantity * h.price)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="muted" style="text-align:center;">No holdings.</td></tr>';

  box.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="uname">${esc(u.username)}</div>
        <div class="uemail">${esc(u.email)}</div>
      </div>
      <span class="badge ${esc(u.status)}">${u.status === 'active' ? 'Active' : 'Suspended'}</span>
    </div>

    <div class="detail-grid">
      <div class="detail-item"><span class="k">Cash Balance</span><span class="v">${fmtUSD(u.wallet.balance)}</span></div>
      <div class="detail-item"><span class="k">Portfolio Value</span><span class="v">${fmtUSD(portfolioValue(u))}</span></div>
      <div class="detail-item"><span class="k">Starting Balance</span><span class="v">${fmtUSD(u.wallet.starting_balance)}</span></div>
      <div class="detail-item"><span class="k">Net P/L</span><span class="v change ${pnl >= 0 ? 'up' : 'down'}">${pnl >= 0 ? '+' : ''}${fmtUSD(pnl)}</span></div>
      <div class="detail-item"><span class="k">Member Since</span><span class="v">${fmtDate(u.created_at)}</span></div>
      <div class="detail-item"><span class="k">Last Login</span><span class="v">${fmtDate(u.last_login)}</span></div>
    </div>

    <h3>Holdings</h3>
    <div class="table-wrap">
      <table class="holdings-table">
        <thead><tr><th>Symbol</th><th>Qty</th><th>Price</th><th>Value</th></tr></thead>
        <tbody>${holdingsRows}</tbody>
      </table>
    </div>

    <h3>Adjust Wallet</h3>
    <input type="number" id="adjustAmount" placeholder="Amount" min="0" step="0.01"
           style="padding:12px 14px;border-radius:14px;border:1px solid var(--border-soft);background:rgba(255,255,255,0.06);color:#fff;font-size:0.95rem;" />
    <div class="details-actions">
      <button class="buy-btn" id="creditBtn" type="button">Credit</button>
      <button class="sell-btn" id="debitBtn" type="button">Debit</button>
    </div>
  `;

  $('creditBtn').addEventListener('click', () => adjustWallet(u.user_id, 1));
  $('debitBtn').addEventListener('click', () => adjustWallet(u.user_id, -1));
}

function renderAll() {
  renderSummary();
  renderTable();
  renderDetails();
}

// ----- actions (local only until backend endpoints exist) -----------

function toggleStatus(userId) {
  const u = users.find((x) => x.user_id === userId);
  if (!u) return;
  // TODO: PATCH /api/admin/users/:id/status once the endpoint exists.
  u.status = u.status === 'active' ? 'suspended' : 'active';
  renderAll();
}

function adjustWallet(userId, direction) {
  const u = users.find((x) => x.user_id === userId);
  const amount = parseFloat($('adjustAmount').value);
  if (!u || !amount || amount <= 0) {
    alert('Enter a valid amount.');
    return;
  }
  if (direction < 0 && amount > u.wallet.balance) {
    alert('Debit exceeds the available cash balance.');
    return;
  }
  // TODO: POST /api/admin/users/:id/wallet (credit/debit) once the endpoint exists.
  u.wallet.balance += direction * amount;
  renderAll();
}

// ----- init ---------------------------------------------------------

async function init() {
  $('userBody').innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">Loading users...</td></tr>';
  try {
    await loadUsers();
    renderAll();
  } catch (err) {
    console.error('Admin load error:', err);
    $('userBody').innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--accent-down);">Failed to load users.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('userSearch').addEventListener('input', renderTable);
  $('statusFilter').addEventListener('change', renderTable);
  $('sortBy').addEventListener('change', renderTable);

  $('userBody').addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    if (event.target.closest('[data-action="toggle"]')) {
      toggleStatus(id);
      return;
    }
    selectedUserId = id;
    renderAll();
  });

  init();
});
