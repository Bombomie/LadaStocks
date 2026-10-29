// portfolio.js

const marketChartCtx = document.getElementById('portfolioChart');
let chartInstance = null;

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

async function fetchHoldings() {
  const res = await fetch('/api/portfolio/holdings', { credentials: 'include' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    console.error('Holdings fetch failed:', res.status, data);
    throw new Error(data.detail || data.message || 'Could not load holdings');
  }
  return res.json();
}

async function fetchWalletBalance() {
  const res = await fetch('/api/trading/balance', { credentials: 'include' });
  if (!res.ok) return 0;
  const data = await res.json();
  return data.balance;
}

// Fetch all quotes in parallel using the existing single-symbol endpoint
async function fetchQuotes(symbols) {
  const quotePromises = symbols.map(sym =>
    fetch(`/api/stocks/quote/${sym}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
  );
  const results = await Promise.all(quotePromises);

  const map = {};
  symbols.forEach((sym, i) => {
    map[sym] = results[i]?.data || {};
  });
  return map;
}

// Fetch historical candles using the existing candles endpoint
async function fetchHistory(symbol, outputsize = 90) {
  const res = await fetch(`/api/stocks/candles/${symbol}?interval=1day&outputsize=${outputsize}`, {
    credentials: 'include',
  });
  if (!res.ok) return [];
  const data = await res.json();
  // candleData is already oldest -> newest based on the route implementation
  return data?.data || [];
}

const fmtUSD = (n) => (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtSigned = (n, opts = {}) => `${n > 0 ? '+' : ''}${(n ?? 0).toLocaleString('en-US', opts)}`;

let holdings = [];
let selectedSymbol = null;

function computeSummary() {
  const portfolioValue = holdings.reduce((s, h) => s + h.value, 0);
  const totalCost = holdings.reduce((s, h) => s + h.avgBuyPrice * h.quantity, 0);
  const todaysChange = holdings.reduce((s, h) => s + h.value * (h.changePct / 100), 0);
  const totalReturnPct = totalCost ? ((portfolioValue - totalCost) / totalCost) * 100 : 0;
  return { portfolioValue, totalCost, todaysChange, totalReturnPct };
}

function renderSummary(cashBalance) {
  const { portfolioValue, todaysChange, totalReturnPct } = computeSummary();

  document.getElementById('portfolioValue').textContent = fmtUSD(portfolioValue);
  document.getElementById('cashBalance').textContent = fmtUSD(cashBalance);

  const changeEl = document.getElementById('todaysChange');
  changeEl.textContent = fmtSigned(todaysChange, { style: 'currency', currency: 'USD' });
  changeEl.classList.toggle('up', todaysChange >= 0);
  changeEl.classList.toggle('down', todaysChange < 0);

  const returnEl = document.getElementById('totalReturn');
  returnEl.textContent = `${fmtSigned(totalReturnPct, { maximumFractionDigits: 2 })}%`;
  returnEl.classList.toggle('up', totalReturnPct >= 0);
  returnEl.classList.toggle('down', totalReturnPct < 0);
}

function renderHoldings() {
  const tbody = document.getElementById('watchlistBody');
  tbody.innerHTML = '';

  if (!holdings.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
          You don't own any stocks yet. Visit the Charts page to make your first trade.
        </td>
      </tr>`;
    return;
  }

  holdings.forEach((h) => {
    const isUp = h.changePct >= 0;
    const row = document.createElement('tr');
    row.className = h.symbol === selectedSymbol ? 'selected' : '';
    row.innerHTML = `
      <td class="symbol">${h.symbol}</td>
      <td class="company">${h.company}</td>
      <td>${fmtUSD(h.price)}</td>
      <td>${h.quantity}</td>
      <td>${fmtUSD(h.value)}</td>
      <td class="change ${h.capitalGains >= 0 ? 'up' : 'down'}">${fmtSigned(h.capitalGains, { style: 'currency', currency: 'USD' })}</td>
      <td>${h.currency || 'USD'}</td>
      <td class="change ${isUp ? 'up' : 'down'}">${fmtSigned(h.changePct, { maximumFractionDigits: 2 })}%</td>
    `;
    row.addEventListener('click', () => {
      selectedSymbol = h.symbol;
      renderHoldings();
      renderDetails();
    });
    tbody.appendChild(row);
  });
}

function renderDetails() {
  const container = document.getElementById('detailsBody');
  const h = holdings.find((x) => x.symbol === selectedSymbol);

  if (!h) {
    container.innerHTML = `<p class="details-empty">Select a holding to see details.</p>`;
    return;
  }

  const capitalGainsPct = h.avgBuyPrice > 0
    ? ((h.price - h.avgBuyPrice) / h.avgBuyPrice) * 100
    : 0;

  container.innerHTML = `
    <div class="stock-name">${h.company}</div>
    <div class="stock-symbol">${h.symbol}</div>
    <div class="stock-price">${fmtUSD(h.price)}</div>
    <div class="stock-change ${h.changePct >= 0 ? 'up' : 'down'}">${fmtSigned(h.changePct, { maximumFractionDigits: 2 })}% today</div>
    <div class="details-stats">
      <div><span>Quantity</span><span>${h.quantity}</span></div>
      <div><span>Avg. Cost</span><span>${fmtUSD(h.avgBuyPrice)}</span></div>
      <div><span>Market Value</span><span>${fmtUSD(h.value)}</span></div>
      <div><span>Capital Gains</span><span class="${h.capitalGains >= 0 ? 'up' : 'down'}" style="color: ${h.capitalGains >= 0 ? 'var(--accent-up)' : 'var(--accent-down)'};">${fmtSigned(h.capitalGains, { style: 'currency', currency: 'USD' })}</span></div>
      <div><span>Return</span><span class="${capitalGainsPct >= 0 ? 'up' : 'down'}" style="color: ${capitalGainsPct >= 0 ? 'var(--accent-up)' : 'var(--accent-down)'};">${fmtSigned(capitalGainsPct, { maximumFractionDigits: 2 })}%</span></div>
    </div>
    <a href="../charts/charts.html" class="view-chart-link">Trade on Charts &rarr;</a>
  `;
}

async function renderChart() {
  if (!holdings.length) {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  // Fetch all histories in parallel
  const histories = await Promise.all(holdings.map(h => fetchHistory(h.symbol)));

  // Use the longest history as the label set
  const labels = histories
    .reduce((longest, h) => h.length > longest.length ? h : longest, [])
    .map(v => v.time);

  const palette = ['#FFC349', '#4ade80', '#60a5fa', '#f87171', '#a78bfa', '#fbbf24', '#34d399', '#f472b6'];

  const datasets = holdings.map((h, i) => {
    const hist = histories[i] || [];
    return {
      label: h.symbol,
      data: hist.map(v => parseFloat(v.close) * h.quantity),
      borderColor: palette[i % palette.length],
      backgroundColor: palette[i % palette.length] + '20',
      fill: true,
      tension: 0.25,
    };
  });

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(marketChartCtx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          stacked: true,
          ticks: {
            color: '#fff',
            callback: (v) => '$' + v.toLocaleString('en-US'),
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
            label: (ctx) => ` ${ctx.dataset.label}: ${fmtUSD(ctx.parsed.y)}`,
          },
        },
      },
    },
  });
}

async function init() {
  // Show loading states
  document.getElementById('portfolioValue').textContent = 'Loading...';
  document.getElementById('cashBalance').textContent = 'Loading...';
  document.getElementById('todaysChange').textContent = 'Loading...';
  document.getElementById('totalReturn').textContent = 'Loading...';

  // loadCurrentUser();
  try {
    const [raw, cashBalance] = await Promise.all([
      fetchHoldings(),
      fetchWalletBalance(),
    ]);

    if (raw.length) {
      const symbols = raw.map(h => h.symbol);
      const quotes = await fetchQuotes(symbols);

      holdings = raw.map(h => {
        const q = quotes[h.symbol] || {};
        const price = parseFloat(q?.currentPrice || q?.close || q?.price || 0);
        const changePct = parseFloat(q?.change || q?.percent_change || 0);
        return {
          symbol: h.symbol,
          company: h.company || q?.name || h.symbol,
          currency: q?.currency || 'USD',
          quantity: h.quantity,
          avgBuyPrice: h.avg_buy_price,  // map from snake_case to camelCase
          price,
          changePct,
          value: price * h.quantity,
          capitalGains: (price - h.avg_buy_price) * h.quantity,
        };
      });
    } else {
      holdings = [];
    }

    renderSummary(cashBalance);
    renderHoldings();
    renderDetails();
    await renderChart();
  } catch (err) {
    console.error('Portfolio load error:', err);
    document.getElementById('portfolioValue').textContent = 'Error';
    document.getElementById('cashBalance').textContent = 'Error';
    document.getElementById('todaysChange').textContent = 'Error';
    document.getElementById('totalReturn').textContent = 'Error';
  }
}

document.addEventListener('DOMContentLoaded', init);