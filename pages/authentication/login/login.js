const loginForm = document.getElementById('loginForm');

// Custom alert function (inspired by your reference code)
function showAlert(message) {
  const alertBox = document.createElement("div");
  alertBox.className = "custom-alert";
  alertBox.textContent = message;

  // Style the alert box to match your project's theme
  alertBox.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background-color: #525EA7; /* Your --indigo color */
    color: white;
    padding: 12px 24px;
    border-radius: 30px; /* Matches your button styling */
    z-index: 1000;
    font-family: 'Poppins', sans-serif; 
    font-size: 1em;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  `;

  document.body.appendChild(alertBox);

  // Remove the alert after 3 seconds
  setTimeout(() => {
    document.body.removeChild(alertBox);
  }, 3000);
}

// Login form submission
loginForm.addEventListener('submit', async function(event) {
    // 1. Prevent the form from refreshing the page
    event.preventDefault();

    // 2. Get the values the user typed in
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // 3. Error catching (Validation)
    if (email === '' || password === '') {
        showAlert('Please fill out both email and password.');
        return; 
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showAlert('Please enter a valid email address.');
        return;
    }

    // 4. Send data to NodeJS Backend
    try {
        showAlert('Logging in...');

        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Success! NodeJS verified credentials with Supabase
            showAlert('Login successful! Redirecting...');
            
            // Optional: If your backend returns a JWT token, save it!
            // localStorage.setItem('token', data.token);
            
            // Redirect to your dashboard after 1.5 seconds
            setTimeout(() => {
                window.location.href = '../../dashboard/dashboard.html'; // Adjust path if needed
            }, 1500);
            
        } else {
            // If backend returns an error (e.g., wrong password or user not found)
            showAlert(data.message || 'Login failed. Please check your credentials.');
        }

    } catch (error) {
        console.error('Network error:', error);
        showAlert('Network error. Is your NodeJS server running?');
    }
});

// Toggle Password Visibility
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