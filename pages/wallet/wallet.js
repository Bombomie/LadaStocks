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
let chartInstance = null;

async function fetchWallet() {
  const res = await fetch('/api/wallet', { credentials: 'include' });
  if (!res.ok) throw new Error('Could not load wallet');
  return res.json(); // { balance }
}

async function fetchWalletHistory() {
  const res = await fetch('/api/wallet/history', { credentials: 'include' });
  if (!res.ok) return [];
  return res.json(); // [{ date, balance }]
}

async function fetchHoldingsValue() {
  const res = await fetch('/api/portfolio/holdings', { credentials: 'include' });
  if (!res.ok) return 0;
  const holdings = await res.json();
  if (!holdings.length) return 0;
  const symbols = holdings.map((h) => h.symbol);
  const qRes = await fetch(`/api/market/quote?symbols=${symbols.join(',')}`, { credentials: 'include' });
  const quotes = await qRes.json();
  const quoteMap = symbols.length === 1 ? { [symbols[0]]: quotes } : quotes;
  return holdings.reduce((sum, h) => sum + (parseFloat(quoteMap[h.symbol]?.close) || 0) * h.quantity, 0);
}

async function fetchActivity() {
  const res = await fetch('/api/transactions', { credentials: 'include' });
  if (!res.ok) return [];
  return res.json();
}

function renderChart(history) {
  const ctx = document.getElementById('balanceChart');
  const labels = history.map((h) => h.date);
  const data = history.map((h) => h.balance);

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Cash Balance',
        data,
        borderColor: '#FFC349',
        backgroundColor: 'rgba(255, 195, 73, 0.15)',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      scales: {
        y: { ticks: { color: '#fff' }, grid: { color: 'rgba(255,255,255,0.08)' } },
        x: { ticks: { color: '#fff' }, grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderActivity(transactions) {
  const tbody = document.getElementById('activityBody');
  tbody.innerHTML = '';
  transactions.slice(0, 15).forEach((tx) => {
    const isSell = /sell/i.test(tx.tradeType);
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="change ${isSell ? 'up' : 'down'}">${tx.tradeType}</td>
      <td class="symbol">${tx.symbol}</td>
      <td>${tx.amount != null ? fmtUSD(tx.amount) : `${tx.shares} sh`}</td>
      <td>${new Date(tx.tradeEntered).toLocaleDateString('en-US')}</td>
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
  // loadCurrentUser();
  try {
    const [wallet, history, portfolioValue, transactions] = await Promise.all([
      fetchWallet(),
      fetchWalletHistory(),
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

    if (history.length) renderChart(history);
    renderActivity(transactions);
  } catch (err) {
    console.error('Wallet load error:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('depositBtn').addEventListener('click', () => performFundAction('deposit'));
  document.getElementById('withdrawBtn').addEventListener('click', () => performFundAction('withdraw'));
});