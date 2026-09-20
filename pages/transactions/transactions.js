async function loadCurrentUser() {
  try {
    const response = await fetch('/api/auth/me', {
      method: 'GET', credentials: 'include', headers: { Accept: 'application/json' },
    });
    
    // ONLY redirect if the server explicitly says "Unauthorized"
    if (response.status === 401) {
      window.location.replace('../authentication/login/login.html');
      return false; 
    }
    
    const data = await response.json();
    if (!response.ok) throw new Error(data.message);
    
    const el = document.querySelector('.username');
    if (el) el.textContent = data.user.username || 'User';
    return true; // Success!
  } catch (err) {
    console.error('Auth error:', err);
    // Don't redirect on generic network errors, just log it
    return false; 
  }
}

let transactions = [];
let currentPage = 1;
const PAGE_SIZE = 10;

async function fetchTransactions() {
  const res = await fetch('/api/transactions', { credentials: 'include' });
  if (!res.ok) throw new Error('Could not load transactions');
  return res.json(); // expects [{ tradeType, symbol, shares, limitPrice, tradeEntered, confirmation, status }]
}

async function fetchQuotes(symbols) {
  if (!symbols.length) return {};
  const res = await fetch(`/api/market/quote?symbols=${symbols.join(',')}`, { credentials: 'include' });
  const data = await res.json();
  return symbols.length === 1 ? { [symbols[0]]: data } : data;
}

const fmtDate = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
};

function tradeTypeClass(type) {
  const t = type.toLowerCase().replace(' ', '-');
  return t; // "buy" | "sell" | "short-sell"
}

function renderTransactions() {
  const tbody = document.getElementById('transactionsBody');
  tbody.innerHTML = '';

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = transactions.slice(start, start + PAGE_SIZE);

  pageItems.forEach((tx) => {
    const isRejected = /rejected/i.test(tx.description || tx.status || '');
    const row = document.createElement('tr');
    row.innerHTML = `
      <td class="trade-type ${tradeTypeClass(tx.tradeType)}">${tx.tradeType}</td>
      <td class="symbol">${tx.symbol}</td>
      <td>${tx.isDollarValue ? `$${tx.shares}` : tx.shares}</td>
      <td>${tx.limitPrice === 'MARKET' ? '$MARKET' : `$${Number(tx.limitPrice).toFixed(4)}`}</td>
      <td>${tx.currentPrice != null ? `$${Number(tx.currentPrice).toFixed(2)}` : '—'}</td>
      <td>${fmtDate(tx.tradeEntered)}</td>
      <td>${tx.confirmation || '—'}</td>
      <td class="${isRejected ? 'status-rejected' : 'status-executed'}">${tx.description || (isRejected ? 'Order Rejected' : 'Order Executed')}</td>
    `;
    tbody.appendChild(row);
  });

  renderPagination();
}

function renderPagination() {
  const container = document.getElementById('pagination');
  const totalPages = Math.max(1, Math.ceil(transactions.length / PAGE_SIZE));
  container.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '‹';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => { currentPage--; renderTransactions(); });
  container.appendChild(prevBtn);

  for (let p = 1; p <= totalPages; p++) {
    const btn = document.createElement('button');
    btn.textContent = p;
    btn.className = p === currentPage ? 'active' : '';
    btn.addEventListener('click', () => { currentPage = p; renderTransactions(); });
    container.appendChild(btn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '›';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => { currentPage++; renderTransactions(); });
  container.appendChild(nextBtn);
}

async function init() {
  // MUST await this! Otherwise it runs in the background and causes race conditions
  const isAuthed = await loadCurrentUser();
  if (!isAuthed) return; // Stop loading the page if auth failed

  try {
    transactions = await fetchTransactions();

    // Optional: attach current market price per unique symbol via Twelve Data
    const symbols = [...new Set(transactions.map((t) => t.symbol))];
    const quotes = await fetchQuotes(symbols);
    transactions = transactions.map((t) => ({
      ...t,
      currentPrice: parseFloat(quotes[t.symbol]?.close) || null,
    }));

    renderTransactions();
  } catch (err) {
    console.error('Transactions load error:', err);
  }
}

document.addEventListener('DOMContentLoaded', init);