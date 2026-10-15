async function loadCurrentUser() {
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET', credentials: 'include', headers: { Accept: 'application/json' },
    });
    if (response.status === 401) return window.location.replace('../authentication/login/login.html');
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    const el = document.querySelector('.username');
    if (el) el.textContent = data.user.username || 'User';
  } catch (err) {
    console.error('Auth error:', err);
    window.location.replace('../authentication/login/login.html');
  }
}

const fmtUSD = (n) => (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

async function fetchWallet() {
  const res = await fetch('/api/wallet', { credentials: 'include' });
  if (!res.ok) throw new Error('Could not load wallet');
  return res.json(); // { balance }
}

async function fetchHoldingsValue() {
  const res = await fetch('/api/portfolio/holdings', { credentials: 'include' });
  if (!res.ok) return 0;
  const holdings = await res.json();
  if (!holdings.length) return 0;

  // Fetch all quotes IN PARALLEL instead of one by one
  const quotePromises = holdings.map(h => 
    fetch(`/api/stocks/quote/${h.symbol}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null) // Fail gracefully if a single stock fails
  );
  
  const quotes = await Promise.all(quotePromises);

  let totalValue = 0;
  holdings.forEach((h, index) => {
    const quote = quotes[index];
    // Fallback across possible API response shapes
    const price = parseFloat(quote?.data?.close || quote?.data?.price || quote?.price) || 0;
    totalValue += price * h.quantity;
  });

  return totalValue;
}

async function fetchActivity() {
  const res = await fetch('/api/transactions', { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}

function renderActivity(transactions) {
  const tbody = document.getElementById('activityBody');
  tbody.innerHTML = '';
  
  if (!transactions.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No recent transactions.</td></tr>';
    return;
  }

  // Slice the first 10 most recent transactions
  transactions.slice(0, 10).forEach((tx) => {
    const isSell = /sell|withdrawal/i.test(tx.tradeType);
    const dateStr = tx.tradeEntered ? new Date(tx.tradeEntered).toLocaleDateString('en-US') : 'N/A';
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="change ${isSell ? 'up' : 'down'}">${tx.tradeType}</td>
      <td class="symbol">${tx.symbol}</td>
      <td>${tx.amount != null ? fmtUSD(tx.amount) : `${tx.shares} sh`}</td>
      <td>${dateStr}</td>
    `;
    tbody.appendChild(row);
  });
}

async function performFundAction(type) {
  const input = document.getElementById('fundAmount');
  const amount = parseFloat(input.value);
  if (!amount || amount <= 0) {
    alert('Enter a valid amount.');
    return;
  }
  try {
    const res = await fetch(`/api/wallet/${type}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    if (!res.ok) throw new Error('Request failed');
    input.value = '';
    await init();
  } catch (err) {
    alert(`Could not ${type}. Please try again.`);
  }
}

async function init() {
  // Show loading states immediately
  document.getElementById('cashBalance').textContent = 'Loading...';
  document.getElementById('portfolioValue').textContent = 'Loading...';
  document.getElementById('totalEarning').textContent = 'Loading...';
  document.getElementById('totalSpending').textContent = 'Loading...';
  
  const tbody = document.getElementById('activityBody');
  tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">Loading activity...</td></tr>';

  // loadCurrentUser();
  try {
    const [wallet, portfolioValue, transactions] = await Promise.all([
      fetchWallet(),
      fetchHoldingsValue(),
      fetchActivity(),
    ]);

    document.getElementById('cashBalance').textContent = fmtUSD(wallet.balance);
    document.getElementById('portfolioValue').textContent = fmtUSD(portfolioValue);

    const earning = transactions.filter((t) => /sell/i.test(t.tradeType))
      .reduce((s, t) => s + (t.amount || 0), 0);
    const spending = transactions.filter((t) => /buy/i.test(t.tradeType))
      .reduce((s, t) => s + (t.amount || 0), 0);
    document.getElementById('totalEarning').textContent = fmtUSD(earning);
    document.getElementById('totalSpending').textContent = fmtUSD(spending);

    renderActivity(transactions);
  } catch (err) {
    console.error('Wallet load error:', err);
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--accent-down);">Failed to load data.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('depositBtn').addEventListener('click', () => performFundAction('deposit'));
  document.getElementById('withdrawBtn').addEventListener('click', () => performFundAction('withdraw'));
});