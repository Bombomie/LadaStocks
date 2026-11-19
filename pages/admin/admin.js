let users = [];
let selectedUserId = null;
let mutationPending = false;
const pendingWalletRequests = new Map();

// ----- helpers ------------------------------------------------------

const $ = (id) => document.getElementById(id);
const fmtUSD = (n) => n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US') : 'Never');

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

const portfolioValue = (u) => u.holdings.reduce((s, h) => s + h.quantity * h.price, 0);
const cashBalance = (u) => Number(u.wallet?.balance ?? 0);
const netWorth = (u) => cashBalance(u) + portfolioValue(u);

// ----- data loading -------------------------------------------------

async function adminFetch(path = '', options) {
  const res = await fetch(`/api/admin/users${path}`, { credentials: 'same-origin', ...options });
  if (res.status === 401) window.location.replace('../authentication/login/login.html');
  if (res.status === 403) window.location.replace('../dashboard/dashboard.html');
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.message || 'The admin request could not be completed.');
    error.status = res.status;
    throw error;
  }
  return data;
}

function showMessage(message = '') {
  $('adminMessage').textContent = message;
  $('adminMessage').hidden = !message;
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
    balance:   (a, b) => cashBalance(b) - cashBalance(a),
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
  $('totalCash').textContent = fmtUSD(users.reduce((s, u) => s + cashBalance(u), 0));
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
            <button class="mini-btn" data-action="view" type="button">View</button>
            ${u.isAdmin && u.status === 'active' ? '' : `<button class="mini-btn ${u.status === 'active' ? 'danger' : 'ok'}" data-action="toggle" type="button">
              ${u.status === 'active' ? 'Suspend' : 'Activate'}
            </button>`}
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

  const pnl = u.wallet ? netWorth(u) - u.wallet.starting_balance : null;
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
      <div class="detail-item"><span class="k">Cash Balance</span><span class="v">${fmtUSD(u.wallet?.balance)}</span></div>
      <div class="detail-item"><span class="k">Portfolio Value</span><span class="v">${fmtUSD(portfolioValue(u))}</span></div>
      <div class="detail-item"><span class="k">Starting Balance</span><span class="v">${fmtUSD(u.wallet?.starting_balance)}</span></div>
      <div class="detail-item"><span class="k">Net P/L</span><span class="v change ${pnl >= 0 ? 'up' : 'down'}">${pnl > 0 ? '+' : ''}${fmtUSD(pnl)}</span></div>
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
    ${u.wallet ? `
    <input type="text" inputmode="decimal" id="adjustAmount" aria-label="Amount" placeholder="Amount"
           style="padding:12px 14px;border-radius:14px;border:1px solid var(--border-soft);background:rgba(255,255,255,0.06);color:#fff;font-size:0.95rem;" />
    <div class="details-actions">
      <button class="buy-btn" id="creditBtn" type="button">Credit</button>
      <button class="sell-btn" id="debitBtn" type="button">Debit</button>
    </div>` : '<p class="muted">This user has no wallet.</p>'}
  `;

  $('creditBtn')?.addEventListener('click', () => adjustWallet(u, 'credit'));
  $('debitBtn')?.addEventListener('click', () => adjustWallet(u, 'debit'));
}

function renderAll() {
  renderSummary();
  renderTable();
  renderDetails();
}

// ----- actions ------------------------------------------------------

async function applyMutation(path, method, body, applyResult) {
  mutationPending = true;
  const buttons = document.querySelectorAll('#userBody button, .details-actions button');
  buttons.forEach((button) => { button.disabled = true; });
  showMessage();
  try {
    const data = await adminFetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    applyResult(data);
    renderAll();
    return true;
  } catch (error) {
    showMessage(error.message);
    return error.status >= 400 && error.status < 500;
  } finally {
    mutationPending = false;
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function toggleStatus(userId) {
  const u = users.find((x) => x.user_id === userId);
  if (!u) return;
  const status = u.status === 'active' ? 'suspended' : 'active';
  return applyMutation(`/${userId}/status`, 'PATCH', { status }, (data) => { u.status = data.status; });
}

async function adjustWallet(u, direction) {
  if (mutationPending) return;
  const amount = $('adjustAmount').value.trim().replace(/^\./, '0.');
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(amount) || Number(amount) === 0) {
    showMessage('Enter a valid amount with up to two decimal places.');
    return;
  }
  const key = `${u.user_id}:${direction}:${Number(amount).toFixed(2)}`;
  const requestId = pendingWalletRequests.get(key) ?? crypto.randomUUID();
  pendingWalletRequests.set(key, requestId);
  const finished = await applyMutation(`/${u.user_id}/wallet`, 'POST', { amount, direction, requestId }, (data) => {
    u.wallet.balance = data.balance;
    showMessage('Wallet balance updated.');
  });
  if (finished) pendingWalletRequests.delete(key);
}

// ----- init ---------------------------------------------------------

async function init() {
  $('userBody').innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--text-muted);">Loading users...</td></tr>';
  try {
    users = await adminFetch();
    renderAll();
  } catch (err) {
    console.error('Admin load error:', err);
    $('userBody').innerHTML = '<tr><td colspan="7" style="text-align:center; color: var(--accent-down);">Failed to load users.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  for (const id of ['userSearch', 'statusFilter', 'sortBy']) {
    $(id).addEventListener(id === 'userSearch' ? 'input' : 'change', () => {
      if (!mutationPending) renderTable();
    });
  }

  $('userBody').addEventListener('click', (event) => {
    if (mutationPending) return;
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
