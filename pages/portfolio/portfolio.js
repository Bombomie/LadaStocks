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
  if (!res.ok) throw new Error('Could not load holdings');
  return res.json(); // expects [{ symbol, quantity, avgBuyPrice }, ...]
}

async function fetchQuotes(symbols) {
  const res = await fetch(`/api/market/quote?symbols=${symbols.join(',')}`, { credentials: 'include' });
  const data = await res.json();
  // Twelve Data returns a single object if one symbol, keyed object if multiple
  return symbols.length === 1 ? { [symbols[0]]: data } : data;
}

async function fetchHistory(symbol, days = 90) {
  const res = await fetch(`/api/market/history?symbol=${symbol}&interval=1day&outputsize=${days}`, { credentials: 'include' });
  const data = await res.json();
  return (data.values || []).slice().reverse(); // oldest -> newest
}

const fmtUSD = (n) => (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtSigned = (n, opts = {}) => `${n > 0 ? '+' : ''}${(n ?? 0).toLocaleString('en-US', opts)}`;

let holdings = [];
let selectedSymbol = null;

function computeSummary() {
  const value = holdings.reduce((s, h) => s + h.value, 0);
  const cost = holdings.reduce((s, h) => s + h.avgBuyPrice * h.quantity, 0);
  const todaysChange = holdings.reduce((s, h) => s + h.value * (h.changePct / 100), 0);
  const totalReturnPct = cost ? ((value - cost) / cost) * 100 : 0;
  return { value, todaysChange, totalReturnPct };
}

function renderSummary() {
  const { value, todaysChange, totalReturnPct } = computeSummary();
  document.getElementById('portfolioValue').textContent = fmtUSD(value);
  const changeEl = document.getElementById('todaysChange');
  changeEl.textContent = fmtSigned(todaysChange, { style: 'currency', currency: 'USD' });
  changeEl.classList.toggle('up', todaysChange >= 0);
  changeEl.classList.toggle('down', todaysChange < 0);
  const returnEl = document.getElementById('totalReturn');
  returnEl.textContent = `${fmtSigned(totalReturnPct, { maximumFractionDigits: 2 })}%`;
  returnEl.classList.toggle('up', totalReturnPct >= 0);
  returnEl.classList.toggle('down', totalReturnPct < 0);
}

function renderWatchlist() {
  const tbody = document.getElementById('watchlistBody');
  tbody.innerHTML = '';
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
      <td>${h.currency}</td>
      <td class="change ${isUp ? 'up' : 'down'}">${fmtSigned(h.changePct, { maximumFractionDigits: 2 })}%</td>
    `;
    row.addEventListener('click', () => { selectedSymbol = h.symbol; renderWatchlist(); renderDetails(); });
    tbody.appendChild(row);
  });
}

function renderDetails() {
  const container = document.getElementById('detailsBody');
  const h = holdings.find((x) => x.symbol === selectedSymbol);
  if (!h) { container.innerHTML = `<p class="details-empty">Select a holding to see details.</p>`; return; }
  container.innerHTML = `
    <div class="stock-name">${h.company}</div>
    <div class="stock-symbol">${h.symbol}</div>
    <div class="stock-price">${fmtUSD(h.price)}</div>
    <div class="stock-change ${h.changePct >= 0 ? 'up' : 'down'}">${fmtSigned(h.changePct, { maximumFractionDigits: 2 })}% today</div>
    <div class="details-stats">
      <div><span>Quantity</span><span>${h.quantity}</span></div>
      <div><span>Avg. Cost</span><span>${fmtUSD(h.avgBuyPrice)}</span></div>
      <div><span>Value</span><span>${fmtUSD(h.value)}</span></div>
      <div><span>Capital Gains</span><span>${fmtUSD(h.capitalGains)}</span></div>
    </div>
  `;
}

async function renderChart() {
  const histories = await Promise.all(holdings.map((h) => fetchHistory(h.symbol)));
  const labels = histories[0]?.map((v) => v.datetime) || [];

  const datasets = holdings.map((h, i) => ({
    label: h.symbol,
    data: histories[i].map((v) => parseFloat(v.close) * h.quantity),
    fill: true,
    tension: 0.25,
  }));

  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(marketChartCtx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      scales: { y: { stacked: true, ticks: { color: '#fff' } }, x: { ticks: { color: '#fff' } } },
      plugins: { legend: { labels: { color: '#fff' } } },
    },
  });
}

async function init() {
  loadCurrentUser();
  try {
    const raw = await fetchHoldings();
    const symbols = raw.map((h) => h.symbol);
    const quotes = symbols.length ? await fetchQuotes(symbols) : {};

    holdings = raw.map((h) => {
      const q = quotes[h.symbol] || {};
      const price = parseFloat(q.close) || 0;
      return {
        symbol: h.symbol,
        quantity: h.quantity,
        avgBuyPrice: h.avgBuyPrice,
        company: q.name || h.symbol,
        currency: q.currency || 'USD',
        price,
        changePct: parseFloat(q.percent_change) || 0,
        value: price * h.quantity,
        capitalGains: (price - h.avgBuyPrice) * h.quantity,
      };
    });

    renderSummary();
    renderWatchlist();
    renderDetails();
    if (holdings.length) renderChart();
  } catch (err) {
    console.error('Portfolio load error:', err);
  }
}

document.addEventListener('DOMContentLoaded', init);