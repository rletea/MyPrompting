/**
 * change-password.js — Change password page logic
 */
'use strict';

(function () {
  const form            = document.getElementById('change-form');
  const currentPwdInput = document.getElementById('current-password');
  const newPwdInput     = document.getElementById('new-password');
  const confirmPwdInput = document.getElementById('confirm-password');
  const errorEl         = document.getElementById('change-error');
  const successEl       = document.getElementById('change-success');
  const btnChange       = document.getElementById('btn-change');
  const btnLabel        = document.getElementById('btn-change-label');
  const btnSpinner      = document.getElementById('btn-change-spinner');
  const loggedInAs      = document.getElementById('logged-in-as');

  // Load current username from session
  fetch('/api/me')
    .then((r) => {
      if (!r.ok) {
        window.location.href = '/login.html';
        return null;
      }
      return r.json();
    })
    .then((data) => {
      if (data && data.username) {
        loggedInAs.textContent = `Signed in as ${data.username}`;
      }
    })
    .catch(() => {
      window.location.href = '/login.html';
    });

  const EYE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
  const EYE_SLASH_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

  // Prevent input blur when clicking eye button
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest('.btn-eye')) {
      e.preventDefault();
    }
  });

  // Toggle password visibility for all eye buttons (delegated listener)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-eye');
    if (!btn) return;
    e.preventDefault();
    const targetId = btn.getAttribute('data-target') || btn.dataset.target;
    const input    = document.getElementById(targetId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type       = isPassword ? 'text' : 'password';
    btn.innerHTML    = isPassword ? EYE_SLASH_SVG : EYE_SVG;
    btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
    input.focus();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();

    const currentPassword = currentPwdInput.value;
    const newPassword     = newPwdInput.value;
    const confirmPassword = confirmPwdInput.value;

    // Client-side validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      showError('All fields are required.');
      return;
    }
    if (newPassword.length < 6) {
      showError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showError('New password and confirmation do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      showError('New password must be different from the current password.');
      return;
    }

    setLoading(true);

    try {
      const res  = await fetch('/api/change-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        showSuccess(data.message || 'Password changed successfully.');
        form.reset();
      } else {
        showError(data.error || 'Failed to change password.');
      }
    } catch {
      showError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(loading) {
    btnChange.disabled         = loading;
    btnLabel.textContent       = loading ? 'Updating…' : 'Update Password';
    btnSpinner.classList.toggle('hidden', !loading);
  }

  function showError(msg) {
    errorEl.textContent   = msg;
    successEl.textContent = '';
  }

  function showSuccess(msg) {
    successEl.textContent = msg;
    errorEl.textContent   = '';
  }

  function clearMessages() {
    errorEl.textContent   = '';
    successEl.textContent = '';
  }
})();
