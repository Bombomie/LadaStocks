// pages/dashboard/dashboard.js — same-origin API calls, announcements, KPIs, alerts, and news

const $ = (id) => document.getElementById(id);
const fmtUSD = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));

function esc(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

async function apiGet(url) {
  const res = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (res.status === 401) {
    window.location.replace('../authentication/login/login.html');
    throw new Error('Unauthorized');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message || 'Request failed');
  return data;
}

function renderAnnouncements(items) {
  const panel = $('announcementsSection');
  const feed = $('announcementsFeed');
  if (!Array.isArray(items) || items.length === 0) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  feed.innerHTML = items.map((a) => `
    <div class="ann-item ${esc(a.severity)}">
      <div class="ann-head">
        <span class="ann-title">${a.is_pinned ? '📌 ' : ''}${esc(a.title)}</span>
        <span class="ann-badge">${esc(a.severity)}</span>
      </div>
      <p class="ann-msg">${esc(a.message)}</p>
      <span class="ann-date">${new Date(a.created_at).toLocaleString('en-US')}</span>
    </div>
  `).join('');
}

function renderSummary(summary) {
  $('dashNetWorth').textContent = fmtUSD(summary.totalValue);
  $('dashCashBalance').textContent = fmtUSD(summary.cashBalance);
  $('dashPortfolioValue').textContent = fmtUSD(summary.portfolioValue);

  const pnl = Number(summary.unrealizedPnl || 0);
  const pnlEl = $('dashUnrealizedPnl');
  pnlEl.textContent = `${pnl >= 0 ? '+' : ''}${fmtUSD(pnl)}`;
  pnlEl.className = `summary-value ${pnl >= 0 ? 'up' : 'down'}`;
}

function renderWatchlistAlerts(items) {
  const box = $('watchlistAlerts');
  if (!Array.isArray(items) || items.length === 0) {
    box.innerHTML = '<p class="muted">No stocks in your watchlist yet. Add one on the Watchlist page.</p>';
    return;
  }

  box.innerHTML = items.slice(0, 8).map((item) => {
    const pct = Number(item.changePct || 0);
    const hasTarget = item.target_price != null;
    const statusText = hasTarget
      ? `Target ${fmtUSD(item.target_price)} (${item.targetStatus === 'hit' ? 'Target Hit' : pct >= 0 ? 'Above' : 'Below'})`
      : 'Daily change';
    return `
      <a class="alert-row" href="../charts/charts.html?symbol=${encodeURIComponent(item.symbol)}">
        <div>
          <strong>${esc(item.symbol)}</strong>
          <div class="muted" style="font-size:0.78rem;">${esc(statusText)}</div>
        </div>
        <div style="text-align:right;">
          <div>${fmtUSD(item.price)}</div>
          <div class="${pct >= 0 ? 'up' : 'down'}" style="font-size:0.8rem;">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</div>
        </div>
      </a>
    `;
  }).join('');
}

function renderMarketNews(res) {
  const list = res?.data || [];
  const box = $('marketNewsList');
  if (!list.length) {
    box.innerHTML = '<p class="muted">Market headlines unavailable right now.</p>';
    return;
  }
  box.innerHTML = list.slice(0, 8).map((item) => `
    <a class="news-row" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">
      <span class="news-title">${esc(item.headline)}</span>
      <span class="news-meta">${esc(item.source || 'Finnhub')} · ${item.datetime ? new Date(item.datetime).toLocaleDateString('en-US') : ''}</span>
    </a>
  `).join('');
}

async function initDashboard() {
  const [annRes, sumRes, watchRes, statusRes, newsRes] = await Promise.allSettled([
    apiGet('/api/announcements'),
    apiGet('/api/portfolio/summary'),
    apiGet('/api/watchlist/with-quotes'),
    apiGet('/api/stocks/market-status'),
    apiGet('/api/stocks/news'),
  ]);

  if (annRes.status === 'fulfilled') renderAnnouncements(annRes.value);
  if (sumRes.status === 'fulfilled') renderSummary(sumRes.value);
  if (watchRes.status === 'fulfilled') renderWatchlistAlerts(watchRes.value);
  if (newsRes.status === 'fulfilled') renderMarketNews(newsRes.value);

  if (statusRes.status === 'fulfilled' && statusRes.value?.data) {
    const st = statusRes.value.data;
    const badge = $('marketStatusBadge');
    badge.textContent = `US Market: ${st.isOpen ? 'OPEN' : 'CLOSED'} (${st.session || 'regular'})`;
    badge.className = `market-badge ${st.isOpen ? 'open' : 'closed'}`;
  }
}

document.addEventListener('DOMContentLoaded', initDashboard);
