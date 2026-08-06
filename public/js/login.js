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

  // Toggle password visibility
  btnShowPwd.addEventListener('click', () => {
    const isText = passwordInput.type === 'text';
    passwordInput.type     = isText ? 'password' : 'text';
    btnShowPwd.textContent = isText ? '👁' : '🔒';
    btnShowPwd.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
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
