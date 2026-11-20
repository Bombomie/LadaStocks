// pages/admin/admin.js — All 8 Admin Control Center Modules (Vanilla JS)

const $ = (id) => document.getElementById(id);
const fmtUSD = (n) => (n == null || Number.isNaN(Number(n)))
  ? '—'
  : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US') : 'Never');
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-US') : '—');

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

let activeTab = 'overview';
let users = [];
let selectedUserId = null;
let stocks = [];
let tradesData = { stockTrades: [], walletTrades: [] };
let selectedTradeId = null;
let portfoliosData = { userPortfolios: [], assetExposure: [] };
let selectedPortfolioUserId = null;
let announcements = [];
let auditLogs = [];
let adminVolumeChart = null;
let mutationPending = false;
const pendingWalletRequests = new Map();

function showMessage(message = '', type = 'info') {
  const el = $('adminMessage');
  el.textContent = message;
  el.className = 'admin-message' + (type === 'error' ? ' error' : type === 'success' ? ' success' : '');
  el.hidden = !message;
}

async function adminApi(path, options = {}) {
  const res = await fetch(`/api/admin${path}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (res.status === 401) {
    window.location.replace('../authentication/login/login.html');
    throw new Error('Authentication required');
  }
  if (res.status === 403) {
    window.location.replace('../dashboard/dashboard.html');
    throw new Error('Administrator access required');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || 'The admin request could not be completed.');
    err.status = res.status;
    throw err;
  }
  return data;
}

// =====================================================================
// TAB SWITCHING
// =====================================================================

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('#adminTabs .tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.hidden = panel.id !== `tab-${tab}`;
    panel.classList.toggle('active', panel.id === `tab-${tab}`);
  });
  loadActiveTab();
}

async function loadActiveTab() {
  showMessage('');
  try {
    if (activeTab === 'overview') await loadOverview();
    else if (activeTab === 'users') await loadUsers();
    else if (activeTab === 'stocks') await loadStocks();
    else if (activeTab === 'trades') await loadTrades();
    else if (activeTab === 'portfolios') await loadPortfolios();
    else if (activeTab === 'market') await loadMarketData();
    else if (activeTab === 'reports') await loadReports();
    else if (activeTab === 'audit') await loadAuditLogs();
  } catch (err) {
    showMessage(err.message || 'Failed to load section.', 'error');
  }
}

// =====================================================================
// 1. OVERVIEW & ANNOUNCEMENTS
// =====================================================================

async function loadOverview() {
  const [ov, ann] = await Promise.all([
    adminApi('/overview'),
    adminApi('/announcements'),
  ]);
  announcements = ann || [];

  $('ovUsers').textContent = `${ov.totalUsers || 0} (${ov.activeUsers || 0} / ${ov.suspendedUsers || 0})`;
  $('ovTrades').textContent = `${ov.totalTrades || 0} / ${fmtUSD(ov.volume24h || 0)}`;
  $('ovTotalVolume').textContent = fmtUSD(ov.totalVolume || 0);
  $('ovTotalCash').textContent = fmtUSD(ov.totalCash || 0);
  $('ovTotalPortfolio').textContent = fmtUSD(ov.totalPortfolioValue || 0);
  $('ovActiveStocks').textContent = ov.activeStocks ?? 0;
  $('ovFlaggedTrades').textContent = ov.flaggedTrades ?? 0;

  const isOpen = ov.marketStatus?.isOpen;
  const badge = $('marketBadge');
  badge.textContent = `US Market: ${isOpen ? 'OPEN' : 'CLOSED'} (${ov.marketStatus?.session || 'regular'})`;
  badge.className = `status-pill ${isOpen ? 'open' : 'closed'}`;
  $('ovSystemStatus').textContent = isOpen ? 'Market Open' : 'After Hours';

  renderAnnouncements();

  const tradesBody = $('ovRecentTradesBody');
  const recentTrades = ov.recentTrades || [];
  tradesBody.innerHTML = recentTrades.length
    ? recentTrades.map((t) => `
        <tr>
          <td>${esc(t.username)}</td>
          <td class="change ${t.transaction_type === 'buy' ? 'up' : 'down'}">${esc(String(t.transaction_type).toUpperCase())}</td>
          <td><strong>${esc(t.symbol)}</strong></td>
          <td>${t.quantity}</td>
          <td>${fmtUSD(t.total_amount)}</td>
          <td><span class="badge ${esc(t.review_status)}">${esc(t.review_status)}</span></td>
          <td>${fmtDateTime(t.executed_at)}</td>
        </tr>`).join('')
    : '<tr><td colspan="7" class="muted" style="text-align:center;">No trades executed yet.</td></tr>';

  const logsBox = $('ovRecentLogs');
  const recentLogs = ov.recentLogs || [];
  logsBox.innerHTML = recentLogs.length
    ? recentLogs.map((l) => `
        <div class="mini-log-item">
          <div><strong>${esc(l.action)}</strong> · <span class="badge info">${esc(l.category)}</span></div>
          <div class="muted" style="margin-top:4px;">${esc(l.admin_username)} · ${fmtDateTime(l.created_at)}</div>
        </div>`).join('')
    : '<p class="muted">No administrator logs recorded yet.</p>';
}

function renderAnnouncements() {
  const container = $('announcementsList');
  if (!announcements.length) {
    container.innerHTML = '<p class="muted">No announcements created yet. Click "+ New Notice" to post one to the User Dashboard.</p>';
    return;
  }

  container.innerHTML = announcements.map((a) => `
    <div class="announcement-card ${a.is_active ? '' : 'inactive'}" data-ann-id="${esc(a.announcement_id)}">
      <div class="announcement-top">
        <p class="announcement-title">${a.is_pinned ? '📌 ' : ''}${esc(a.title)}</p>
        <div class="row-actions">
          <span class="badge ${esc(a.severity)}">${esc(a.severity)}</span>
          <span class="badge ${a.is_active ? 'active' : 'suspended'}">${a.is_active ? 'Active' : 'Hidden'}</span>
        </div>
      </div>
      <p class="announcement-body">${esc(a.message)}</p>
      <div class="announcement-meta">
        <span>Posted by ${esc(a.admin_username)} · ${fmtDateTime(a.created_at)}</span>
        <div class="row-actions">
          <button class="mini-btn" data-ann-action="edit" type="button">Edit</button>
          <button class="mini-btn" data-ann-action="toggle-pin" type="button">${a.is_pinned ? 'Unpin' : 'Pin'}</button>
          <button class="mini-btn" data-ann-action="toggle-active" type="button">${a.is_active ? 'Hide' : 'Show'}</button>
          <button class="mini-btn danger" data-ann-action="delete" type="button">Delete</button>
        </div>
      </div>
    </div>`).join('');
}

function openAnnouncementModal(ann = null) {
  $('announcementModalTitle').textContent = ann ? 'Edit Announcement' : 'Publish Announcement';
  $('annId').value = ann ? ann.announcement_id : '';
  $('annTitle').value = ann ? ann.title : '';
  $('annMessage').value = ann ? ann.message : '';
  $('annSeverity').value = ann ? ann.severity : 'info';
  $('annPinned').checked = ann ? Boolean(ann.is_pinned) : false;
  $('annActive').checked = ann ? Boolean(ann.is_active) : true;
  $('announcementModal').hidden = false;
  $('annTitle').focus();
}

// =====================================================================
// 2. USER MANAGEMENT (including Wallet Adjust & Locked Profile Edit)
// =====================================================================

const portfolioValue = (u) => (u.holdings || []).reduce((s, h) => s + Number(h.quantity) * Number(h.price), 0);
const cashBalance = (u) => Number(u.wallet?.balance ?? 0);
const netWorth = (u) => cashBalance(u) + portfolioValue(u);

async function loadUsers() {
  $('userBody').innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">Loading users...</td></tr>';
  users = await adminApi('/users');
  renderUsersSummary();
  renderUsersTable();
  renderUserDetails();
}

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
    balance:   (a, b) => cashBalance(b) - cashBalance(a),
    portfolio: (a, b) => portfolioValue(b) - portfolioValue(a),
    net:       (a, b) => netWorth(b) - netWorth(a),
    created:   (a, b) => new Date(b.created_at) - new Date(a.created_at),
  };
  return list.sort(sorters[sortBy]);
}

function renderUsersSummary() {
  const active = users.filter((u) => u.status === 'active').length;
  $('totalUsers').textContent = users.length;
  $('statusSplit').textContent = `${active} / ${users.length - active}`;
  $('totalCash').textContent = fmtUSD(users.reduce((s, u) => s + cashBalance(u), 0));
  $('totalPortfolio').textContent = fmtUSD(users.reduce((s, u) => s + portfolioValue(u), 0));
}

function renderUsersTable() {
  const tbody = $('userBody');
  const list = getVisibleUsers();

  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted" style="text-align:center;">No users match your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((u) => {
    const pnl = netWorth(u) - (u.wallet?.starting_balance ?? 0);
    return `
      <tr data-id="${esc(u.user_id)}" class="${u.user_id === selectedUserId ? 'selected' : ''}">
        <td><div class="user-cell"><span class="uname">${esc(u.username)}</span><span class="uemail">${esc(u.email)}</span></div></td>
        <td><span class="badge ${esc(u.status)}">${u.status === 'active' ? 'Active' : 'Suspended'}</span></td>
        <td>${fmtUSD(u.wallet?.balance)}</td>
        <td>${fmtUSD(portfolioValue(u))}</td>
        <td class="change ${pnl >= 0 ? 'up' : 'down'}">${fmtUSD(netWorth(u))}</td>
        <td>${fmtDate(u.last_login)}</td>
        <td>
          <div class="row-actions">
            <button class="mini-btn" data-action="view" type="button">Manage</button>
            ${u.isAdmin && u.status === 'active' ? '' : `<button class="mini-btn ${u.status === 'active' ? 'danger' : 'ok'}" data-action="toggle" type="button">
              ${u.status === 'active' ? 'Suspend' : 'Activate'}
            </button>`}
          </div>
        </td>
      </tr>`;
  }).join('');
}

function renderUserDetails() {
  const box = $('userDetails');
  const u = users.find((x) => x.user_id === selectedUserId);
  if (!u) {
    box.innerHTML = '<p class="muted">Select a user to view wallet, holdings, or edit locked email/birthday.</p>';
    return;
  }

  const pnl = u.wallet ? netWorth(u) - u.wallet.starting_balance : null;
  const holdingsRows = (u.holdings || []).length
    ? u.holdings.map((h) => `
        <tr>
          <td>${esc(h.symbol)}</td>
          <td>${h.quantity}</td>
          <td>${fmtUSD(h.price)}</td>
          <td>${fmtUSD(Number(h.quantity) * Number(h.price))}</td>
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
      <div class="detail-item"><span class="k">Cash Balance</span><span class="v">${fmtUSD(u.wallet?.balance)}</span></div>
      <div class="detail-item"><span class="k">Portfolio Value</span><span class="v">${fmtUSD(portfolioValue(u))}</span></div>
      <div class="detail-item"><span class="k">Birth Date (Locked)</span><span class="v">${u.birth_date || '—'}</span></div>
      <div class="detail-item"><span class="k">Net P/L</span><span class="v change ${pnl >= 0 ? 'up' : 'down'}">${pnl > 0 ? '+' : ''}${fmtUSD(pnl)}</span></div>
      <div class="detail-item"><span class="k">Trades</span><span class="v">${u.trade_count || 0}</span></div>
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
    ${u.wallet ? `
    <div class="admin-form">
      <input type="text" inputmode="decimal" id="adjustAmount" placeholder="Amount (e.g. 5000.00)" />
      <input type="text" id="adjustReason" placeholder="Reason (optional)" maxlength="140" />
      <div class="details-actions">
        <button class="buy-btn" id="creditBtn" type="button">Credit</button>
        <button class="sell-btn" id="debitBtn" type="button">Debit</button>
      </div>
    </div>` : '<p class="muted">This user has no wallet.</p>'}

    <h3>Edit User Identity (Locked on User Profile)</h3>
    <form id="adminProfileEditForm" class="admin-form">
      <label>Username
        <input type="text" id="adminEditUsername" value="${esc(u.username)}" required maxlength="30" />
      </label>
      <label>Email
        <input type="email" id="adminEditEmail" value="${esc(u.email)}" required />
      </label>
      <label>Birth Date
        <input type="date" id="adminEditBirthDate" value="${esc(u.birth_date || '')}" />
      </label>
      <button class="mini-btn" type="submit" style="padding:10px 14px;">Save Profile Override</button>
    </form>
  `;

  $('creditBtn')?.addEventListener('click', () => adjustWallet(u, 'credit'));
  $('debitBtn')?.addEventListener('click', () => adjustWallet(u, 'debit'));
  $('adminProfileEditForm')?.addEventListener('submit', (e) => saveUserProfileOverride(e, u));
}

async function applyUserMutation(path, method, body, applyResult) {
  mutationPending = true;
  showMessage('');
  try {
    const data = await adminApi(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    applyResult(data);
    renderUsersSummary();
    renderUsersTable();
    renderUserDetails();
    return true;
  } catch (err) {
    showMessage(err.message, 'error');
    return err.status >= 400 && err.status < 500;
  } finally {
    mutationPending = false;
  }
}

async function toggleUserStatus(userId) {
  const u = users.find((x) => x.user_id === userId);
  if (!u) return;
  const status = u.status === 'active' ? 'suspended' : 'active';
  await applyUserMutation(`/users/${userId}/status`, 'PATCH', { status }, (data) => {
    u.status = data.status;
    showMessage(`User ${u.username} is now ${data.status}.`, 'success');
  });
}

async function adjustWallet(u, direction) {
  if (mutationPending) return;
  const amount = $('adjustAmount').value.trim().replace(/^\./, '0.');
  const reason = $('adjustReason').value.trim();
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount) || Number(amount) === 0) {
    showMessage('Enter a valid amount with up to two decimal places.', 'error');
    return;
  }
  const key = `${u.user_id}:${direction}:${Number(amount).toFixed(2)}`;
  const requestId = pendingWalletRequests.get(key) ?? crypto.randomUUID();
  pendingWalletRequests.set(key, requestId);

  const finished = await applyUserMutation(`/users/${u.user_id}/wallet`, 'POST', {
    amount,
    direction,
    requestId,
    reason,
  }, (data) => {
    u.wallet.balance = data.balance;
    showMessage('Wallet balance updated.', 'success');
  });
  if (finished) pendingWalletRequests.delete(key);
}

async function saveUserProfileOverride(e, u) {
  e.preventDefault();
  const username = $('adminEditUsername').value.trim();
  const email = $('adminEditEmail').value.trim().toLowerCase();
  const birth_date = $('adminEditBirthDate').value.trim() || null;

  await applyUserMutation(`/users/${u.user_id}/profile`, 'PATCH', {
    username,
    email,
    birth_date,
  }, (updated) => {
    u.username = updated.username;
    u.email = updated.email;
    u.birth_date = updated.birth_date;
    showMessage(`Updated locked profile for ${u.username}.`, 'success');
  });
}

// =====================================================================
// 3. STOCK MANAGEMENT
// =====================================================================

async function loadStocks() {
  stocks = await adminApi('/stocks');
  const activeCount = stocks.filter((s) => s.status === 'active').length;
  const totalVol = stocks.reduce((s, x) => s + Number(x.trade_volume || 0), 0);

  $('stTotal').textContent = stocks.length;
  $('stActive').textContent = activeCount;
  $('stHalted').textContent = stocks.length - activeCount;
  $('stVolume').textContent = fmtUSD(totalVol);

  renderStocksTable();
}

function renderStocksTable() {
  const q = $('stockFilterSearch').value.trim().toLowerCase();
  const statusFilter = $('stockStatusFilter').value;

  const list = stocks.filter((s) => {
    const matchText = !q ||
      s.symbol.toLowerCase().includes(q) ||
      (s.company_name || '').toLowerCase().includes(q) ||
      (s.sector || '').toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all' || s.status === statusFilter;
    return matchText && matchStatus;
  });

  const tbody = $('stocksBody');
  if (!list.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center;">No stocks match your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = list.map((s) => `
    <tr data-stock-id="${esc(s.stock_id)}">
      <td><strong>${esc(s.symbol)}</strong></td>
      <td>${esc(s.company_name)}</td>
      <td class="muted">${esc(s.sector || '—')} · ${esc(s.exchange || '—')}</td>
      <td><span class="badge ${esc(s.status)}">${esc(s.status)}</span></td>
      <td>${s.holders_count || 0}</td>
      <td>${s.shares_held || 0}</td>
      <td>${fmtUSD(s.trade_volume || 0)}</td>
      <td>
        <div class="row-actions">
          <button class="mini-btn" data-stock-action="edit" type="button">Edit</button>
          <button class="mini-btn ${s.status === 'active' ? 'danger' : 'ok'}" data-stock-action="toggle" type="button">
            ${s.status === 'active' ? 'Halt' : 'Activate'}
          </button>
          <button class="mini-btn danger" data-stock-action="delete" type="button">Remove</button>
        </div>
      </td>
    </tr>`).join('');
}

function populateStockForm(stock = null) {
  $('stockFormTitle').textContent = stock ? `Edit ${stock.symbol}` : 'Add Supported Stock';
  $('editStockId').value = stock ? stock.stock_id : '';
  $('stockSymbolInput').value = stock ? stock.symbol : '';
  $('stockNameInput').value = stock ? stock.company_name : '';
  $('stockExchangeInput').value = stock ? (stock.exchange || '') : '';
  $('stockSectorInput').value = stock ? (stock.sector || '') : '';
  $('stockStatusInput').value = stock ? (stock.status || 'active') : 'active';
}

// =====================================================================
// 4. TRADE MANAGEMENT
// =====================================================================

async function loadTrades() {
  tradesData = await adminApi('/trades?limit=250');
  const stockTrades = tradesData.stockTrades || [];
  const buys = stockTrades.filter((t) => t.transaction_type === 'buy').length;
  const flagged = stockTrades.filter((t) => t.review_status === 'flagged').length;
  const vol = stockTrades.reduce((s, t) => s + Number(t.total_amount || 0), 0);

  $('trTotalCount').textContent = stockTrades.length;
  $('trSplit').textContent = `${buys} / ${stockTrades.length - buys}`;
  $('trFlagged').textContent = flagged;
  $('trVolume').textContent = fmtUSD(vol);

  renderTradesTable();
  renderTradeDetails();
  renderWalletLedger();
}

function renderTradesTable() {
  const q = $('tradeSearch').value.trim().toLowerCase();
  const typeF = $('tradeTypeFilter').value;
  const revF = $('tradeReviewFilter').value;

  const list = (tradesData.stockTrades || []).filter((t) => {
    const matchText = !q ||
      t.username.toLowerCase().includes(q) ||
      t.symbol.toLowerCase().includes(q) ||
      (t.confirmation_id || '').toLowerCase().includes(q);
    const matchType = typeF === 'all' || t.transaction_type === typeF;
    const matchRev = revF === 'all' || t.review_status === revF;
    return matchText && matchType && matchRev;
  });

  const tbody = $('tradesBody');
  tbody.innerHTML = list.length
    ? list.map((t) => `
        <tr data-tx-id="${esc(t.transaction_id)}" class="${t.transaction_id === selectedTradeId ? 'selected' : ''}">
          <td>${esc(t.confirmation_id)}</td>
          <td>${esc(t.username)}</td>
          <td class="change ${t.transaction_type === 'buy' ? 'up' : 'down'}">${esc(String(t.transaction_type).toUpperCase())}</td>
          <td><strong>${esc(t.symbol)}</strong></td>
          <td>${t.quantity}</td>
          <td>${fmtUSD(t.price_per_share)}</td>
          <td>${fmtUSD(t.total_amount)}</td>
          <td><span class="badge ${esc(t.review_status)}">${esc(t.review_status)}</span></td>
          <td>${fmtDateTime(t.executed_at)}</td>
        </tr>`).join('')
    : '<tr><td colspan="9" class="muted" style="text-align:center;">No trades match filters.</td></tr>';
}

function renderWalletLedger() {
  const list = tradesData.walletTrades || [];
  const tbody = $('walletLedgerBody');
  tbody.innerHTML = list.length
    ? list.slice(0, 50).map((w) => `
        <tr>
          <td>${esc(w.confirmation_id)}</td>
          <td>${esc(w.username)}</td>
          <td class="change ${w.transaction_type === 'deposit' ? 'up' : 'down'}">${esc(String(w.transaction_type).toUpperCase())}</td>
          <td>${fmtUSD(w.amount)}</td>
          <td class="muted">${esc(w.reason || '—')}</td>
          <td>${fmtDateTime(w.created_at)}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="muted" style="text-align:center;">No wallet ledger entries yet.</td></tr>';
}

function renderTradeDetails() {
  const box = $('tradeDetails');
  const tx = (tradesData.stockTrades || []).find((t) => t.transaction_id === selectedTradeId);
  if (!tx) {
    box.innerHTML = '<p class="muted">Select a transaction row to approve, flag, or annotate it.</p>';
    return;
  }

  box.innerHTML = `
    <div class="detail-head">
      <div>
        <div class="uname">${esc(tx.symbol)} · ${esc(String(tx.transaction_type).toUpperCase())}</div>
        <div class="uemail">${esc(tx.username)} (${esc(tx.confirmation_id)})</div>
      </div>
      <span class="badge ${esc(tx.review_status)}">${esc(tx.review_status)}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-item"><span class="k">Quantity</span><span class="v">${tx.quantity} sh</span></div>
      <div class="detail-item"><span class="k">Execution Price</span><span class="v">${fmtUSD(tx.price_per_share)}</span></div>
      <div class="detail-item"><span class="k">Total Amount</span><span class="v">${fmtUSD(tx.total_amount)}</span></div>
      <div class="detail-item"><span class="k">Realized P/L</span><span class="v">${tx.realized_pnl != null ? fmtUSD(tx.realized_pnl) : '—'}</span></div>
    </div>
    <form id="tradeReviewForm" class="admin-form">
      <label>Review Decision
        <select id="txReviewStatus">
          <option value="executed" ${tx.review_status === 'executed' ? 'selected' : ''}>Executed</option>
          <option value="approved" ${tx.review_status === 'approved' ? 'selected' : ''}>Approved</option>
          <option value="flagged" ${tx.review_status === 'flagged' ? 'selected' : ''}>Flagged</option>
          <option value="rejected" ${tx.review_status === 'rejected' ? 'selected' : ''}>Rejected</option>
        </select>
      </label>
      <label>Reviewer Note
        <input type="text" id="txReviewNote" value="${esc(tx.review_note || '')}" placeholder="Optional compliance note" maxlength="200" />
      </label>
      <button class="buy-btn" type="submit" style="padding:11px;border:none;border-radius:14px;font-weight:700;cursor:pointer;">Update Trade Status</button>
    </form>
  `;

  $('tradeReviewForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const updated = await adminApi(`/trades/${tx.transaction_id}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_status: $('txReviewStatus').value,
          review_note: $('txReviewNote').value.trim(),
        }),
      });
      tx.review_status = updated.review_status;
      tx.review_note = updated.review_note;
      showMessage(`Trade ${tx.confirmation_id} marked ${updated.review_status}.`, 'success');
      renderTradesTable();
      renderTradeDetails();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });
}

// =====================================================================
// 5. PORTFOLIO MONITORING
// =====================================================================

async function loadPortfolios() {
  portfoliosData = await adminApi('/portfolios');
  const list = portfoliosData.userPortfolios || [];
  const totalNet = list.reduce((s, p) => s + Number(p.net_worth || 0), 0);
  const totalEq = list.reduce((s, p) => s + Number(p.equity_value || 0), 0);
  const totalCash = list.reduce((s, p) => s + Number(p.cash_balance || 0), 0);
  const totalUnrl = list.reduce((s, p) => s + Number(p.unrealized_pnl || 0), 0);

  $('pfNetWorth').textContent = fmtUSD(totalNet);
  $('pfEquityValue').textContent = fmtUSD(totalEq);
  $('pfCashValue').textContent = fmtUSD(totalCash);
  const unrlEl = $('pfUnrealized');
  unrlEl.textContent = (totalUnrl >= 0 ? '+' : '') + fmtUSD(totalUnrl);
  unrlEl.className = `summary-value ${totalUnrl >= 0 ? 'up' : 'down'}`;

  renderPortfoliosTable();
  renderPortfolioDetails();
  renderAssetExposure();
}

function renderPortfoliosTable() {
  const q = $('portfolioSearch').value.trim().toLowerCase();
  const list = (portfoliosData.userPortfolios || []).filter((p) =>
    !q || p.username.toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
  );

  const tbody = $('portfoliosBody');
  tbody.innerHTML = list.length
    ? list.map((p) => {
        const unrl = Number(p.unrealized_pnl || 0);
        return `
          <tr data-pf-uid="${esc(p.user_id)}" class="${p.user_id === selectedPortfolioUserId ? 'selected' : ''}">
            <td><div class="user-cell"><span class="uname">${esc(p.username)}</span><span class="uemail">${esc(p.email)}</span></div></td>
            <td>${(p.holdings || []).length}</td>
            <td>${fmtUSD(p.cash_balance)}</td>
            <td>${fmtUSD(p.equity_value)}</td>
            <td class="change ${unrl >= 0 ? 'up' : 'down'}">${unrl >= 0 ? '+' : ''}${fmtUSD(unrl)}</td>
            <td><strong>${fmtUSD(p.net_worth)}</strong></td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="6" class="muted" style="text-align:center;">No portfolios found.</td></tr>';
}

function renderPortfolioDetails() {
  const box = $('portfolioDetails');
  const p = (portfoliosData.userPortfolios || []).find((x) => x.user_id === selectedPortfolioUserId);
  if (!p) {
    box.innerHTML = '<p class="muted">Select a user portfolio to inspect holdings and concentration.</p>';
    return;
  }

  const holdings = p.holdings || [];
  const totalEq = Number(p.equity_value || 0);
  const rows = holdings.length
    ? holdings.map((h) => {
        const weight = totalEq > 0 ? (Number(h.market_value) / totalEq) * 100 : 0;
        return `
          <tr>
            <td><strong>${esc(h.symbol)}</strong></td>
            <td>${h.quantity}</td>
            <td>${fmtUSD(h.avg_buy_price)}</td>
            <td>${fmtUSD(h.market_value)} (${weight.toFixed(1)}%)</td>
          </tr>`;
      }).join('')
    : '<tr><td colspan="4" class="muted" style="text-align:center;">100% Cash (No equity positions).</td></tr>';

  box.innerHTML = `
    <div class="detail-head">
      <div><div class="uname">${esc(p.username)}</div><div class="uemail">${esc(p.email)}</div></div>
      <span class="badge ${esc(p.status)}">${esc(p.status)}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-item"><span class="k">Net Worth</span><span class="v">${fmtUSD(p.net_worth)}</span></div>
      <div class="detail-item"><span class="k">Cost Basis</span><span class="v">${fmtUSD(p.cost_basis)}</span></div>
    </div>
    <div class="table-wrap">
      <table class="holdings-table">
        <thead><tr><th>Symbol</th><th>Qty</th><th>Avg Cost</th><th>Value &amp; Weight</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderAssetExposure() {
  const rows = portfoliosData.assetExposure || [];
  $('assetExposureBody').innerHTML = rows.length
    ? rows.slice(0, 10).map((a) => `
        <tr>
          <td><strong>${esc(a.symbol)}</strong></td>
          <td>${a.holders}</td>
          <td>${a.total_shares}</td>
          <td>${fmtUSD(a.total_value)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="muted" style="text-align:center;">No active platform positions.</td></tr>';
}

// =====================================================================
// 6. MARKET DATA MANAGEMENT (Free-Tier Twelve Data & Finnhub)
// =====================================================================

async function loadMarketData() {
  const d = await adminApi('/market-data');
  const st = d.stats || {};
  const td = d.providers?.twelveData || {};
  const fh = d.providers?.finnhub || {};

  $('mdTdMin').textContent = `${td.minuteUsed || 0} / ${td.minuteMax || 7}`;
  $('mdTdDay').textContent = `${td.dailyUsed || 0} / ${td.dailyLimit || 800}`;
  $('mdFhMin').textContent = `${fh.minuteUsed || 0} / ${fh.minuteMax || 55}`;
  $('mdCacheRate').textContent = `${st.cacheSize || 0} / ${st.hitRatePct || 0}%`;

  $('mdQuoteTtl').value = Math.round((d.config?.quoteTtlMs || 60000) / 1000);
  $('mdCandleTtl').value = Math.round((d.config?.candleTtlMs || 300000) / 1000);
  $('mdPauseRefresh').checked = Boolean(d.config?.autoRefreshPaused);

  const tdPct = Math.min(100, Math.round(((td.dailyUsed || 0) / (td.dailyLimit || 800)) * 100));
  const fhPct = Math.min(100, Math.round(((fh.minuteUsed || 0) / (fh.minuteMax || 55)) * 100));

  $('mdProviderCards').innerHTML = `
    <div class="provider-card">
      <div class="detail-head">
        <strong>Twelve Data</strong>
        <span class="badge ${td.configured ? 'active' : 'suspended'}">${td.configured ? 'Configured' : 'Missing Key'}</span>
      </div>
      <div class="muted" style="font-size:0.8rem;margin-top:4px;">${esc(td.tier)}</div>
      <div class="quota-bar"><div class="quota-bar-fill" style="width:${tdPct}%"></div></div>
      <div style="font-size:0.82rem;">Daily: ${td.dailyUsed || 0}/${td.dailyLimit || 800} · Errors: ${td.totalErrors || 0}</div>
    </div>
    <div class="provider-card">
      <div class="detail-head">
        <strong>Finnhub</strong>
        <span class="badge ${fh.configured ? 'active' : 'suspended'}">${fh.configured ? 'Configured' : 'Missing Key'}</span>
      </div>
      <div class="muted" style="font-size:0.8rem;margin-top:4px;">${esc(fh.tier)}</div>
      <div class="quota-bar"><div class="quota-bar-fill" style="width:${fhPct}%"></div></div>
      <div style="font-size:0.82rem;">Minute: ${fh.minuteUsed || 0}/${fh.minuteMax || 55} · Errors: ${fh.totalErrors || 0}</div>
    </div>
  `;

  const logs = d.recentLogs || [];
  $('mdLogsBody').innerHTML = logs.length
    ? logs.map((l) => `
        <tr>
          <td>${fmtDateTime(l.timestamp)}</td>
          <td>${esc(l.provider)}</td>
          <td>${esc(l.endpoint)}</td>
          <td><strong>${esc(l.symbol)}</strong></td>
          <td><span class="badge ${l.ok ? 'active' : 'suspended'}">${l.ok ? 'OK' : 'ERR'}</span></td>
          <td>${l.ms != null ? `${l.ms} ms` : esc(l.error || '—')}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="muted" style="text-align:center;">No live API calls recorded in this session yet.</td></tr>';
}

// =====================================================================
// 7. REPORTS & ANALYTICS
// =====================================================================

async function loadReports() {
  const range = $('reportRange').value;
  $('exportReportCsvBtn').href = `/api/exports/admin/report?range=${encodeURIComponent(range)}`;
  const r = await adminApi(`/reports?range=${encodeURIComponent(range)}`);
  const sum = r.summary || {};
  const wSum = r.walletSummary || {};

  $('rpVolume').textContent = fmtUSD(sum.totalVolume || 0);
  $('rpOrders').textContent = `${sum.tradeCount || 0} (${sum.buyCount || 0} / ${sum.sellCount || 0})`;
  $('rpTraders').textContent = sum.activeTraders || 0;
  const netFlow = Number(wSum.depositVolume || 0) - Number(wSum.withdrawalVolume || 0);
  const flowEl = $('rpWalletFlow');
  flowEl.textContent = (netFlow >= 0 ? '+' : '') + fmtUSD(netFlow);
  flowEl.className = `summary-value ${netFlow >= 0 ? 'up' : 'down'}`;

  const top = r.topSymbols || [];
  $('rpTopSymbolsBody').innerHTML = top.length
    ? top.map((s) => `
        <tr>
          <td><strong>${esc(s.symbol)}</strong></td>
          <td>${s.trades}</td>
          <td>${s.shares}</td>
          <td>${fmtUSD(s.volume)}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="muted" style="text-align:center;">No trades in selected range.</td></tr>';

  const daily = r.dailyVolume || [];
  const ctx = $('adminVolumeChart');
  if (adminVolumeChart) adminVolumeChart.destroy();
  adminVolumeChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: daily.map((d) => d.day),
      datasets: [
        {
          label: 'Buy Volume ($)',
          data: daily.map((d) => Number(d.buy_volume || 0)),
          backgroundColor: 'rgba(74, 222, 128, 0.72)',
          borderRadius: 6,
        },
        {
          label: 'Sell Volume ($)',
          data: daily.map((d) => Number(d.sell_volume || 0)),
          backgroundColor: 'rgba(248, 113, 113, 0.72)',
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: { stacked: true, ticks: { color: '#fff' }, grid: { display: false } },
        y: { stacked: true, ticks: { color: '#fff', callback: (v) => '$' + Number(v).toLocaleString() }, grid: { color: 'rgba(255,255,255,0.08)' } },
      },
      plugins: { legend: { labels: { color: '#fff' } } },
    },
  });
}

// =====================================================================
// 8. AUDIT LOGS
// =====================================================================

async function loadAuditLogs() {
  auditLogs = await adminApi('/audit-logs?limit=250');
  renderAuditLogs();
}

function renderAuditLogs() {
  const q = $('auditSearch').value.trim().toLowerCase();
  const cat = $('auditCategoryFilter').value;

  const list = auditLogs.filter((l) => {
    const matchCat = cat === 'all' || l.category === cat;
    const rawDetails = JSON.stringify(l.details || {}).toLowerCase();
    const matchText = !q ||
      (l.admin_username || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q) ||
      (l.target_id || '').toLowerCase().includes(q) ||
      rawDetails.includes(q);
    return matchCat && matchText;
  });

  const tbody = $('auditLogsBody');
  tbody.innerHTML = list.length
    ? list.map((l) => `
        <tr>
          <td>${fmtDateTime(l.created_at)}</td>
          <td>${esc(l.admin_username)}</td>
          <td><span class="badge info">${esc(l.category)}</span></td>
          <td><strong>${esc(l.action)}</strong></td>
          <td class="muted">${esc(l.target_type || '—')}: ${esc(l.target_id || '—')}</td>
          <td class="muted" style="max-width:340px;white-space:normal;">${esc(JSON.stringify(l.details || {}))}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" class="muted" style="text-align:center;">No audit logs found.</td></tr>';
}

// =====================================================================
// EVENT WIRING & INITIALIZATION
// =====================================================================

document.addEventListener('DOMContentLoaded', () => {
  // Tabs
  $('adminTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn[data-tab]');
    if (btn) switchTab(btn.dataset.tab);
  });

  $('refreshModuleBtn').addEventListener('click', loadActiveTab);

  // Announcements modal & actions
  $('newAnnouncementBtn').addEventListener('click', () => openAnnouncementModal(null));
  $('closeAnnouncementModal').addEventListener('click', () => { $('announcementModal').hidden = true; });
  $('announcementModal').addEventListener('click', (e) => {
    if (e.target === $('announcementModal')) $('announcementModal').hidden = true;
  });
  $('announcementForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('annId').value;
    const payload = {
      title: $('annTitle').value.trim(),
      message: $('annMessage').value.trim(),
      severity: $('annSeverity').value,
      is_pinned: $('annPinned').checked,
      is_active: $('annActive').checked,
    };
    try {
      if (id) {
        await adminApi(`/announcements/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showMessage('Announcement updated.', 'success');
      } else {
        await adminApi('/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showMessage('Announcement published to User Dashboard.', 'success');
      }
      $('announcementModal').hidden = true;
      await loadOverview();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });

  $('announcementsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-ann-action]');
    const card = e.target.closest('[data-ann-id]');
    if (!btn || !card) return;
    const ann = announcements.find((a) => a.announcement_id === card.dataset.annId);
    if (!ann) return;
    const action = btn.dataset.annAction;

    try {
      if (action === 'edit') {
        openAnnouncementModal(ann);
        return;
      }
      if (action === 'toggle-pin') {
        await adminApi(`/announcements/${ann.announcement_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_pinned: !ann.is_pinned }),
        });
      } else if (action === 'toggle-active') {
        await adminApi(`/announcements/${ann.announcement_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: !ann.is_active }),
        });
      } else if (action === 'delete') {
        await adminApi(`/announcements/${ann.announcement_id}`, { method: 'DELETE' });
      }
      await loadOverview();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });

  // Users filters & row clicks
  for (const id of ['userSearch', 'statusFilter', 'sortBy']) {
    $(id).addEventListener(id === 'userSearch' ? 'input' : 'change', () => {
      if (!mutationPending) renderUsersTable();
    });
  }
  $('userBody').addEventListener('click', (e) => {
    if (mutationPending) return;
    const row = e.target.closest('tr[data-id]');
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest('[data-action="toggle"]')) {
      toggleUserStatus(id);
      return;
    }
    selectedUserId = id;
    renderUsersTable();
    renderUserDetails();
  });

  // Stocks CRUD
  $('addStockBtn').addEventListener('click', () => populateStockForm(null));
  $('resetStockFormBtn').addEventListener('click', () => populateStockForm(null));
  $('stockFilterSearch').addEventListener('input', renderStocksTable);
  $('stockStatusFilter').addEventListener('change', renderStocksTable);
  $('stockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('editStockId').value;
    const payload = {
      symbol: $('stockSymbolInput').value.trim().toUpperCase(),
      company_name: $('stockNameInput').value.trim(),
      exchange: $('stockExchangeInput').value.trim(),
      sector: $('stockSectorInput').value.trim(),
      status: $('stockStatusInput').value,
    };
    try {
      if (id) {
        await adminApi(`/stocks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showMessage(`Updated ${payload.symbol}.`, 'success');
      } else {
        await adminApi('/stocks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        showMessage(`Added ${payload.symbol} to supported stocks.`, 'success');
      }
      populateStockForm(null);
      await loadStocks();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });

  $('stocksBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-stock-action]');
    const row = e.target.closest('tr[data-stock-id]');
    if (!btn || !row) return;
    const s = stocks.find((x) => x.stock_id === row.dataset.stockId);
    if (!s) return;
    const action = btn.dataset.stockAction;

    try {
      if (action === 'edit') {
        populateStockForm(s);
        return;
      }
      if (action === 'toggle') {
        const nextStatus = s.status === 'active' ? 'halted' : 'active';
        await adminApi(`/stocks/${s.stock_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });
        showMessage(`${s.symbol} status set to ${nextStatus}.`, 'success');
      } else if (action === 'delete') {
        await adminApi(`/stocks/${s.stock_id}`, { method: 'DELETE' });
        showMessage(`Removed ${s.symbol}.`, 'success');
      }
      await loadStocks();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });

  // Trades filters & selection
  $('tradeSearch').addEventListener('input', renderTradesTable);
  $('tradeTypeFilter').addEventListener('change', renderTradesTable);
  $('tradeReviewFilter').addEventListener('change', renderTradesTable);
  $('tradesBody').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-tx-id]');
    if (!row) return;
    selectedTradeId = row.dataset.txId;
    renderTradesTable();
    renderTradeDetails();
  });

  // Portfolios search & selection
  $('portfolioSearch').addEventListener('input', renderPortfoliosTable);
  $('portfoliosBody').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-pf-uid]');
    if (!row) return;
    selectedPortfolioUserId = row.dataset.pfUid;
    renderPortfoliosTable();
    renderPortfolioDetails();
  });

  // Market data management
  $('marketConfigForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await adminApi('/market-data/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteTtlSec: Number($('mdQuoteTtl').value),
          candleTtlSec: Number($('mdCandleTtl').value),
          autoRefreshPaused: $('mdPauseRefresh').checked,
        }),
      });
      showMessage('Market feed configuration updated.', 'success');
      await loadMarketData();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });

  $('mdClearCacheBtn').addEventListener('click', async () => {
    try {
      const res = await adminApi('/market-data/cache/clear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      showMessage(`Cleared ${res.cleared} cached market entries.`, 'success');
      await loadMarketData();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });

  $('mdRefreshQuotesBtn').addEventListener('click', async () => {
    try {
      const res = await adminApi('/market-data/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: [] }),
      });
      showMessage(`Refreshed ${(res.results || []).length} active stock quotes.`, 'success');
      await loadMarketData();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });

  $('mdRunRefreshBtn').addEventListener('click', async () => {
    const raw = $('mdRefreshSymbols').value;
    const symbols = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return showMessage('Enter comma-separated ticker symbols to refresh.', 'error');
    try {
      const res = await adminApi('/market-data/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      showMessage(`Refreshed quotes for ${symbols.join(', ')}.`, 'success');
      $('mdRefreshSymbols').value = '';
      await loadMarketData();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  });

  // Reports range
  $('reportRange').addEventListener('change', loadReports);

  // Audit logs
  $('auditSearch').addEventListener('input', renderAuditLogs);
  $('auditCategoryFilter').addEventListener('change', renderAuditLogs);

  loadActiveTab();
});
