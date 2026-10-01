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

// ---- Watchlist symbol storage ----
// TODO: replace with a real backend endpoint (e.g. GET/POST /api/watchlist) once you have one
const WATCHLIST_KEY = 'lada_watchlist_symbols';

function getStoredSymbols() {
  try {
    return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || ['AAPL', 'GOOGL', 'TSLA', 'AMZN', 'MSFT'];
  } catch {
    return [];
  }
}
function saveStoredSymbols(symbols) {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(symbols));
}

let watchlist = [];
let selectedSymbol = null;

const fmtUSD = (n) => (n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtSigned = (n, opts = {}) => `${n > 0 ? '+' : ''}${(n ?? 0).toLocaleString('en-US', opts)}`;

async function fetchQuotes(symbols) {
  const res = await fetch(`/api/market/quote?symbols=${symbols.join(',')}`, { credentials: 'include' });
  if (!res.ok) throw new Error('Failed to fetch quotes');
  const data = await res.json();
  return symbols.length === 1 ? { [symbols[0]]: data } : data;
}

async function refreshWatchlist() {
  const symbols = getStoredSymbols();
  if (!symbols.length) { watchlist = []; renderWatchlist(); renderDetails(); return; }

  try {
    const quotes = await fetchQuotes(symbols);
    watchlist = symbols
      .map((sym) => {
        const q = quotes[sym];
        if (!q || q.status === 'error') return null; // symbol not found / bad quote
        return {
          symbol: sym,
          company: q.name || sym,
          price: parseFloat(q.close) || 0,
          changePct: parseFloat(q.percent_change) || 0,
          open: parseFloat(q.open) || 0,
          high: parseFloat(q.high) || 0,
          low: parseFloat(q.low) || 0,
          volume: q.volume ? Number(q.volume).toLocaleString('en-US') : '—',
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.error('Watchlist load error:', err);
  }

  renderWatchlist();
  renderDetails();
}

function renderWatchlist() {
  const tbody = document.getElementById('watchlistBody');
  tbody.innerHTML = '';

  watchlist.forEach((stock) => {
    const isUp = stock.changePct >= 0;
    const row = document.createElement('tr');
    row.dataset.symbol = stock.symbol;
    row.className = stock.symbol === selectedSymbol ? 'selected' : '';
    row.innerHTML = `
      <td class="symbol">${stock.symbol}</td>
      <td class="company">${stock.company}</td>
      <td>${fmtUSD(stock.price)}</td>
      <td class="change ${isUp ? 'up' : 'down'}">${fmtSigned(stock.changePct, { maximumFractionDigits: 2 })}%</td>
      <td><button class="remove-btn" data-symbol="${stock.symbol}" title="Remove from watchlist">&times;</button></td>
    `;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.remove-btn')) return;
      selectSymbol(stock.symbol);
    });
    tbody.appendChild(row);
  });

  tbody.querySelectorAll('.remove-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeSymbol(btn.dataset.symbol);
    });
  });
}

function renderDetails() {
  const container = document.getElementById('detailsBody');
  const stock = watchlist.find((s) => s.symbol === selectedSymbol);

  if (!stock) {
    container.innerHTML = `<p class="details-empty">Select a stock from your watchlist to see details.</p>`;
    return;
  }

  const isUp = stock.changePct >= 0;
  container.innerHTML = `
    <div class="stock-name">${stock.company}</div>
    <div class="stock-symbol">${stock.symbol}</div>
    <div class="stock-price">${fmtUSD(stock.price)}</div>
    <div class="stock-change ${isUp ? 'up' : 'down'}">${fmtSigned(stock.changePct, { maximumFractionDigits: 2 })}% today</div>
    <div class="details-stats">
      <div><span>Open</span><span>${fmtUSD(stock.open)}</span></div>
      <div><span>Volume</span><span>${stock.volume}</span></div>
      <div><span>High</span><span>${fmtUSD(stock.high)}</span></div>
      <div><span>Low</span><span>${fmtUSD(stock.low)}</span></div>
    </div>
  `;
}

function selectSymbol(symbol) {
  selectedSymbol = symbol;
  renderWatchlist();
  renderDetails();
}

function removeSymbol(symbol) {
  const symbols = getStoredSymbols().filter((s) => s !== symbol);
  saveStoredSymbols(symbols);
  if (selectedSymbol === symbol) selectedSymbol = null;
  refreshWatchlist();
}

document.addEventListener('DOMContentLoaded', () => {
  loadCurrentUser();
  refreshWatchlist();

  document.getElementById('addSymbolBtn').addEventListener('click', async () => {
    const symbol = prompt('Enter a stock symbol to add (e.g. NVDA):');
    if (!symbol) return;
    const clean = symbol.trim().toUpperCase();
    const symbols = getStoredSymbols();
    if (!clean || symbols.includes(clean)) return;

    try {
      const quotes = await fetchQuotes([clean]);
      if (!quotes[clean] || quotes[clean].status === 'error') {
        alert(`Could not find symbol "${clean}".`);
        return;
      }
    } catch {
      alert('Could not reach the market data API.');
      return;
    }

    saveStoredSymbols([...symbols, clean]);
    refreshWatchlist();
  });
});