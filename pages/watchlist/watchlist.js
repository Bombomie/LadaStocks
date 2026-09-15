// ---- Auth check ----
async function loadCurrentUser() {
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (response.status === 401) {
      window.location.replace('../authentication/login/login.html');
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Could not load user session.');
    }

    const usernameElement = document.querySelector('.username');
    if (usernameElement) {
      usernameElement.textContent = data.user.username || 'User';
    }
  } catch (error) {
    console.error('Dashboard authentication error:', error);
    window.location.replace('../authentication/login/login.html');
  }
}

// ---- Sample data (replace with API/Supabase calls once wired up) ----
const portfolioSummary = {
  value: 24580.32,
  cash: 3120.75,
  todaysChange: 214.18,
  totalReturnPct: 12.4,
};

let watchlist = [
  { symbol: "AAPL", company: "Apple Inc.", price: 227.15, changePct: 1.32, open: 224.80, high: 228.40, low: 223.90, volume: "48.2M" },
  { symbol: "GOOGL", company: "Alphabet Inc.", price: 172.63, changePct: -0.48, open: 173.50, high: 174.10, low: 171.90, volume: "21.7M" },
  { symbol: "TSLA", company: "Tesla, Inc.", price: 248.09, changePct: 3.71, open: 238.20, high: 250.00, low: 237.60, volume: "92.4M" },
  { symbol: "AMZN", company: "Amazon.com, Inc.", price: 189.44, changePct: 0.66, open: 188.10, high: 190.20, low: 187.55, volume: "35.9M" },
  { symbol: "MSFT", company: "Microsoft Corp.", price: 421.77, changePct: -1.05, open: 426.30, high: 427.00, low: 419.80, volume: "18.3M" },
];

let selectedSymbol = null;

const fmtUSD = (n) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

const fmtSigned = (n, opts = {}) => {
  const sign = n > 0 ? "+" : n < 0 ? "" : "";
  return `${sign}${n.toLocaleString("en-US", opts)}`;
};

function renderSummary() {
  document.getElementById("portfolioValue").textContent = fmtUSD(portfolioSummary.value);
  document.getElementById("cashBalance").textContent = fmtUSD(portfolioSummary.cash);

  const changeEl = document.getElementById("todaysChange");
  changeEl.textContent = fmtSigned(portfolioSummary.todaysChange, { style: "currency", currency: "USD" });
  changeEl.classList.toggle("up", portfolioSummary.todaysChange >= 0);
  changeEl.classList.toggle("down", portfolioSummary.todaysChange < 0);

  const returnEl = document.getElementById("totalReturn");
  returnEl.textContent = `${fmtSigned(portfolioSummary.totalReturnPct, { maximumFractionDigits: 2 })}%`;
  returnEl.classList.toggle("up", portfolioSummary.totalReturnPct >= 0);
  returnEl.classList.toggle("down", portfolioSummary.totalReturnPct < 0);
}

function renderWatchlist() {
  const tbody = document.getElementById("watchlistBody");
  tbody.innerHTML = "";

  watchlist.forEach((stock) => {
    const isUp = stock.changePct >= 0;
    const row = document.createElement("tr");
    row.dataset.symbol = stock.symbol;
    row.className = stock.symbol === selectedSymbol ? "selected" : "";
    row.innerHTML = `
      <td class="symbol">${stock.symbol}</td>
      <td class="company">${stock.company}</td>
      <td>${fmtUSD(stock.price)}</td>
      <td class="change ${isUp ? "up" : "down"}">${fmtSigned(stock.changePct, { maximumFractionDigits: 2 })}%</td>
      <td><button class="remove-btn" data-symbol="${stock.symbol}" title="Remove from watchlist">&times;</button></td>
    `;
    row.addEventListener("click", (e) => {
      if (e.target.closest(".remove-btn")) return;
      selectSymbol(stock.symbol);
    });
    tbody.appendChild(row);
  });

  tbody.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeSymbol(btn.dataset.symbol);
    });
  });
}

function renderDetails() {
  const container = document.getElementById("detailsBody");
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
    <div class="stock-change ${isUp ? "up" : "down"}">${fmtSigned(stock.changePct, { maximumFractionDigits: 2 })}% today</div>
    <div class="details-stats">
      <div><span>Open</span><span>${fmtUSD(stock.open)}</span></div>
      <div><span>Volume</span><span>${stock.volume}</span></div>
      <div><span>High</span><span>${fmtUSD(stock.high)}</span></div>
      <div><span>Low</span><span>${fmtUSD(stock.low)}</span></div>
    </div>
    <div class="details-actions">
      <button class="buy-btn" type="button">Buy</button>
      <button class="sell-btn" type="button">Sell</button>
    </div>
  `;
}

function selectSymbol(symbol) {
  selectedSymbol = symbol;
  renderWatchlist();
  renderDetails();
}

function removeSymbol(symbol) {
  watchlist = watchlist.filter((s) => s.symbol !== symbol);
  if (selectedSymbol === symbol) selectedSymbol = null;
  renderWatchlist();
  renderDetails();
}

document.addEventListener("DOMContentLoaded", () => {
  loadCurrentUser();
  renderSummary();
  renderWatchlist();
  renderDetails();

  document.getElementById("addSymbolBtn").addEventListener("click", () => {
    const symbol = prompt("Enter a stock symbol to add (e.g. NVDA):");
    if (!symbol) return;
    const clean = symbol.trim().toUpperCase();
    if (!clean || watchlist.some((s) => s.symbol === clean)) return;
    // Placeholder entry until wired up to the market data API
    watchlist.push({
      symbol: clean,
      company: "—",
      price: 0,
      changePct: 0,
      open: 0,
      high: 0,
      low: 0,
      volume: "—",
    });
    renderWatchlist();
  });
});