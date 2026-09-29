const API_BASE_URL = 'https://ladastocks-api-server.onrender.com';

async function loadCurrentUser() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    if (response.status === 401) {
      window.location.replace('../authentication/login/login.html');
      return;
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Could not load user session.');

    const usernameElement = document.querySelector('.username');
    if (usernameElement) usernameElement.textContent = data.user.username || 'User';
  } catch (error) {
    console.error('Authentication error:', error);
  }
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
  });
  if (res.status === 401) {
    window.location.replace('../authentication/login/login.html');
    throw new Error('Session expired');
  }
  return res;
}