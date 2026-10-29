// loadCurrentUser();

document.querySelector('.edit-pf').addEventListener('click', () => {
  if (!currentUser) return;
  document.getElementById('editUsername').value = currentUser.username || '';
  document.getElementById('editEmail').value = currentUser.email || '';
  document.getElementById('editBirthDate').value = currentUser.birth_date || '';
  setMsg('');
  modal.hidden = false;
});

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const res = await apiFetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('editUsername').value.trim(),
        birthDate: document.getElementById('editBirthDate').value,
      }),
    });
    const data = await res.json();
    if (!res.ok) return setMsg(data.message || 'Update failed.');

    currentUser = data.user;
    document.querySelector('.username').textContent = currentUser.username;
    setMsg('Profile updated!', true);
  } catch (err) {
    if (err.message !== 'Session expired') setMsg('Network error.');
  }
});