// pages/wallet/wallet.js

let allActivity = [];
let walletChart = null;

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

const fmtUSD = (n) => Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function setWalletMsg(msg, isSuccess = false) {
  const el = document.getElementById('walletMessage');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('success', Boolean(msg) && isSuccess);
  el.classList.toggle('error', Boolean(msg) && !isSuccess);
}

async function fetchJson(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 401) {
    window.location.replace('../authentication/login/login.html');
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || `Request failed (${res.status})`);
  return data;
}

function renderWalletChart(history) {
  const canvas = document.getElementById('walletHistoryChart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (walletChart) walletChart.destroy();

  const labels = (history || []).map((p) => p.date);
  const values = (history || []).map((p) => Number(p.balance ?? 0));

  walletChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Cash Balance ($)',
          data: values,
          borderColor: '#FFC349',
          backgroundColor: 'rgba(255, 195, 73, 0.16)',
          fill: true,
          tension: 0.25,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          ticks: {
            color: '#fff',
            callback: (v) => `$${Number(v).toLocaleString('en-US')}`,
          },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
        x: {
          ticks: { color: '#fff', maxTicksLimit: 8 },
          grid: { display: false },
        },
      },
      plugins: {
        legend: { labels: { color: '#fff' } },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Cash Balance: ${fmtUSD(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}

function renderActivity() {
  const tbody = document.getElementById('activityBody');
  const filterVal = document.getElementById('activityFilter')?.value || 'all';
  const rows = filterVal === 'all'
    ? allActivity
    : allActivity.filter((tx) => tx.category === filterVal);

  tbody.innerHTML = '';

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">No matching activity found.</td></tr>';
    return;
  }

  rows.slice(0, 25).forEach((tx) => {
    const isCredit = /sell|deposit/i.test(tx.tradeType);
    const dateStr = tx.tradeEntered ? new Date(tx.tradeEntered).toLocaleString('en-US') : 'N/A';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="change ${isCredit ? 'up' : 'down'}">${esc(tx.tradeType)}</td>
      <td>${esc(tx.symbol)}${tx.description ? ` <span style="color:var(--text-muted);font-size:0.8rem;">(${esc(tx.description)})</span>` : ''}</td>
      <td class="change ${isCredit ? 'up' : 'down'}">${isCredit ? '+' : '-'}${fmtUSD(tx.amount ?? 0)}</td>
      <td class="mono-id">${esc(tx.confirmation || '—')}</td>
      <td>${esc(dateStr)}</td>
    `;
    tbody.appendChild(row);
  });
}

async function performFundAction(type) {
  const input = document.getElementById('fundAmount');
  const depositBtn = document.getElementById('depositBtn');
  const withdrawBtn = document.getElementById('withdrawBtn');
  const amount = parseFloat(input.value);

  if (!Number.isFinite(amount) || amount <= 0) {
    setWalletMsg('Please enter a positive USD amount.', false);
    return;
  }

  depositBtn.disabled = true;
  withdrawBtn.disabled = true;
  setWalletMsg('Processing request...', true);

  try {
    const res = await fetch(`/api/wallet/${type}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || `Could not complete ${type}.`);
    }
    input.value = '';
    setWalletMsg(data.message || `${type} completed.`, true);
    await init();
  } catch (err) {
    setWalletMsg(err.message || `Could not ${type}. Please try again.`, false);
  } finally {
    depositBtn.disabled = false;
    withdrawBtn.disabled = false;
  }
}

async function init() {
  const tbody = document.getElementById('activityBody');
  tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Loading activity...</td></tr>';

  try {
    const [wallet, summary, transactions, history] = await Promise.all([
      fetchJson('/api/wallet'),
      fetchJson('/api/portfolio/summary').catch(() => ({ portfolioValue: 0 })),
      fetchJson('/api/transactions').catch(() => []),
      fetchJson('/api/wallet/history').catch(() => []),
    ]);

    allActivity = Array.isArray(transactions) ? transactions : [];

    document.getElementById('cashBalance').textContent = fmtUSD(wallet.balance);
    document.getElementById('portfolioValue').textContent = fmtUSD(summary?.portfolioValue ?? 0);
    document.getElementById('startingBalanceLabel').textContent = `Starting Balance: ${fmtUSD(wallet.starting_balance ?? 100000)}`;

    const earning = allActivity
      .filter((t) => /sell/i.test(t.tradeType))
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const spending = allActivity
      .filter((t) => /buy/i.test(t.tradeType))
      .reduce((s, t) => s + Number(t.amount || 0), 0);

    document.getElementById('totalEarning').textContent = fmtUSD(earning);
    document.getElementById('totalSpending').textContent = fmtUSD(spending);

    renderWalletChart(history);
    renderActivity();
  } catch (err) {
    if (err.message === 'Unauthorized') return;
    console.error('Wallet load error:', err);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--accent-down);">Failed to load wallet data.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init();
  document.getElementById('depositBtn')?.addEventListener('click', () => performFundAction('deposit'));
  document.getElementById('withdrawBtn')?.addEventListener('click', () => performFundAction('withdraw'));
  document.getElementById('activityFilter')?.addEventListener('change', renderActivity);

  document.getElementById('presetButtons')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const input = document.getElementById('fundAmount');
    input.value = btn.dataset.amt || '';
    input.focus();
  });
});
