/* ==========================================================================\n   Login controller\n   ========================================================================== */

const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('error');
const loginSubmit = document.getElementById('submit');
const passwordInput = document.getElementById('password');
const passwordToggle = document.getElementById('passwordToggle');

function showLoginError(message) {
  loginError.textContent = message;
  loginError.style.display = 'block';
}

function setLoginLoading(isLoading) {
  loginSubmit.disabled = isLoading;
  loginSubmit.innerHTML = isLoading
    ? 'SIGNING IN... <i class="fa-solid fa-spinner fa-spin"></i>'
    : 'SIGN IN <i class="fa-solid fa-arrow-right"></i>';
}

passwordToggle?.addEventListener('click', () => {
  if (!passwordInput) return;
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  passwordToggle.innerHTML = isPassword
    ? '<i class="fa-regular fa-eye-slash"></i>'
    : '<i class="fa-regular fa-eye"></i>';
  passwordToggle.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
});

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  loginError.style.display = 'none';
  setLoginLoading(true);

  try {
    const response = await fetch(await apiUrl('login.php'), {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        username: document.getElementById('username').value.trim(),
        password: passwordInput.value,
      }),
    });

    const rawResponse = await response.text();
    let data;

    try {
      data = JSON.parse(rawResponse);
    } catch {
      throw new Error('Server returned an invalid response. Check the PHP/API configuration.');
    }

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Login failed.');
    }

    // The server determines the destination from the authenticated role.
    // A requested redirect is allowed only for the Bystander SOS entry point
    // and only when the account itself is a Bystander.
    const role = String(data.user?.role || '')
      .trim()
      .toLowerCase();
    const serverRedirect = String(data.redirect || '').trim();

    if (role === 'bystander') {
      window.location.replace('./bystander-sos.html');
    } else if (role === 'responder') {
      window.location.replace('responder.html');
    } else if (role === 'super admin' || role === 'administrator') {
      window.location.replace('index.html');
    } else if (serverRedirect) {
      window.location.replace(serverRedirect);
    } else {
      throw new Error('Your account role is not configured for this system.');
    }
  } catch (error) {
    showLoginError(error.message);
    setLoginLoading(false);
  }
});
