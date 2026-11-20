// pages/charts/charts.js

const chartDiv = document.getElementById('candleChart');
const detailsPanel = document.getElementById('detailsPanel');
const searchInput = document.getElementById('stockSearch');
const suggestionsBox = document.getElementById('suggestions');
const titleEl = document.getElementById('chartStockTitle');

const tradeCashEl = document.getElementById('tradeCashBalance');
const tradePosEl = document.getElementById('tradePosition');
const tradeQtyInput = document.getElementById('tradeQuantity');
const tradeEstTotalEl = document.getElementById('tradeEstTotal');
const tradeMsgEl = document.getElementById('tradeMessage');
const btnBuy = document.getElementById('btnBuy');
const btnSell = document.getElementById('btnSell');
const btnWatchlist = document.getElementById('btnWatchlist');
const btnAlert = document.getElementById('btnAlert');

const urlParams = new URLSearchParams(window.location.search);
let currentSymbol = (urlParams.get('symbol') || 'AAPL').toUpperCase().trim() || 'AAPL';
let currentInterval = '1day';
let currentOutputsize = 90;
let lastQuotePrice = 0;
let debounceTimer = null;
let awaitingAnnotation = false;
let pendingAnnotationPoint = null;
let toolbarBound = false;

const fmtUSD = (n) => (Number(n || 0)).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

function showToast(message, type = 'info') {
  const existing = document.querySelector('.watchlist-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = `watchlist-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function setTradeMessage(text, type = '') {
  tradeMsgEl.textContent = text || '';
  tradeMsgEl.className = 'trade-message' + (type ? ` ${type}` : '');
}

function updateEstimate() {
  const qty = parseInt(tradeQtyInput.value, 10) || 0;
  tradeEstTotalEl.textContent = fmtUSD(qty * lastQuotePrice);
}

// ---- Plotly Candlestick + Volume Subplot ----

function renderChart(chartData) {
  const times = chartData.map((d) => d.time);
  const opens = chartData.map((d) => d.open);
  const highs = chartData.map((d) => d.high);
  const lows = chartData.map((d) => d.low);
  const closes = chartData.map((d) => d.close);
  const volumes = chartData.map((d) => d.volume || 0);
  const volumeColors = chartData.map((d) =>
    d.close >= d.open ? 'rgba(74, 222, 128, 0.55)' : 'rgba(248, 113, 113, 0.55)'
  );

  const candleTrace = {
    type: 'candlestick',
    name: currentSymbol,
    x: times,
    open: opens,
    high: highs,
    low: lows,
    close: closes,
    increasing: { line: { color: '#4ade80' }, fillcolor: '#4ade80' },
    decreasing: { line: { color: '#f87171' }, fillcolor: '#f87171' },
    xaxis: 'x',
    yaxis: 'y',
  };

  const volumeTrace = {
    type: 'bar',
    name: 'Volume',
    x: times,
    y: volumes,
    marker: { color: volumeColors },
    xaxis: 'x',
    yaxis: 'y2',
  };

  const tickFormat = (currentInterval === '1day' || currentInterval === '1week')
    ? '%b %d, %Y'
    : '%b %d, %H:%M';

  const layout = {
    dragmode: 'zoom',
    showlegend: false,
    shapes: [],
    annotations: [],
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#ffffff' },
    margin: { t: 18, r: 20, b: 36, l: 55 },
    xaxis: {
      rangeslider: { visible: false },
      gridcolor: 'rgba(255, 255, 255, 0.08)',
      linecolor: 'rgba(255, 255, 255, 0.2)',
      tickformat: tickFormat,
    },
    yaxis: {
      domain: [0.26, 1],
      gridcolor: 'rgba(255, 255, 255, 0.08)',
      linecolor: 'rgba(255, 255, 255, 0.2)',
      title: { text: 'Price ($)', font: { size: 11 } },
    },
    yaxis2: {
      domain: [0, 0.20],
      gridcolor: 'rgba(255, 255, 255, 0.05)',
      linecolor: 'rgba(255, 255, 255, 0.2)',
      title: { text: 'Vol', font: { size: 10 } },
    },
  };

  const config = {
    displayModeBar: false,
    scrollZoom: true,
    responsive: true,
  };

  Plotly.newPlot(chartDiv, [candleTrace, volumeTrace], layout, config).then(() => {
    bindChartClickForAnnotations();
  });
}

function bindChartClickForAnnotations() {
  if (typeof chartDiv.removeAllListeners === 'function') {
    chartDiv.removeAllListeners('plotly_click');
  }
  chartDiv.on('plotly_click', (data) => {
    if (!awaitingAnnotation || !data?.points?.length) return;
    const pt = data.points[0];
    pendingAnnotationPoint = { x: pt.x, y: pt.y };
    document.getElementById('annotationHint').textContent = `Selected point (${pt.x}, $${Number(pt.y).toFixed(2)}):`;
    document.getElementById('annotationForm').hidden = false;
    document.getElementById('annotationTextInput').focus();
  });
}

function setupToolbar() {
  if (toolbarBound) return;
  toolbarBound = true;

  document.querySelectorAll('.tool-btn[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      awaitingAnnotation = false;
      document.getElementById('annotationPopover').hidden = true;
      document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      if (chartDiv.layout) {
        Plotly.relayout(chartDiv, { dragmode: btn.dataset.mode });
      }
    });
  });

  document.getElementById('toolReset')?.addEventListener('click', () => {
    awaitingAnnotation = false;
    document.getElementById('annotationPopover').hidden = true;
    if (chartDiv.layout) {
      Plotly.relayout(chartDiv, {
        'xaxis.autorange': true,
        'yaxis.autorange': true,
        'yaxis2.autorange': true,
        shapes: [],
        annotations: [],
      });
    }
  });

  document.getElementById('toolAnnotate')?.addEventListener('click', () => {
    awaitingAnnotation = true;
    pendingAnnotationPoint = null;
    document.querySelectorAll('.tool-btn').forEach((b) => b.classList.remove('active'));
    document.getElementById('toolAnnotate').classList.add('active');
    document.getElementById('annotationHint').textContent = 'Click anywhere on the chart to place an annotation.';
    document.getElementById('annotationForm').hidden = true;
    document.getElementById('annotationPopover').hidden = false;
  });

  document.getElementById('cancelAnnBtn')?.addEventListener('click', () => {
    awaitingAnnotation = false;
    pendingAnnotationPoint = null;
    document.getElementById('annotationPopover').hidden = true;
  });

  document.getElementById('annotationForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = document.getElementById('annotationTextInput').value.trim();
    if (!text || !pendingAnnotationPoint) return;
    const existing = Array.isArray(chartDiv.layout?.annotations) ? chartDiv.layout.annotations : [];
    Plotly.relayout(chartDiv, {
      annotations: [
        ...existing,
        {
          x: pendingAnnotationPoint.x,
          y: pendingAnnotationPoint.y,
          text,
          showarrow: true,
          arrowhead: 3,
          bgcolor: '#FFC349',
          bordercolor: '#0a1f44',
          font: { color: '#0a1f44', size: 12 },
          arrowcolor: '#FFC349',
        },
      ],
    });
    document.getElementById('annotationTextInput').value = '';
    document.getElementById('annotationPopover').hidden = true;
    awaitingAnnotation = false;
    pendingAnnotationPoint = null;
  });
}

// ---- Quote & Details Panel ----

function renderDetails(data, symbol) {
  const name = data.name || symbol;
  titleEl.textContent = `${symbol} — ${name}`;

  const rawPrice = parseFloat(data.currentPrice || data.close || data.price || 0);
  lastQuotePrice = Number.isFinite(rawPrice) ? rawPrice : 0;
  updateEstimate();

  const price = lastQuotePrice > 0 ? lastQuotePrice.toFixed(2) : 'N/A';
  const high = data.highOfDay ? Number(data.highOfDay).toFixed(2) : 'N/A';
  const low = data.lowOfDay ? Number(data.lowOfDay).toFixed(2) : 'N/A';
  const open = data.open ? Number(data.open).toFixed(2) : 'N/A';
  const vol = data.volume ? Number(data.volume).toLocaleString('en-US') : '—';

  const change = data.change != null ? parseFloat(data.change) : 0;
  const isUp = change >= 0;
  const changeColor = isUp ? '#16a34a' : '#dc2626';
  const changeSymbol = isUp ? '▲' : '▼';
  const changeText = `${isUp ? '+' : ''}${change.toFixed(2)}%`;

  detailsPanel.innerHTML = `
    <div style="text-align:left;width:100%;color:#0a1f44;font-family:'Lexend Deca',sans-serif;">
      <h2 style="margin:0 0 4px 0;font-size:22px;color:#0a1f44;">${esc(name)}</h2>
      <p style="margin:0 0 16px 0;font-size:13px;color:rgba(10,31,68,0.65);text-transform:uppercase;letter-spacing:1px;">
        ${esc(symbol)} ${data.exchange ? `· ${esc(data.exchange)}` : ''}
      </p>

      <div style="margin-bottom:18px;">
        <span style="font-size:32px;font-weight:700;color:#0a1f44;">$${price}</span>
        <span style="font-size:15px;font-weight:700;color:${changeColor};margin-left:8px;">
          ${changeSymbol} ${changeText}
        </span>
      </div>

      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(10,31,68,0.1);">
        <span style="color:rgba(10,31,68,0.6);">Open</span>
        <strong>$${open}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(10,31,68,0.1);">
        <span style="color:rgba(10,31,68,0.6);">Day High</span>
        <strong>$${high}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(10,31,68,0.1);">
        <span style="color:rgba(10,31,68,0.6);">Day Low</span>
        <strong>$${low}</strong>
      </div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;">
        <span style="color:rgba(10,31,68,0.6);">Day Volume</span>
        <strong>${esc(vol)}</strong>
      </div>
    </div>
  `;
}

// ---- Data Loading ----

async function loadCandles(symbol) {
  try {
    const res = await fetch(`/api/stocks/candles/${encodeURIComponent(symbol)}?interval=${currentInterval}&outputsize=${currentOutputsize}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Could not load chart data.');
    const chartData = (result.data || []).map((item) => ({
      time: item.time,
      open: parseFloat(item.open),
      high: parseFloat(item.high),
      low: parseFloat(item.low),
      close: parseFloat(item.close),
      volume: item.volume != null ? parseInt(item.volume, 10) : 0,
    }));
    renderChart(chartData);
  } catch (err) {
    console.error('Chart data error:', err);
    showToast(err.message || 'Could not load candles.', 'error');
  }
}

async function loadStockQuote(symbol) {
  detailsPanel.innerHTML = `<p class="details-empty">Loading ${esc(symbol)} details...</p>`;
  try {
    const res = await fetch(`/api/stocks/quote/${encodeURIComponent(symbol)}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    const result = await res.json();
    if (!res.ok || !result.success) throw new Error(result.message || 'Could not load quote data.');
    renderDetails(result.data, symbol);
  } catch (err) {
    console.error('Quote data error:', err);
    detailsPanel.innerHTML = `<p class="details-empty">Could not load details for ${esc(symbol)}.</p>`;
  }
}

async function loadTradeContext(symbol) {
  try {
    const [balRes, histRes] = await Promise.all([
      fetch('/api/trading/balance', { credentials: 'include' }),
      fetch(`/api/trading/history/${encodeURIComponent(symbol)}`, { credentials: 'include' }),
    ]);

    if (balRes.ok) {
      const { balance } = await balRes.json();
      tradeCashEl.textContent = fmtUSD(balance);
    }

    if (histRes.ok) {
      const hist = await histRes.json();
      const pos = hist.position || { quantity: 0, avg_buy_price: 0 };
      const totals = hist.totals || {};

      tradePosEl.textContent = `${pos.quantity} sh`;
      tradePosEl.title = pos.quantity > 0 ? `Avg buy: $${Number(pos.avg_buy_price).toFixed(2)}` : '';

      document.getElementById('historySymbolLabel').textContent = symbol;
      document.getElementById('histOwned').textContent = `${pos.quantity} sh`;
      document.getElementById('histAvgCost').textContent = fmtUSD(pos.avg_buy_price || 0);
      document.getElementById('histBought').textContent = `${totals.sharesBought || 0} sh (${fmtUSD(totals.totalBoughtUsd || 0)})`;
      document.getElementById('histSold').textContent = `${totals.sharesSold || 0} sh (${fmtUSD(totals.totalSoldUsd || 0)})`;

      const realizedEl = document.getElementById('histRealized');
      const rpnl = Number(totals.realizedPnl || 0);
      realizedEl.textContent = `${rpnl >= 0 ? '+' : ''}${fmtUSD(rpnl)}`;
      realizedEl.className = rpnl >= 0 ? 'up' : 'down';

      const tbody = document.getElementById('symbolHistoryBody');
      const trades = hist.trades || [];
      tbody.innerHTML = trades.length
        ? trades.map((t) => `
            <tr>
              <td>${new Date(t.executed_at).toLocaleString('en-US')}</td>
              <td class="${t.tradeType === 'buy' ? 'up' : 'down'}">${esc(String(t.tradeType).toUpperCase())}</td>
              <td>${t.quantity}</td>
              <td>${fmtUSD(t.price_per_share)}</td>
              <td>${fmtUSD(t.total_amount)}</td>
              <td class="${(t.realized_pnl || 0) >= 0 ? 'up' : 'down'}">${t.realized_pnl != null ? fmtUSD(t.realized_pnl) : '—'}</td>
              <td>${esc(t.confirmation_id)}</td>
            </tr>`).join('')
        : `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:20px;">You have not bought or sold ${esc(symbol)} yet.</td></tr>`;
    }
    updateEstimate();
  } catch (err) {
    console.error('Trade context error:', err);
  }
}

async function syncWatchlistButtonState(symbol) {
  if (!btnWatchlist) return;
  try {
    const res = await fetch('/api/watchlist', { credentials: 'include' });
    if (!res.ok) return;
    const items = await res.json();
    const isTracking = items.some((item) => item.stocks?.symbol === symbol);
    if (isTracking) {
      btnWatchlist.textContent = '✓ In Watchlist';
      btnWatchlist.classList.add('is-tracking');
    } else {
      btnWatchlist.textContent = '+ Watchlist';
      btnWatchlist.classList.remove('is-tracking');
    }
  } catch {}
}

function loadAllForSymbol(symbol) {
  currentSymbol = symbol.toUpperCase().trim();
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('symbol', currentSymbol);
  window.history.replaceState({}, '', nextUrl);
  loadCandles(currentSymbol);
  loadStockQuote(currentSymbol);
  loadTradeContext(currentSymbol);
  syncWatchlistButtonState(currentSymbol);
}

// ---- Search & Autocomplete ----

function handleSearch() {
  const q = searchInput.value.trim().toUpperCase();
  if (q) {
    suggestionsBox.style.display = 'none';
    loadAllForSymbol(q);
  }
}

searchInput?.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  if (!q) {
    suggestionsBox.style.display = 'none';
    return;
  }
  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/stocks/search/${encodeURIComponent(q)}`, { credentials: 'include' });
      const result = await res.json();
      if (result.success && result.data?.length) {
        suggestionsBox.innerHTML = result.data.map((stock) => `
          <div class="suggestion-item" data-symbol="${esc(stock.symbol)}">
            <span class="suggestion-symbol">${esc(stock.symbol)}</span>
            <span class="suggestion-name">${esc(stock.name)} (${esc(stock.exchange)})</span>
          </div>`).join('');
        suggestionsBox.style.display = 'block';
        suggestionsBox.querySelectorAll('.suggestion-item').forEach((item) => {
          item.addEventListener('click', () => {
            searchInput.value = item.dataset.symbol;
            suggestionsBox.style.display = 'none';
            loadAllForSymbol(item.dataset.symbol);
          });
        });
      } else {
        suggestionsBox.innerHTML = `<div class="suggestion-item"><span class="suggestion-name">No stocks found for "${esc(q)}"</span></div>`;
        suggestionsBox.style.display = 'block';
      }
    } catch (err) {
      console.error('Autocomplete error:', err);
    }
  }, 300);
});

document.addEventListener('click', (e) => {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
    suggestionsBox.style.display = 'none';
  }
});

document.getElementById('searchSubmitBtn')?.addEventListener('click', handleSearch);
searchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleSearch();
  }
});

// ---- Interval Buttons ----

document.querySelectorAll('.interval-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.interval-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentInterval = btn.dataset.interval;
    currentOutputsize = btn.dataset.outputsize;
    loadCandles(currentSymbol);
  });
});

// ---- Buy / Sell Handlers ----

async function submitOrder(side) {
  const qty = parseInt(tradeQtyInput.value, 10);
  if (!qty || qty <= 0) {
    setTradeMessage('Enter a valid quantity.', 'error');
    return;
  }
  btnBuy.disabled = true;
  btnSell.disabled = true;
  setTradeMessage(`Processing ${side}...`, '');
  try {
    const res = await fetch(`/api/trading/${side}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: currentSymbol, quantity: qty }),
    });
    const data = await res.json();
    if (!res.ok) {
      setTradeMessage(data.message || `${side} failed.`, 'error');
      return;
    }
    setTradeMessage(data.message, 'success');
    tradeQtyInput.value = '';
    await loadTradeContext(currentSymbol);
  } catch (err) {
    setTradeMessage(`Network error during ${side}.`, 'error');
  } finally {
    btnBuy.disabled = false;
    btnSell.disabled = false;
  }
}

tradeQtyInput?.addEventListener('input', updateEstimate);
btnBuy?.addEventListener('click', () => submitOrder('buy'));
btnSell?.addEventListener('click', () => submitOrder('sell'));

// ---- Watchlist & Target Alert ----

btnWatchlist?.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/watchlist', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: currentSymbol }),
    });
    const data = await res.json();
    if (res.status === 409) {
      showToast(`${currentSymbol} is already in your watchlist.`, 'info');
      syncWatchlistButtonState(currentSymbol);
      return;
    }
    if (!res.ok) throw new Error(data.message || 'Could not add to watchlist.');
    showToast(`Added ${currentSymbol} to watchlist.`, 'success');
    syncWatchlistButtonState(currentSymbol);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

btnAlert?.addEventListener('click', () => {
  const box = document.getElementById('targetAlertForm');
  box.hidden = !box.hidden;
  if (!box.hidden) document.getElementById('targetAlertPrice').focus();
});

document.getElementById('cancelTargetBtn')?.addEventListener('click', () => {
  document.getElementById('targetAlertForm').hidden = true;
});

document.getElementById('targetAlertForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const target = parseFloat(document.getElementById('targetAlertPrice').value);
  if (!target || target <= 0) return showToast('Enter a positive target price.', 'error');
  try {
    // Ensure stock is in watchlist first (ignore 409)
    await fetch('/api/watchlist', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: currentSymbol }),
    });
    const res = await fetch(`/api/watchlist/${encodeURIComponent(currentSymbol)}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_price: target }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Could not save target price.');
    showToast(data.message, 'success');
    document.getElementById('targetAlertForm').hidden = true;
    syncWatchlistButtonState(currentSymbol);
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  setupToolbar();
  loadAllForSymbol(currentSymbol);
});
