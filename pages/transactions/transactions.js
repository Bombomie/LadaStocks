// pages/transactions/transactions.js

let allTransactions = [];
let quoteMap = {};
let currentPage = 1;
const PAGE_SIZE = 12;

const $ = (id) => document.getElementById(id);
const fmtUSD = (n) => (n == null || Number.isNaN(Number(n)))
  ? '—'
  : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

const fmtDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleString('en-US', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
};

async function fetchTransactions() {
  const res = await fetch('/api/transactions', { credentials: 'include' });
  if (res.status === 401) {
    window.location.replace('../authentication/login/login.html');
    throw new Error('Unauthorized');
  }
  if (!res.ok) throw new Error('Could not load transactions.');
  return res.json();
}

// Uses the real /api/stocks/quote/:symbol endpoint (not /api/market/quote)
async function fetchQuotes(symbols) {
  const tickers = [...new Set(symbols.filter((s) => s && s !== 'CASH' && s !== 'UNKNOWN'))].slice(0, 12);
  if (!tickers.length) return {};
  const results = await Promise.all(
    tickers.map((sym) =>
      fetch(`/api/stocks/quote/${encodeURIComponent(sym)}`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
    )
  );
  const map = {};
  tickers.forEach((sym, i) => {
    const q = results[i]?.data;
    if (q) map[sym] = parseFloat(q.currentPrice || q.close || q.price || 0);
  });
  return map;
}

function getFilteredTransactions() {
  const q = $('txSearch').value.trim().toLowerCase();
  const typeF = $('txTypeFilter').value;
  return allTransactions.filter((tx) => {
    const matchType = typeF === 'ALL' || tx.tradeType === typeF;
    const matchText = !q ||
      (tx.symbol || '').toLowerCase().includes(q) ||
      (tx.confirmation || '').toLowerCase().includes(q) ||
      (tx.description || '').toLowerCase().includes(q);
    return matchType && matchText;
  });
}

function renderSummary() {
  const bought = allTransactions
    .filter((t) => t.tradeType === 'BUY')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const sold = allTransactions
    .filter((t) => t.tradeType === 'SELL')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const realized = allTransactions
    .reduce((s, t) => s + Number(t.realizedPnl || 0), 0);

  $('txTotalCount').textContent = allTransactions.length;
  $('txTotalBought').textContent = fmtUSD(bought);
  $('txTotalSold').textContent = fmtUSD(sold);

  const rpEl = $('txRealizedPnl');
  rpEl.textContent = `${realized >= 0 ? '+' : ''}${fmtUSD(realized)}`;
  rpEl.className = `summary-value ${realized >= 0 ? 'up' : 'down'}`;
}

function renderTransactions() {
  const tbody = $('transactionsBody');
  const filtered = getFilteredTransactions();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:26px;">No transactions match your filters.</td></tr>';
    renderPagination(0);
    return;
  }

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  tbody.innerHTML = pageItems.map((tx) => {
    const curPrice = tx.symbol !== 'CASH' ? quoteMap[tx.symbol] : null;
    const statusCls = tx.status === 'rejected'
      ? 'status-rejected'
      : tx.status === 'flagged'
        ? 'status-flagged'
        : 'status-executed';
    const qtyOrAmt = tx.shares != null
      ? `${tx.shares} sh (${fmtUSD(tx.amount)})`
      : fmtUSD(tx.amount);
    const execPrice = tx.pricePerShare != null ? `$${Number(tx.pricePerShare).toFixed(2)}` : 'CASH';
    const pnlCell = tx.realizedPnl != null
      ? `<span class="${tx.realizedPnl >= 0 ? 'up' : 'down'}">${tx.realizedPnl >= 0 ? '+' : ''}${fmtUSD(tx.realizedPnl)}</span>`
      : '—';

    return `
      <tr data-tx-id="${esc(tx.id)}">
        <td class="trade-type ${esc(tx.tradeType.toLowerCase())}">${esc(tx.tradeType)}</td>
        <td class="symbol"><strong>${esc(tx.symbol)}</strong></td>
        <td>${esc(qtyOrAmt)}</td>
        <td>${esc(execPrice)}</td>
        <td>${curPrice != null ? fmtUSD(curPrice) : '—'}</td>
        <td>${pnlCell}</td>
        <td>${esc(fmtDate(tx.tradeEntered))}</td>
        <td>${esc(tx.confirmation || '—')}</td>
        <td class="${statusCls}">${esc(tx.description || 'Executed')}</td>
      </tr>`;
  }).join('');

  renderPagination(filtered.length);
}

function renderPagination(totalCount) {
  const container = $('pagination');
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  container.innerHTML = '';
  if (totalCount === 0) return;

  const prevBtn = document.createElement('button');
  prevBtn.textContent = '‹';
  prevBtn.disabled = currentPage === 1;
  prevBtn.addEventListener('click', () => { currentPage -= 1; renderTransactions(); });
  container.appendChild(prevBtn);

  for (let p = 1; p <= totalPages; p += 1) {
    const btn = document.createElement('button');
    btn.textContent = String(p);
    btn.className = p === currentPage ? 'active' : '';
    btn.addEventListener('click', () => { currentPage = p; renderTransactions(); });
    container.appendChild(btn);
  }

  const nextBtn = document.createElement('button');
  nextBtn.textContent = '›';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.addEventListener('click', () => { currentPage += 1; renderTransactions(); });
  container.appendChild(nextBtn);
}

function openReceiptModal(tx) {
  $('txModalTitle').textContent = `${tx.tradeType} Receipt — ${tx.symbol}`;
  $('txModalBody').innerHTML = `
    <div class="tx-detail-row"><span>Confirmation ID</span><strong>${esc(tx.confirmation)}</strong></div>
    <div class="tx-detail-row"><span>Category</span><strong>${esc(tx.category.toUpperCase())}</strong></div>
    <div class="tx-detail-row"><span>Ticker / Account</span><strong>${esc(tx.symbol)} (${esc(tx.company)})</strong></div>
    <div class="tx-detail-row"><span>Shares</span><strong>${tx.shares != null ? tx.shares : '—'}</strong></div>
    <div class="tx-detail-row"><span>Execution Price</span><strong>${tx.pricePerShare != null ? fmtUSD(tx.pricePerShare) : '—'}</strong></div>
    <div class="tx-detail-row"><span>Total Amount</span><strong>${fmtUSD(tx.amount)}</strong></div>
    <div class="tx-detail-row"><span>Realized P/L</span><strong>${tx.realizedPnl != null ? fmtUSD(tx.realizedPnl) : '—'}</strong></div>
    <div class="tx-detail-row"><span>Executed At</span><strong>${esc(fmtDate(tx.tradeEntered))}</strong></div>
    <div class="tx-detail-row"><span>Status</span><strong>${esc(tx.status.toUpperCase())}</strong></div>
    ${tx.reviewNote ? `<div class="tx-detail-row"><span>Admin Note</span><strong>${esc(tx.reviewNote)}</strong></div>` : ''}
  `;
  $('txModal').hidden = false;
}

async function init() {
  $('transactionsBody').innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px;">Loading transactions...</td></tr>';
  try {
    allTransactions = await fetchTransactions();
    renderSummary();
    quoteMap = await fetchQuotes(allTransactions.map((t) => t.symbol));
    renderTransactions();
  } catch (err) {
    console.error('Transactions load error:', err);
    $('transactionsBody').innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--accent-down);padding:24px;">Could not load transactions.</td></tr>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('txSearch').addEventListener('input', () => { currentPage = 1; renderTransactions(); });
  $('txTypeFilter').addEventListener('change', () => { currentPage = 1; renderTransactions(); });
  $('transactionsBody').addEventListener('click', (e) => {
    const row = e.target.closest('tr[data-tx-id]');
    if (!row) return;
    const tx = allTransactions.find((t) => String(t.id) === row.dataset.txId);
    if (tx) openReceiptModal(tx);
  });
  $('closeTxModal').addEventListener('click', () => { $('txModal').hidden = true; });
  $('txModal').addEventListener('click', (e) => {
    if (e.target === $('txModal')) $('txModal').hidden = true;
  });

  init();
});
