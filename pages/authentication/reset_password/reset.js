// ==========================================
// 1. Custom Alert Function (Same as before)
// ==========================================
function showAlert(message) {
  const alertBox = document.createElement("div");
  alertBox.className = "custom-alert";
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
// 2. Toggle Password Visibility (Your code)
// ==========================================
const togglePasswordButtons = document.querySelectorAll('.toggle-password');

togglePasswordButtons.forEach(button => {
    button.addEventListener('click', function() {
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
// 3. Handle "Reset Password" Form (Sending Email)
// ==========================================
const resetForm = document.getElementById('resetForm');

if (resetForm) {
    resetForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const email = document.getElementById('email').value.trim();

        if (!email) {
            showAlert('Please enter your email.');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showAlert('Please enter a valid email address.');
            return;
        }

        try {
            // Connect to NodeJS Backend Endpoint
            const response = await fetch('http://localhost:3000/api/forgot-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });

            const data = await response.json();

            if (response.ok) {
                showAlert('Email verified! Redirecting to change password...');
                
                // Redirect to the Change Password page after 2 seconds
                setTimeout(() => {
                    // Note: Change 'change-password.html' to whatever you named your second HTML file!
                    window.location.href = 'change_password.html';
                }, 2000);
                
            } else {
                showAlert(data.message || 'Failed to send reset link.');
            }

        } catch (error) {
            console.error('Network error:', error);
            showAlert('An error occurred while sending the reset link.');
        }
    });
}


// ==========================================
// 4. Handle "Change Password" Form (New Password)
// ==========================================
const changePasswordForm = document.getElementById('changePasswordForm');

if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async function(event) {
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

        try {
            

            // Connect to NodeJS Backend Endpoint
            const response = await fetch('http://localhost:3000/api/update-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    newPassword: newPassword,
                    confirmPassword: confirmPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                showAlert('Password updated successfully! Redirecting to login...');
                
                // Redirect back to login page after 2 seconds
                setTimeout(() => {
                    window.location.href = '../login/login.html';
                }, 2000);
            } else {
                showAlert(data.message || 'Failed to update password.');
            }

        } catch (error) {
            console.error('Network error:', error);
            showAlert('An error occurred while updating the password.');
        }
    });
}