const registerForm = document.getElementById('registerForm');

// Custom alert function (same as login.js)
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

// Handle form submission
registerForm.addEventListener('submit', async function(event) {
    event.preventDefault();

    // 1. Get the values from the form
    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // 2. Client-side validation
    if (!username || !email || !password || !confirmPassword) {
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

    // 3. Send data to NodeJS Backend
    try {
        showAlert('Creating your account...');


        const response = await fetch('http://localhost:3000/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                email: email,
                password: password
            })
        });

        const data = await response.json();

        if (response.ok) {

            showAlert('Registration successful! Redirecting to login...');
            
            // Redirect back to login page after 2 seconds
            setTimeout(() => {
                window.location.href = '../login/login.html';
            }, 2000);
        } else {
            // If backend returns an error (e.g., email already exists in Supabase)
            showAlert(data.message || 'Registration failed. Please try again.');
        }

    } catch (error) {
        console.error('Network error:', error);
    }
});



const togglePasswordButtons = document.querySelectorAll('.toggle-password');

togglePasswordButtons.forEach(button => {
    button.addEventListener('click', function() {
        // Find out which input this button controls
        const targetId = this.getAttribute('data-target');
        const passwordInput = document.getElementById(targetId);
        
        // Find the icons inside this specific button
        const eyeIcon = this.querySelector('.eye-icon');
        const eyeSlashIcon = this.querySelector('.eye-slash-icon');

        // Toggle the input type
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
