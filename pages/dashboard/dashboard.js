const API_BASE_URL = 'https://ladastocks-api-server.onrender.com';

loadCurrentUser();

(async function requireLogin() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
    if (!res.ok) throw new Error();
  } catch {
    window.location.href = '../authentication/login/login.html';
  }
})();