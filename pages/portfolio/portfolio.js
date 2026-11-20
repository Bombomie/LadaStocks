// pages/portfolio/portfolio.js

let chartInstance = null;
let holdings = [];
let selectedSymbol = null;

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

const fmtUSD = (n) => Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtSigned = (n, opts = {}) => `${Number(n) > 0 ? '+' : ''}${Number(n ?? 0).toLocaleString('en-US', opts)}`;

async function fetchJson(url) {
  const res = await fetch(url, { credentials: 'include' });
  if (res.status === 401) {
    window.location.replace('../authentication/login/login.html');
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || data?.message || 'Request failed');
  return data;
}

async function fetchQuotes(symbols) {
  const quotePromises = symbols.map((sym) =>
    fetch(`/api/stocks/quote/${encodeURIComponent(sym)}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  );
  const results = await Promise.all(quotePromises);
  const map = {};
  symbols.forEach((sym, i) => {
    map[sym] = results[i]?.data || {};
  });
  return map;
}

function renderSummary(summary) {
  const {
    totalValue = 0,
    portfolioValue = 0,
    cashBalance = 0,
    totalCost = 0,
    unrealizedPnl = 0,
    realizedPnl = 0,
    todaysChange = 0,
    totalReturnPct = 0,
  } = summary || {};

  document.getElementById('netWorth').textContent = fmtUSD(totalValue);
  document.getElementById('portfolioValue').textContent = fmtUSD(portfolioValue);
  document.getElementById('cashBalance').textContent = fmtUSD(cashBalance);
  document.getElementById('totalCostBasis').textContent = fmtUSD(totalCost);

  const setSignedCard = (id, val, isPct = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = isPct
      ? `${fmtSigned(val, { maximumFractionDigits: 2 })}%`
      : fmtSigned(val, { style: 'currency', currency: 'USD' });
    el.classList.toggle('up', val >= 0);
    el.classList.toggle('down', val < 0);
  };

  setSignedCard('unrealizedPnl', unrealizedPnl);
  setSignedCard('realizedPnl', realizedPnl);
  setSignedCard('todaysChange', todaysChange);
  setSignedCard('totalReturn', totalReturnPct, true);
}

function renderSectors(sectors) {
  const container = document.getElementById('sectorBreakdown');
  if (!container) return;

  if (!sectors || !sectors.length) {
    container.innerHTML = '<p class="details-empty">Holdings allocation will appear once you own shares.</p>';
    return;
  }

  container.innerHTML = sectors
    .map(
      (s) => `
      <div class="sector-item">
        <div class="sector-row-top">
          <span>${esc(s.sector || 'Unclassified')}</span>
          <span>${fmtUSD(s.value)} (${Number(s.weightPct || 0).toFixed(1)}%)</span>
        </div>
        <div class="sector-track">
          <div class="sector-fill" style="width:${Math.min(100, Math.max(2, Number(s.weightPct || 0)))}%"></div>
        </div>
      </div>`
    )
    .join('');
}

function renderHoldings(portfolioValue) {
  const tbody = document.getElementById('watchlistBody');
  tbody.innerHTML = '';

  if (!holdings.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; color: var(--text-muted); padding: 30px;">
          You don't own any stocks yet. Visit the Charts page to place your first trade.
        </td>
      </tr>`;
    return;
  }

  holdings.forEach((h) => {
    const isUp = h.changePct >= 0;
    const isPnlUp = h.capitalGains >= 0;
    const weightPct = portfolioValue > 0 ? (h.value / portfolioValue) * 100 : 0;

    const row = document.createElement('tr');
    row.className = h.symbol === selectedSymbol ? 'selected' : '';
    row.innerHTML = `
      <td class="symbol">${esc(h.symbol)}</td>
      <td class="company" title="${esc(h.company)}">${esc(h.company)}</td>
      <td>${esc(h.sector || 'Unclassified')}</td>
      <td>${fmtUSD(h.price)}</td>
      <td>${h.quantity}</td>
      <td>${fmtUSD(h.avgBuyPrice)}</td>
      <td>${fmtUSD(h.value)}</td>
      <td>${weightPct.toFixed(1)}%</td>
      <td class="change ${isPnlUp ? 'up' : 'down'}">${fmtSigned(h.capitalGains, { style: 'currency', currency: 'USD' })}</td>
      <td class="change ${isUp ? 'up' : 'down'}">${fmtSigned(h.changePct, { maximumFractionDigits: 2 })}%</td>
    `;
    row.addEventListener('click', () => {
      selectedSymbol = h.symbol;
      renderHoldings(portfolioValue);
      renderDetails(portfolioValue);
    });
    tbody.appendChild(row);
  });
}

function renderDetails(portfolioValue) {
  const container = document.getElementById('detailsBody');
  const h = holdings.find((x) => x.symbol === selectedSymbol) || holdings[0];

  if (!h) {
    container.innerHTML = '<p class="details-empty">Select a holding to inspect cost basis, weight, and jump to trading.</p>';
    return;
  }

  selectedSymbol = h.symbol;
  const costBasis = h.avgBuyPrice * h.quantity;
  const returnPct = costBasis > 0 ? ((h.value - costBasis) / costBasis) * 100 : 0;
  const weightPct = portfolioValue > 0 ? (h.value / portfolioValue) * 100 : 0;

  container.innerHTML = `
    <div class="stock-name">${esc(h.company)}</div>
    <div class="stock-symbol">${esc(h.symbol)} &middot; ${esc(h.sector || 'Unclassified')}</div>
    <div class="stock-price">${fmtUSD(h.price)}</div>
    <div class="stock-change ${h.changePct >= 0 ? 'up' : 'down'}">${fmtSigned(h.changePct, { maximumFractionDigits: 2 })}% today</div>
    <div class="details-stats">
      <div><span>Shares Owned</span><span>${h.quantity}</span></div>
      <div><span>Portfolio Weight</span><span>${weightPct.toFixed(2)}%</span></div>
      <div><span>Avg. Cost / Share</span><span>${fmtUSD(h.avgBuyPrice)}</span></div>
      <div><span>Cost Basis</span><span>${fmtUSD(costBasis)}</span></div>
      <div><span>Market Value</span><span>${fmtUSD(h.value)}</span></div>
      <div><span>Unrealized P/L</span><span style="color:${h.capitalGains >= 0 ? 'var(--accent-up)' : 'var(--accent-down)'};">${fmtSigned(h.capitalGains, { style: 'currency', currency: 'USD' })} (${fmtSigned(returnPct, { maximumFractionDigits: 2 })}%)</span></div>
    </div>
    <a href="../charts/charts.html?symbol=${encodeURIComponent(h.symbol)}" class="view-chart-link">Trade ${esc(h.symbol)} on Charts &rarr;</a>
  `;
}

function renderChart(history) {
  const ctx = document.getElementById('portfolioChart');
  if (!ctx || typeof Chart === 'undefined') return;
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
  if (!history || !history.length) return;

  const labels = history.map((d) => d.date);
  const values = history.map((d) => d.value);
  const costs = history.map((d) => d.costBasis);

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Market Value',
          data: values,
          borderColor: '#FFC349',
          backgroundColor: 'rgba(255, 195, 73, 0.16)',
          fill: true,
          tension: 0.25,
          pointRadius: 2,
        },
        {
          label: 'Cost Basis',
          data: costs,
          borderColor: '#39d0d8',
          borderDash: [6, 4],
          fill: false,
          tension: 0,
          pointRadius: 0,
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
            label: (c) => ` ${c.dataset.label}: ${fmtUSD(c.parsed.y)}`,
          },
        },
      },
    },
  });
}

async function init() {
  try {
    const [summary, rawHoldings, history] = await Promise.all([
      fetchJson('/api/portfolio/summary'),
      fetchJson('/api/portfolio/holdings'),
      fetchJson('/api/portfolio/history').catch(() => []),
    ]);

    if (Array.isArray(rawHoldings) && rawHoldings.length) {
      const quotes = await fetchQuotes(rawHoldings.map((h) => h.symbol));
      holdings = rawHoldings.map((h) => {
        const q = quotes[h.symbol] || {};
        const price = parseFloat(q?.currentPrice || q?.close || q?.price || h.avg_buy_price || 0);
        const changePct = parseFloat(q?.change || q?.percent_change || 0);
        const avgBuy = parseFloat(h.avg_buy_price || 0);
        const value = price * h.quantity;
        return {
          symbol: h.symbol,
          company: h.company || q?.name || h.symbol,
          sector: h.sector || 'Unclassified',
          quantity: h.quantity,
          avgBuyPrice: avgBuy,
          price,
          changePct,
          value,
          capitalGains: (price - avgBuy) * h.quantity,
        };
      });
      if (!selectedSymbol) selectedSymbol = holdings[0].symbol;
    } else {
      holdings = [];
    }

    const totalPortfolioVal = holdings.reduce((s, h) => s + h.value, 0) || summary?.portfolioValue || 0;
    renderSummary(summary);
    renderSectors(summary?.sectorAllocation || []);
    renderHoldings(totalPortfolioVal);
    renderDetails(totalPortfolioVal);
    renderChart(history);
  } catch (err) {
    if (err.message === 'Unauthorized') return;
    console.error('Portfolio load error:', err);
  }
}

document.addEventListener('DOMContentLoaded', init);
