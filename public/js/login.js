/**
 * login.js — Login page logic
 * Submits credentials to POST /api/login and redirects on success.
 */
'use strict';

(function () {
  const form          = document.getElementById('login-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const errorEl       = document.getElementById('login-error');
  const btnLogin      = document.getElementById('btn-login');
  const btnLabel      = document.getElementById('btn-login-label');
  const btnSpinner    = document.getElementById('btn-login-spinner');
  const btnShowPwd    = document.getElementById('btn-show-password');

  // Show inactivity message if redirected here after timeout
  const params = new URLSearchParams(window.location.search);
  if (params.get('reason') === 'inactivity') {
    showError('You were signed out after 3 hours of inactivity.');
  }

  const EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const EYE_SLASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

  // Prevent input blur when clicking eye button
  btnShowPwd.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });

  // Toggle password visibility
  btnShowPwd.addEventListener('click', (e) => {
    e.preventDefault();
    const isPassword = passwordInput.type === 'password';
    passwordInput.type     = isPassword ? 'text' : 'password';
    btnShowPwd.innerHTML   = isPassword ? EYE_SLASH_SVG : EYE_SVG;
    btnShowPwd.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    passwordInput.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError('Please enter your username and password.');
      return;
    }

    setLoading(true);

    try {
      const res  = await fetch('/api/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        // Redirect to the main app
        window.location.href = '/';
      } else {
        showError(data.error || 'Login failed. Please try again.');
      }
    } catch {
      showError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(loading) {
    btnLogin.disabled         = loading;
    btnLabel.textContent      = loading ? 'Signing in…' : 'Enter';
    btnSpinner.classList.toggle('hidden', !loading);
  }

  function showError(msg) {
    errorEl.textContent = msg;
  }

  function clearError() {
    errorEl.textContent = '';
  }
})();
