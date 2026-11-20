// pages/watchlist/watchlist.js

let watchlist = [];
let selectedSymbol = null;
let activeFilter = 'all';
let debounceTimer;

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
    setTimeout(() => toast.remove(), 250);
  }, 3000);
}

async function fetchWatchlistWithQuotes() {
  const res = await fetch('/api/watchlist/with-quotes', { credentials: 'include' });
  if (res.status === 401) {
    window.location.replace('../authentication/login/login.html');
    return [];
  }
  if (!res.ok) throw new Error('Failed to load watchlist');
  return res.json();
}

async function addToWatchlist(symbol) {
  const res = await fetch('/api/watchlist', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Could not add to watchlist');
  return data;
}

async function removeFromWatchlist(symbol) {
  const res = await fetch(`/api/watchlist/${encodeURIComponent(symbol)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Could not remove from watchlist');
}

async function updateTargetPrice(symbol, targetPrice) {
  const res = await fetch(`/api/watchlist/${encodeURIComponent(symbol)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_price: targetPrice }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Could not update target price');
  return data;
}

function renderSummary() {
  const count = watchlist.length;
  const alertsHit = watchlist.filter((s) => s.targetStatus === 'hit' || s.targetStatus === 'above').length;
  const gainers = watchlist.filter((s) => Number(s.dailyChangePct) > 0).length;
  const losers = watchlist.filter((s) => Number(s.dailyChangePct) < 0).length;

  document.getElementById('wlCount').textContent = String(count);
  document.getElementById('wlAlertsHit').textContent = String(alertsHit);
  document.getElementById('wlGainers').textContent = String(gainers);
  document.getElementById('wlLosers').textContent = String(losers);
}

function getFilteredWatchlist() {
  if (activeFilter === 'targets') {
    return watchlist.filter((s) => s.target_price != null);
  }
  if (activeFilter === 'alerts') {
    return watchlist.filter((s) => s.targetStatus === 'hit' || s.targetStatus === 'above');
  }
  return watchlist;
}

function renderStatusBadge(stock) {
  if (!stock.target_price) {
    return '<span class="status-tag unset">No target</span>';
  }
  const deltaText = fmtSigned(stock.targetDeltaPct, { maximumFractionDigits: 2 }) + '%';
  if (stock.targetStatus === 'hit') {
    return `<span class="status-tag hit">Target Hit (${deltaText})</span>`;
  }
  if (stock.targetStatus === 'above') {
    return `<span class="status-tag above">Above Target (${deltaText})</span>`;
  }
  return `<span class="status-tag below">Below Target (${deltaText})</span>`;
}

function renderWatchlist() {
  const tbody = document.getElementById('watchlistBody');
  const items = getFilteredWatchlist();
  tbody.innerHTML = '';

  if (!items.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">
          ${watchlist.length ? 'No watchlist items match this filter.' : 'Your watchlist is empty. Search above to add a stock.'}
        </td>
      </tr>`;
    return;
  }

  items.forEach((stock) => {
    const dailyPct = Number(stock.dailyChangePct ?? stock.changePct ?? 0);
    const isUp = dailyPct >= 0;

    const row = document.createElement('tr');
    row.dataset.symbol = stock.symbol;
    row.className = stock.symbol === selectedSymbol ? 'selected' : '';
    row.innerHTML = `
      <td class="symbol">${esc(stock.symbol)}</td>
      <td class="company" title="${esc(stock.company)}">${esc(stock.company)}</td>
      <td>${fmtUSD(stock.price)}</td>
      <td class="change ${isUp ? 'up' : 'down'}">${fmtSigned(dailyPct, { maximumFractionDigits: 2 })}%</td>
      <td>
        <input
          type="number"
          class="target-input"
          data-symbol="${esc(stock.symbol)}"
          value="${stock.target_price ?? ''}"
          placeholder="Set $"
          min="0"
          step="0.01"
        />
      </td>
      <td>${renderStatusBadge(stock)}</td>
      <td>
        <a class="trade-mini-link" href="../charts/charts.html?symbol=${encodeURIComponent(stock.symbol)}">Trade</a>
        <button class="remove-btn" data-symbol="${esc(stock.symbol)}" title="Remove from watchlist">&times;</button>
      </td>
    `;

    row.addEventListener('click', (e) => {
      if (e.target.closest('.remove-btn') || e.target.closest('.target-input') || e.target.closest('.trade-mini-link')) return;
      selectSymbol(stock.symbol);
    });
    tbody.appendChild(row);
  });

  tbody.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const symbol = btn.dataset.symbol;
      try {
        await removeFromWatchlist(symbol);
        showToast(`Removed ${symbol}`, 'info');
        if (selectedSymbol === symbol) selectedSymbol = null;
        await refreshWatchlist();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  tbody.querySelectorAll('.target-input').forEach((input) => {
    let debounceTimerTP;
    const originalValue = input.value;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimerTP);
      input.classList.add('saving');
      debounceTimerTP = setTimeout(() => saveTargetPrice(input), 800);
    });

    input.addEventListener('blur', () => {
      clearTimeout(debounceTimerTP);
      if (input.value !== originalValue) {
        saveTargetPrice(input);
      } else {
        input.classList.remove('saving');
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
      if (e.key === 'Escape') {
        input.value = originalValue;
        input.blur();
      }
    });
  });
}

async function saveTargetPrice(input) {
  const symbol = input.dataset.symbol;
  const rawValue = input.value.trim();
  const targetPrice = rawValue === '' ? null : parseFloat(rawValue);

  if (rawValue !== '' && (Number.isNaN(targetPrice) || targetPrice <= 0)) {
    showToast('Target price must be a positive number.', 'error');
    input.classList.remove('saving');
    return;
  }

  try {
    await updateTargetPrice(symbol, targetPrice);
    input.classList.remove('saving');
    showToast(
      targetPrice ? `Target price set to ${fmtUSD(targetPrice)} for ${symbol}` : `Target price cleared for ${symbol}`,
      targetPrice ? 'success' : 'info'
    );
    await refreshWatchlist();
  } catch (err) {
    showToast(err.message, 'error');
    input.classList.remove('saving');
  }
}

function renderDetails() {
  const container = document.getElementById('detailsBody');
  const stock = watchlist.find((s) => s.symbol === selectedSymbol) || watchlist[0];

  if (!stock) {
    container.innerHTML = `<p class="details-empty">Select a stock from your watchlist to inspect OHLCV market data and target distance.</p>`;
    return;
  }

  selectedSymbol = stock.symbol;
  const dailyPct = Number(stock.dailyChangePct ?? stock.changePct ?? 0);
  const isUp = dailyPct >= 0;

  let targetSection = '';
  if (stock.target_price) {
    const diff = stock.price - stock.target_price;
    const diffPct = stock.targetDeltaPct ?? (stock.target_price > 0 ? (diff / stock.target_price) * 100 : 0);
    targetSection = `
      <div class="details-stats" style="margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-soft);">
        <div><span>Target Price</span><span>${fmtUSD(stock.target_price)}</span></div>
        <div><span>Distance vs Target</span><span style="color:${diff >= 0 ? 'var(--accent-up)' : 'var(--accent-down)'};">${fmtUSD(diff)} (${fmtSigned(diffPct, { maximumFractionDigits: 2 })}%)</span></div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="stock-name">${esc(stock.company)}</div>
    <div class="stock-symbol">${esc(stock.symbol)}${stock.exchange ? ` &middot; ${esc(stock.exchange)}` : ''}${stock.status && stock.status !== 'active' ? ` &middot; <span style="color:#f87171;">${esc(stock.status.toUpperCase())}</span>` : ''}</div>
    <div class="stock-price">${fmtUSD(stock.price)}</div>
    <div class="stock-change ${isUp ? 'up' : 'down'}">
      ${fmtSigned(dailyPct, { maximumFractionDigits: 2 })}% Today
    </div>
    <div class="details-stats">
      <div><span>Open</span><span>${fmtUSD(stock.open)}</span></div>
      <div><span>Volume</span><span>${esc(stock.volume || '—')}</span></div>
      <div><span>Day High</span><span>${fmtUSD(stock.high)}</span></div>
      <div><span>Day Low</span><span>${fmtUSD(stock.low)}</span></div>
    </div>
    ${targetSection}
    <a href="../charts/charts.html?symbol=${encodeURIComponent(stock.symbol)}" class="view-chart-link">Trade ${esc(stock.symbol)} on Charts &rarr;</a>
  `;
}

function selectSymbol(symbol) {
  selectedSymbol = symbol;
  renderWatchlist();
  renderDetails();
}

async function refreshWatchlist() {
  try {
    watchlist = await fetchWatchlistWithQuotes();
    if (!selectedSymbol && watchlist.length) {
      selectedSymbol = watchlist[0].symbol;
    }
  } catch (err) {
    console.error('Watchlist load error:', err);
    showToast('Could not load watchlist', 'error');
    watchlist = [];
  }
  renderSummary();
  renderWatchlist();
  renderDetails();
}

const searchInput = document.getElementById('stockSearch');
const suggestionsBox = document.getElementById('suggestions');
const searchBtn = document.getElementById('searchBtn');

async function performSearch() {
  const query = searchInput.value.trim().toUpperCase();
  if (!query) return;
  suggestionsBox.style.display = 'none';

  try {
    await addToWatchlist(query);
    showToast(`Added ${query} to watchlist`, 'success');
    searchInput.value = '';
    selectedSymbol = query;
    await refreshWatchlist();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

searchInput?.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = searchInput.value.trim();

  if (!query) {
    suggestionsBox.style.display = 'none';
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/stocks/search/${encodeURIComponent(query)}`, {
        method: 'GET',
        credentials: 'include',
      });
      const result = await res.json();

      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        suggestionsBox.innerHTML = result.data.map((stock) => `
          <div class="suggestion-item" data-symbol="${esc(stock.symbol)}">
            <span class="suggestion-symbol">${esc(stock.symbol)}</span>
            <span class="suggestion-name">${esc(stock.name || stock.symbol)} (${esc(stock.exchange || 'US')})</span>
          </div>
        `).join('');
        suggestionsBox.style.display = 'block';

        suggestionsBox.querySelectorAll('.suggestion-item').forEach((item) => {
          item.addEventListener('click', async () => {
            const symbol = item.dataset.symbol;
            searchInput.value = '';
            suggestionsBox.style.display = 'none';
            try {
              await addToWatchlist(symbol);
              showToast(`Added ${symbol} to watchlist`, 'success');
              selectedSymbol = symbol;
              await refreshWatchlist();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
      } else {
        suggestionsBox.innerHTML = `
          <div class="suggestion-item">
            <span class="suggestion-name">No results for "${esc(query)}"</span>
          </div>`;
        suggestionsBox.style.display = 'block';
      }
    } catch (err) {
      console.error('Search error:', err);
    }
  }, 300);
});

document.addEventListener('click', (e) => {
  if (searchInput && suggestionsBox && !searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
    suggestionsBox.style.display = 'none';
  }
});

searchBtn?.addEventListener('click', (e) => {
  e.preventDefault();
  performSearch();
});

searchInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    performSearch();
  }
});

document.getElementById('wlFilterPills')?.addEventListener('click', (e) => {
  const pill = e.target.closest('.filter-pill');
  if (!pill) return;
  document.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
  pill.classList.add('active');
  activeFilter = pill.dataset.filter || 'all';
  renderWatchlist();
});

document.addEventListener('DOMContentLoaded', refreshWatchlist);
