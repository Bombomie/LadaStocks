(() => {
  // Add ?preview to the URL to see the layout with sample data (no login/API).
  // Remove the PREVIEW lines before deploying.
  const PREVIEW = new URLSearchParams(location.search).has('preview');
  const STATUSES = ['active', 'frozen', 'restricted', 'banned', 'deleted'];
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const now = new Date();
  const md = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

  const MOCK = {
    '/users': { users: [
      { user_id: '1', username: 'Username', email: 'username@gmail.com', birth_date: '2000-' + md, status: 'active', balance: 100000000 },
      { user_id: '2', username: 'Maria', email: 'maria@gmail.com', birth_date: '2000-01-01', status: 'frozen', balance: 85000 },
      { user_id: '3', username: 'Jun', email: 'jun@gmail.com', birth_date: '1999-05-05', status: 'active', balance: 120500 },
    ] },
    '/popular-stocks': { stocks: [{ symbol: 'AAPL', company_name: 'Apple', total: 120 }, { symbol: 'TSLA', company_name: 'Tesla', total: 90 }] },
    '/challenges': { challenges: [{ title: 'Halloween 2026', type: 'special' }] },
  };

  async function guard() {
    if (PREVIEW) return true;
    document.documentElement.style.visibility = 'hidden';
    try {
      const res = await fetch('/api/auth/admin/check', { credentials: 'include' });
      if (res.status === 403) location.replace('../dashboard/dashboard.html');
      else if (!res.ok) location.replace('../authentication/login/login.html');
      else { document.documentElement.style.visibility = 'visible'; return true; }
    } catch { location.replace('../authentication/login/login.html'); }
    return false;
  }

  async function api(path, opts = {}) {
    if (PREVIEW) return MOCK[path] || {};
    const res = await fetch('/api/admin' + path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Request failed.');
    return data;
  }

  let users = [];
  const find = (id) => users.find((u) => u.user_id === id);
  const avatar = (u) => u.avatar_url
    ? `<img class="av" src="${esc(u.avatar_url)}" alt="">`
    : `<span class="av">${esc((u.username || '?')[0].toUpperCase())}</span>`;

  function render() {
    const live = users.filter((u) => u.status !== 'deleted');

    $('#topUsers').innerHTML = [...live].sort((a, b) => b.balance - a.balance).slice(0, 5).map((u) =>
      `<div class="row">${avatar(u)}<div class="grow"><div class="name">${esc(u.username)}</div><small>${esc(u.email)}</small></div>
       <div class="bal"><small>Balance</small>${money(u.balance)}</div></div>`).join('') || '<p class="muted">No users yet.</p>';

    const bdays = live.filter((u) => u.birth_date && u.birth_date.slice(5) === md);
    $('#bdays').innerHTML = bdays.map((u) =>
      `<div class="row">${avatar(u)}<span class="grow name">${esc(u.username)}</span>
       <button class="btn" data-bonus="${esc(u.user_id)}" data-type="birthday">Gift</button></div>`).join('') || '<p class="muted">No birthdays today.</p>';
    $('#bdayBadge').hidden = !bdays.length;
    $('#bdayBadge').textContent = bdays.length;

    $('#userRows').innerHTML = users.map((u) =>
      `<tr><td><div class="cell">${avatar(u)}${esc(u.username)}</div></td><td>${esc(u.email)}</td><td>${money(u.balance)}</td>
       <td><select data-status="${esc(u.user_id)}">${STATUSES.map((s) => `<option${s === u.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td>
       <td><button class="btn" data-bonus="${esc(u.user_id)}" data-type="manual">Bonus</button></td></tr>`).join('');
  }

  async function loadChallenges() {
    const { challenges = [] } = await api('/challenges');
    $('#challenges').innerHTML = challenges.map((c) =>
      `<div class="row"><span class="grow name">${esc(c.title)}</span><small>${esc(c.type)}</small></div>`).join('') || '<p class="muted">No challenges yet.</p>';
  }

  async function init() {
    try {
      users = (await api('/users')).users || [];
      render();
      const { stocks = [] } = await api('/popular-stocks');
      $('#stocks').innerHTML = stocks.map((s, i) =>
        `<div class="row"><span class="rank">${i + 1}</span><span class="grow name">${esc(s.company_name || s.symbol)}</span><small>${esc(s.total)}</small></div>`).join('') || '<p class="muted">No purchases yet.</p>';
      await loadChallenges();
    } catch (err) { alert(err.message); }
  }

  // Sidebar views
  document.querySelectorAll('.sidebar [data-view]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.sidebar button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.view').forEach((v) => { v.hidden = v.id !== 'view-' + b.dataset.view; });
    $('#title').textContent = b.dataset.view === 'users' ? 'Users' : 'Dashboard';
  }));

  // Bonus dialog
  let bonusUser = null;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-bonus]');
    if (b) {
      bonusUser = find(b.dataset.bonus);
      $('#bonusTitle').textContent = 'Bonus for ' + bonusUser.username;
      $('#bonusForm').type.value = b.dataset.type;
      $('#bonusDlg').showModal();
    }
    if (e.target.closest('[data-close]')) e.target.closest('dialog').close();
  });

  $('#bonusForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api(`/users/${bonusUser.user_id}/bonus`, {
        method: 'POST',
        body: JSON.stringify({ amount: f.amount.value, type: f.type.value, reason: f.reason.value }),
      });
      bonusUser.balance += Number(f.amount.value);
      f.reset();
      $('#bonusDlg').close();
      render();
    } catch (err) { alert(err.message); }
  });

  // Account status (freeze / restrict / ban / soft delete / restore)
  document.addEventListener('change', async (e) => {
    const sel = e.target.closest('[data-status]');
    if (!sel) return;
    const u = find(sel.dataset.status);
    if (['banned', 'deleted'].includes(sel.value) && !confirm(`Set ${u.username} to ${sel.value}?`)) {
      sel.value = u.status;
      return;
    }
    try {
      await api(`/users/${u.user_id}/status`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
      u.status = sel.value;
      render();
    } catch (err) { alert(err.message); sel.value = u.status; }
  });

  // Challenges
  $('#newChallenge').addEventListener('click', () => $('#challengeDlg').showModal());
  $('#challengeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api('/challenges', {
        method: 'POST',
        body: JSON.stringify({
          title: f.title.value, description: f.description.value, type: f.type.value,
          endsAt: f.ends.value ? new Date(f.ends.value).toISOString() : null,
        }),
      });
      f.reset();
      $('#challengeDlg').close();
      await loadChallenges();
    } catch (err) { alert(err.message); }
  });

  const ready = new Promise((r) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r) : r()));
  Promise.all([guard(), ready]).then(([ok]) => { if (ok) init(); });
})();