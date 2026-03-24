'use strict';

const INVITATIONS_API = '/api/invitations';

const form = document.getElementById('accept-invite-form');
const tokenInput = document.getElementById('accept-token-input');
const displayNameInput = document.getElementById('accept-display-name-input');
const errorEl = document.getElementById('accept-invite-error');
const successEl = document.getElementById('accept-invite-success');

function showError(message) {
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function hideError() {
  errorEl.textContent = '';
  errorEl.classList.add('hidden');
}

function showSuccess(message) {
  successEl.textContent = message;
  successEl.classList.remove('hidden');
}

function readTokenFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('token') || '').trim();
}

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();
  successEl.classList.add('hidden');

  const token = tokenInput.value.trim();
  if (!token) {
    showError('Invite token is required.');
    return;
  }

  try {
    const result = await apiFetch(`${INVITATIONS_API}/accept`, {
      method: 'POST',
      body: JSON.stringify({
        token,
        displayName: displayNameInput.value.trim(),
      }),
    });

    showSuccess(
      `Invite accepted for ${result.user.email}. Role: ${result.membership.role}. You can now open the main app.`
    );
    tokenInput.disabled = true;
    displayNameInput.disabled = true;
    form.querySelector('button[type="submit"]').disabled = true;
  } catch (error) {
    showError(error.message);
  }
});

const tokenFromQuery = readTokenFromQuery();
if (tokenFromQuery) {
  tokenInput.value = tokenFromQuery;
}
