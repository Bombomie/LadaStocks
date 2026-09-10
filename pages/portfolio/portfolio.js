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

loadCurrentUser();
