// watchlist.js

// ---- Auth check ----
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

// ---- State ----
let watchlist = [];
let selectedSymbol = null;
let debounceTimer;

const fmtUSD = (n) => (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtSigned = (n, opts = {}) => `${n > 0 ? '+' : ''}${(n ?? 0).toLocaleString('en-US', opts)}`;

// ---- Toast notifications ----
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

// ---- Watchlist API ----
async function fetchWatchlistWithQuotes() {
  const res = await fetch('/api/watchlist/with-quotes', { credentials: 'include' });
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
  const res = await fetch(`/api/watchlist/${symbol}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Could not remove from watchlist');
}

async function updateTargetPrice(symbol, targetPrice) {
  const res = await fetch(`/api/watchlist/${symbol}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_price: targetPrice }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Could not update target price');
  return data;
}

// ---- Render ----
function renderWatchlist() {
  const tbody = document.getElementById('watchlistBody');
  tbody.innerHTML = '';

  if (!watchlist.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 30px;">
          Your watchlist is empty. Search above to add a stock.
        </td>
      </tr>`;
    return;
  }

  watchlist.forEach((stock) => {
    const isUp = stock.changePct >= 0;
    const changeBadge = stock.changeType === 'target'
      ? '<span class="change-badge target">vs target</span>'
      : '<span class="change-badge daily">daily</span>';

    const row = document.createElement('tr');
    row.dataset.symbol = stock.symbol;
    row.className = stock.symbol === selectedSymbol ? 'selected' : '';
    row.innerHTML = `
      <td class="symbol">${stock.symbol}</td>
      <td class="company">${stock.company}</td>
      <td>${fmtUSD(stock.price)}</td>
      <td>
        <input
          type="number"
          class="target-input"
          data-symbol="${stock.symbol}"
          value="${stock.target_price || ''}"
          placeholder="Set $"
          min="0"
          step="0.01"
        />
      </td>
      <td class="change ${isUp ? 'up' : 'down'}">
        ${fmtSigned(stock.changePct, { maximumFractionDigits: 2 })}%
        ${changeBadge}
      </td>
      <td><button class="remove-btn" data-symbol="${stock.symbol}" title="Remove from watchlist">&times;</button></td>
    `;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.remove-btn') || e.target.closest('.target-input')) return;
      selectSymbol(stock.symbol);
    });
    tbody.appendChild(row);
  });

  // Wire up remove buttons
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

  // Wire up target price inputs
  tbody.querySelectorAll('.target-input').forEach((input) => {
    let debounceTimerTP;
    let originalValue = input.value;

    input.addEventListener('input', () => {
      clearTimeout(debounceTimerTP);
      input.classList.add('saving');
      debounceTimerTP = setTimeout(() => {
        saveTargetPrice(input);
      }, 800);
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

  if (rawValue !== '' && (isNaN(targetPrice) || targetPrice <= 0)) {
    showToast('Target price must be a positive number.', 'error');
    input.classList.remove('saving');
    return;
  }

  try {
    await updateTargetPrice(symbol, targetPrice);
    input.classList.remove('saving');
    if (targetPrice) {
      showToast(`Target price set to ${fmtUSD(targetPrice)} for ${symbol}`, 'success');
    } else {
      showToast(`Target price cleared for ${symbol}`, 'info');
    }
    await refreshWatchlist();
  } catch (err) {
    showToast(err.message, 'error');
    input.classList.remove('saving');
  }
}

function renderDetails() {
  const container = document.getElementById('detailsBody');
  const stock = watchlist.find((s) => s.symbol === selectedSymbol);

  if (!stock) {
    container.innerHTML = `<p class="details-empty">Select a stock from your watchlist to see details.</p>`;
    return;
  }

  const isUp = stock.changePct >= 0;
  const changeBadge = stock.changeType === 'target' ? 'vs Target' : 'Daily';

  let targetSection = '';
  if (stock.target_price) {
    const targetDiff = stock.price - stock.target_price;
    const targetDiffPct = (targetDiff / stock.target_price) * 100;
    const targetIsUp = targetDiff >= 0;
    targetSection = `
      <div class="details-stats" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-soft);">
        <div><span>Target Price</span><span>${fmtUSD(stock.target_price)}</span></div>
        <div><span>vs Target</span><span class="${targetIsUp ? 'up' : 'down'}" style="color: ${targetIsUp ? 'var(--accent-up)' : 'var(--accent-down)'};">${fmtSigned(targetDiffPct, { maximumFractionDigits: 2 })}%</span></div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="stock-name">${stock.company}</div>
    <div class="stock-symbol">${stock.symbol}</div>
    <div class="stock-price">${fmtUSD(stock.price)}</div>
    <div class="stock-change ${isUp ? 'up' : 'down'}">
      ${fmtSigned(stock.changePct, { maximumFractionDigits: 2 })}% (${changeBadge})
    </div>
    <div class="details-stats">
      <div><span>Open</span><span>${fmtUSD(stock.open)}</span></div>
      <div><span>Volume</span><span>${stock.volume}</span></div>
      <div><span>High</span><span>${fmtUSD(stock.high)}</span></div>
      <div><span>Low</span><span>${fmtUSD(stock.low)}</span></div>
    </div>
    ${targetSection}
    <a href="../charts/charts.html" class="view-chart-link">View on Charts &rarr;</a>
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
  } catch (err) {
    console.error('Watchlist load error:', err);
    showToast('Could not load watchlist', 'error');
    watchlist = [];
  }
  renderWatchlist();
  renderDetails();
}

// ---- Autocomplete Search ----
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
    await refreshWatchlist();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = searchInput.value.trim();

  if (!query) {
    suggestionsBox.style.display = 'none';
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`/api/stocks/search/${query}`, {
        method: 'GET', credentials: 'include',
      });
      const result = await res.json();

      if (result.success && result.data.length > 0) {
        suggestionsBox.innerHTML = result.data.map(stock => `
          <div class="suggestion-item" data-symbol="${stock.symbol}">
            <span class="suggestion-symbol">${stock.symbol}</span>
            <span class="suggestion-name">${stock.name} (${stock.exchange})</span>
          </div>
        `).join('');
        suggestionsBox.style.display = 'block';

        document.querySelectorAll('.suggestion-item').forEach(item => {
          item.addEventListener('click', async () => {
            const symbol = item.dataset.symbol;
            searchInput.value = '';
            suggestionsBox.style.display = 'none';
            try {
              await addToWatchlist(symbol);
              showToast(`Added ${symbol} to watchlist`, 'success');
              await refreshWatchlist();
            } catch (err) {
              showToast(err.message, 'error');
            }
          });
        });
      } else {
        suggestionsBox.innerHTML = `
          <div class="suggestion-item">
            <span class="suggestion-name">No results for "${query}"</span>
          </div>`;
        suggestionsBox.style.display = 'block';
      }
    } catch (err) {
      console.error('Search error:', err);
    }
  }, 300);
});

document.addEventListener('click', (e) => {
  if (!searchInput.contains(e.target) && !suggestionsBox.contains(e.target)) {
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

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  // loadCurrentUser();
  refreshWatchlist();
});