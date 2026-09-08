document.getElementById('birthDate').value = '';
const registerForm = document.getElementById('registerForm');

function showAlert(message) {
  const alertBox = document.createElement('div');
  alertBox.className = 'custom-alert';
  alertBox.textContent = message;

  alertBox.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #525EA7;
    color: white;
    padding: 12px 24px;
    border-radius: 30px;
    z-index: 1000;
    font-family: 'Poppins', sans-serif;
    font-size: 1em;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  `;

  document.body.appendChild(alertBox);
  setTimeout(() => alertBox.remove(), 3000);
}

registerForm.addEventListener('submit', async function (event) {
  event.preventDefault();

  const username = document.getElementById('username').value.trim();
  const email = document.getElementById('email').value.trim();
  const birthDate = document.getElementById('birthDate').value;
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if (!username || !email || !birthDate || !password || !confirmPassword) {
    showAlert('Please fill out all fields.');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showAlert('Please enter a valid email address.');
    return;
  }

  if (password.length < 8) {
    showAlert('Password must be at least 8 characters long.');
    return;
  }

  if (password !== confirmPassword) {
    showAlert('Passwords do not match.');
    return;
  }

  try {
    showAlert('Creating your account...');

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, email, password, birthDate }),
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.message || 'Registration failed. Please try again.');
      return;
    }

    showAlert(
      data.requiresEmailConfirmation
        ? 'Account created! Check your email, then log in.'
        : 'Registration successful! Redirecting to login...',
    );

    setTimeout(() => {
      window.location.href = '../login/login.html';
    }, 1200);
  } catch (error) {
    console.error('Network error:', error);
    showAlert('Network error. Is the Node.js server running?');
  }
});

const togglePasswordButtons = document.querySelectorAll('.toggle-password');

togglePasswordButtons.forEach((button) => {
  button.addEventListener('click', function () {
    const targetId = this.getAttribute('data-target');
    const passwordInput = document.getElementById(targetId);
    const eyeIcon = this.querySelector('.eye-icon');
    const eyeSlashIcon = this.querySelector('.eye-slash-icon');

    if (passwordInput.type === 'password') {
      passwordInput.type = 'text';
      eyeIcon.style.display = 'none';
      eyeSlashIcon.style.display = 'block';
    } else {
      passwordInput.type = 'password';
      eyeIcon.style.display = 'block';
      eyeSlashIcon.style.display = 'none';
    }
  });
});
