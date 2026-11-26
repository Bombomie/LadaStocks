// pages/User/user.js — profile page logic
// Only username (and Cloudinary avatar) + password can be edited by the user.
// Email and birth date remain locked and require contacting the administrator.

const LOGIN_PAGE = '../authentication/login/login.html';
const DEFAULT_AVATAR = '../../Images/profile.png';
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

let currentUser = null;

const $ = (id) => document.getElementById(id);
const fmtUSD = (n) => Number(n ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function setMsg(el, message, isSuccess = false) {
  if (!el) return;
  el.textContent = message;
  el.classList.toggle('success', Boolean(message) && isSuccess);
  el.classList.toggle('error', Boolean(message) && !isSuccess);
}

const modalMsg = $('modalMsg');
const passwordMsg = $('passwordMsg');
const avatarMsg = $('avatarMsg');

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });

  if (res.status === 401) {
    window.location.replace(LOGIN_PAGE);
    throw new Error('Session expired');
  }

  return res;
}

function sizedAvatar(url) {
  if (typeof url === 'string' && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/w_256,h_256,c_fill,q_auto/');
  }
  return url;
}

function updateDisplayedName(name) {
  document.querySelector('.username').textContent = name;
  $('profileUsername').textContent = name;

  const navbarName = document
    .querySelector('lada-navbar')
    ?.shadowRoot?.querySelector('.username');
  if (navbarName) navbarName.textContent = name;
}

function renderAvatar(avatarUrl) {
  const src = avatarUrl ? sizedAvatar(avatarUrl) : DEFAULT_AVATAR;
  const img = $('avatarImg');
  img.onerror = () => {
    img.onerror = null;
    img.src = DEFAULT_AVATAR;
  };
  img.src = src;

  const navbarAvatar = document
    .querySelector('lada-navbar')
    ?.shadowRoot?.querySelector('.avatar');
  if (navbarAvatar) {
    navbarAvatar.onerror = () => { navbarAvatar.onerror = null; navbarAvatar.src = DEFAULT_AVATAR; };
    navbarAvatar.src = src;
  }
}

function fillProfile(profile) {
  currentUser = profile;

  updateDisplayedName(profile.username || 'User');
  $('profileEmail').textContent = profile.email || '—';
  $('profileBirthDate').textContent = profile.birth_date || '—';
  $('accountRole').textContent = profile.isAdmin ? 'Administrator' : 'Trader';
  renderAvatar(profile.avatar_url);

  if (profile.created_at) {
    const since = new Date(profile.created_at).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    $('memberSince').textContent = `Member since ${since}`;
  }

  $('editUsername').value = profile.username || '';

  const adminMailLink = $('adminMailLink');
  if (adminMailLink && profile.username) {
    const subject = encodeURIComponent(`LadaStocks Profile Change Request (${profile.username})`);
    const body = encodeURIComponent(
      `Hello Administrator,\n\nI would like to request an update to my locked profile details.\n\nUsername: ${profile.username}\nRegistered Email: ${profile.email || ''}\nRequested Change (Email or Birth Date YYYY-MM-DD): \n\nThank you.`
    );
    adminMailLink.href = `mailto:24104152@usc.edu.ph?subject=${subject}&body=${body}`;
  }
}

async function loadSnapshot() {
  try {
    const res = await apiFetch('/api/portfolio/summary');
    if (!res.ok) return;
    const summary = await res.json();
    $('snapCash').textContent = fmtUSD(summary.cashBalance);
    $('snapNetWorth').textContent = fmtUSD(summary.totalValue);
  } catch {
    // Non-blocking snapshot
  }
}

async function loadCurrentUser() {
  try {
    const res = await apiFetch('/api/auth/me');
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Could not load profile.');
    fillProfile(data.user);
    loadSnapshot();
  } catch (err) {
    if (err.message === 'Session expired') return;
    console.warn('Could not load profile:', err.message);
  }
}

async function uploadAvatar(file) {
  if (!AVATAR_TYPES.includes(file.type)) {
    throw new Error('Please choose a PNG, JPG or WebP image.');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('Image must be 2 MB or smaller.');
  }

  const signRes = await apiFetch('/api/uploads/sign', { method: 'POST' });
  const sign = await signRes.json();
  if (!signRes.ok) {
    throw new Error(sign.message || sign.error || 'Upload service unavailable.');
  }

  const form = new FormData();
  form.append('file', file);
  form.append('api_key', sign.apiKey);
  form.append('timestamp', sign.timestamp);
  form.append('signature', sign.signature);

  const upRes = await fetch(
    `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,
    { method: 'POST', body: form }
  );
  const upData = await upRes.json().catch(() => ({}));
  if (!upRes.ok) {
    throw new Error(upData.error?.message || 'Upload to Cloudinary failed.');
  }

  const avatarUrl = upData.secure_url;
  const patchRes = await apiFetch('/api/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatarUrl }),
  });
  const patchData = await patchRes.json().catch(() => ({}));
  if (!patchRes.ok) {
    throw new Error(patchData.error || 'Could not save the new avatar.');
  }

  currentUser = { ...currentUser, avatar_url: avatarUrl };
  renderAvatar(avatarUrl);
}

function onAvatarChosen() {
  const input = $('avatarInput');
  const file = input.files && input.files[0];
  if (!file) return;

  $('avatarBtn').disabled = true;
  setMsg(avatarMsg, 'Uploading picture…');

  uploadAvatar(file)
    .then(() => setMsg(avatarMsg, 'Profile picture updated!', true))
    .catch((err) => {
      if (err.message === 'Session expired') return;
      setMsg(avatarMsg, err.message || 'Upload failed.');
    })
    .finally(() => {
      $('avatarBtn').disabled = false;
      input.value = '';
    });
}

function openEditModal() {
  if (!currentUser) return;
  $('editUsername').value = currentUser.username || '';
  setMsg(modalMsg, '');
  setMsg(passwordMsg, '');
  $('editModal').hidden = false;
  $('editUsername').focus();
}

function closeModal() {
  $('editModal').hidden = true;
}

$('avatarBtn').addEventListener('click', () => $('avatarInput').click());
$('avatarInput').addEventListener('change', onAvatarChosen);
$('editProfileBtn').addEventListener('click', openEditModal);
$('closeModal').addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
$('editModal').addEventListener('click', (e) => {
  if (e.target === $('editModal')) closeModal();
});

$('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = $('editUsername').value.trim();
  if (!username) return setMsg(modalMsg, 'Username cannot be empty.');

  try {
    // Only username is sent — email and birth date remain strictly locked.
    const res = await apiFetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(modalMsg, data.error || data.message || 'Update failed.');

    currentUser = { ...currentUser, username };
    updateDisplayedName(username);
    $('editUsername').value = username;
    setMsg(modalMsg, 'Username updated!', true);
  } catch (err) {
    if (err.message !== 'Session expired') setMsg(modalMsg, 'Network error.');
  }
});

$('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const currentPassword = $('currentPassword').value;
  const newPassword = $('newPassword').value;
  const confirmPassword = $('confirmPassword').value;

  if (newPassword !== confirmPassword) {
    return setMsg(passwordMsg, 'New passwords do not match.');
  }

  try {
    const res = await apiFetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return setMsg(passwordMsg, data.error || data.message || 'Could not change password.');
    }

    $('currentPassword').value = '';
    $('newPassword').value = '';
    $('confirmPassword').value = '';
    setMsg(passwordMsg, 'Password updated!', true);
  } catch (err) {
    if (err.message !== 'Session expired') setMsg(passwordMsg, 'Network error.');
  }
});

$('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    // Clear locally regardless
  }
  window.location.href = LOGIN_PAGE;
});

loadCurrentUser();
