const loginForm = document.getElementById('loginForm');

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

loginForm.addEventListener('submit', async function (event) {
  event.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) {
    showAlert('Please fill out both email and password.');
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showAlert('Please enter a valid email address.');
    return;
  }

  try {
    showAlert('Logging in...');

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      showAlert(data.message || 'Login failed. Please check your credentials.');
      return;
    }

    showAlert('Login successful! Redirecting...');
    setTimeout(() => {
      window.location.href = '../../dashboard/dashboard.html';
    }, 700);
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
