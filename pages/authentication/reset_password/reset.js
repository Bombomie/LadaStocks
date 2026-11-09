// reset.js — shared logic for the reset_password and change_password pages.
// ------------------------------------------------------------
// reset_password.html  → asks for the email; our server tells Supabase to
//                        send the recovery email.
// change_password.html → the page Supabase redirects to after the user
//                        clicks the link in that email. The link returns
//                        with the recovery session in the URL fragment
//                        (#access_token=…&refresh_token=…); this script
//                        scrubs the fragment and posts the tokens + new
//                        password to the server, which performs the change.
//
// Both pages load this one script; each block only runs when its form
// exists on the page.
//
// All API calls use same-origin relative URLs ('/api/...') with
// credentials: 'include' — the same convention that fixed the
// login <-> dashboard redirect loop.
// ------------------------------------------------------------

// ==========================================
// 1. Custom Alert Function (toast at the top)
// ==========================================
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

  setTimeout(() => {
    document.body.removeChild(alertBox);
  }, 3000);
}

// ==========================================
// 2. Toggle Password Visibility (eye icons)
// ==========================================
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

// ==========================================
// 3. Handle "Reset Password" Form (sending the email)
// ==========================================
const resetForm = document.getElementById('resetForm');

if (resetForm) {
  const resetSubmitBtn = resetForm.querySelector('button[type="submit"]');

  resetForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const emailInput = document.getElementById('email');
    const email = emailInput.value.trim();

    if (!email) {
      showAlert('Please enter your email.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showAlert('Please enter a valid email address.');
      return;
    }

    resetSubmitBtn.disabled = true;

    try {
      // Node backend → Supabase sends the recovery email.
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        // Generic on purpose: never reveal whether the email exists.
        showAlert(data.message || 'Reset link sent! Check your email inbox.');
        emailInput.value = '';
      } else {
        showAlert(data.message || 'Failed to send the reset link.');
      }
    } catch (error) {
      console.error('Network error:', error);
      showAlert('An error occurred while sending the reset link.');
    } finally {
      resetSubmitBtn.disabled = false;
    }
  });
}

// ==========================================
// 4. Handle "Change Password" Form (after the email link)
// ==========================================

// Supabase redirects here with the recovery session in the URL *fragment*
// (#access_token=…&refresh_token=…). Fragments are never sent to any server,
// but we still scrub them from the address bar right away and keep the
// values only in this in-memory variable.
function readRecoveryTokens() {
  if (!window.location.hash) return null;

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const type = params.get('type');

  // Remove the tokens from the URL so they don't linger in the browser
  // history, screen shares, or copied links.
  history.replaceState(null, '', window.location.pathname + window.location.search);

  if (type && type !== 'recovery') return null;
  if (!accessToken || !refreshToken) return null;
  return { accessToken: accessToken, refreshToken: refreshToken };
}

const recoveryTokens = readRecoveryTokens();
const changePasswordForm = document.getElementById('changePasswordForm');

if (changePasswordForm) {
  const INVALID_LINK_MSG =
    'This password reset link is invalid or has expired. Please request a new one.';

  if (!recoveryTokens) {
    // Page opened directly, or the link already expired/was used.
    showAlert(INVALID_LINK_MSG);
    setTimeout(() => {
      window.location.href = '../reset_password/reset_password.html';
    }, 2500);
  }

  changePasswordForm.addEventListener('submit', async function (event) {
    event.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (!newPassword || !confirmPassword) {
      showAlert('Please fill out both password fields.');
      return;
    }

    if (newPassword.length < 8) {
      showAlert('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      showAlert('Passwords do not match.');
      return;
    }

    if (!recoveryTokens) {
      showAlert(INVALID_LINK_MSG);
      return;
    }

    const submitBtn = changePasswordForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try {
      // Node backend sets the recovery session server-side and updates
      // the password with Supabase.
      const response = await fetch('/api/auth/update-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken: recoveryTokens.accessToken,
          refreshToken: recoveryTokens.refreshToken,
          newPassword: newPassword,
          confirmPassword: confirmPassword,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        showAlert(data.message || 'Password updated successfully! Redirecting to login...');

        // Redirect back to login page after 2 seconds
        setTimeout(() => {
          window.location.href = '../login/login.html';
        }, 2000);
      } else {
        showAlert(data.message || 'Failed to update the password.');
        submitBtn.disabled = false;
      }
    } catch (error) {
      console.error('Network error:', error);
      showAlert('An error occurred while updating the password.');
      submitBtn.disabled = false;
    }
  });
}