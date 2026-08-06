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
    .then((r) => r.json())
    .then((data) => {
      if (data.username) {
        loggedInAs.textContent = `Signed in as ${data.username}`;
      }
    })
    .catch(() => {
      // Not logged in → server will redirect, but handle gracefully
      window.location.href = '/login.html';
    });

  // Toggle password visibility for all eye buttons
  document.querySelectorAll('.btn-eye').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input    = document.getElementById(targetId);
      const isText   = input.type === 'text';
      input.type           = isText ? 'password' : 'text';
      btn.textContent      = isText ? '👁' : '🔒';
      btn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
    });
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
