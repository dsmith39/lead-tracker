/* global fetch */
'use strict';

const API = '/api/leads';

// ── DOM refs ──────────────────────────────────────────────────────────────────
const tableBody       = document.getElementById('leads-table-body');
const emptyRow        = document.getElementById('empty-row');
const statsBar        = document.getElementById('stats-bar');
const searchInput     = document.getElementById('search-input');
const statusFilter    = document.getElementById('status-filter');

const modalOverlay    = document.getElementById('modal-overlay');
const modalTitle      = document.getElementById('modal-title');
const leadForm        = document.getElementById('lead-form');
const leadIdInput     = document.getElementById('lead-id');
const nameInput       = document.getElementById('input-name');
const companyInput    = document.getElementById('input-company');
const emailInput      = document.getElementById('input-email');
const phoneInput      = document.getElementById('input-phone');
const statusInput     = document.getElementById('input-status');
const homeTypeInput   = document.getElementById('input-home-type');
const knockCountInput = document.getElementById('input-knock-count');
const lastVisitInput  = document.getElementById('input-last-visit');
const streetInput     = document.getElementById('input-address-street');
const cityInput       = document.getElementById('input-address-city');
const stateInput      = document.getElementById('input-address-state');
const postalInput     = document.getElementById('input-address-postal');
const countryInput    = document.getElementById('input-address-country');
const latInput        = document.getElementById('input-lat');
const lngInput        = document.getElementById('input-lng');
const notesInput      = document.getElementById('input-notes');
const formError       = document.getElementById('form-error');

const confirmOverlay  = document.getElementById('confirm-overlay');
const btnConfirmDel   = document.getElementById('btn-confirm-delete');

// ── State ─────────────────────────────────────────────────────────────────────
let pendingDeleteId = null;
let debounceTimer   = null;

// ── Fetch helpers ─────────────────────────────────────────────────────────────
async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Render ────────────────────────────────────────────────────────────────────
function statusBadge(status) {
  const labels = {
    'not-visited':       'Not Visited',
    'no-answer':         'No Answer',
    'spoke-to-owner':    'Spoke To Owner',
    'not-interested':    'Not Interested',
    'callback-requested': 'Callback Requested',
    'sale-closed':       'Sale Closed',
  };
  return `<span class="badge badge-${status}">${labels[status] ?? status}</span>`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function toDateTimeLocalValue(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function addressLine(address = {}) {
  const parts = [address.street, address.city, address.state, address.postalCode, address.country]
    .filter(Boolean)
    .map((value) => value.trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

function formatHomeType(homeType) {
  if (!homeType) return '—';
  return homeType
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderRow(lead) {
  const tr = document.createElement('tr');
  tr.dataset.id = lead._id;
  tr.innerHTML = `
    <td><strong>${escHtml(lead.name)}</strong></td>
    <td>${escHtml(addressLine(lead.address))}</td>
    <td>${escHtml(formatHomeType(lead.homeType))}</td>
    <td>${escHtml(lead.company || '—')}</td>
    <td>${lead.email ? `<a href="mailto:${escHtml(lead.email)}">${escHtml(lead.email)}</a>` : '—'}</td>
    <td>${escHtml(lead.phone || '—')}</td>
    <td>${statusBadge(lead.status)}</td>
    <td>${lead.knockCount ?? 0}</td>
    <td>${formatDateTime(lead.lastVisitAt)}</td>
    <td>${formatDate(lead.createdAt)}</td>
    <td>
      <div class="action-btns">
        <button class="btn-icon-sm btn-edit"   data-id="${lead._id}">Edit</button>
        <button class="btn-icon-sm btn-delete" data-id="${lead._id}">Delete</button>
      </div>
    </td>`;
  return tr;
}

function renderStats(leads) {
  const counts = leads.reduce((acc, l) => {
    acc[l.status] = (acc[l.status] || 0) + 1;
    return acc;
  }, {});

  const items = [
    { label: 'Total',       value: leads.length },
    { label: 'Not Visited', value: counts['not-visited'] || 0 },
    { label: 'No Answer', value: counts['no-answer'] || 0 },
    { label: 'Callback Requested', value: counts['callback-requested'] || 0 },
    { label: 'Sale Closed', value: counts['sale-closed'] || 0 },
  ];

  statsBar.innerHTML = items
    .map(i => `<div class="stat-pill"><strong>${i.value}</strong> ${i.label}</div>`)
    .join('');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Load leads ────────────────────────────────────────────────────────────────
async function loadLeads() {
  const params = new URLSearchParams();
  const search = searchInput.value.trim();
  const status = statusFilter.value;
  if (search) params.set('search', search);
  if (status !== 'all') params.set('status', status);

  const leads = await apiFetch(`${API}?${params}`);

  // Clear existing rows (keep emptyRow in DOM for reference)
  tableBody.querySelectorAll('tr:not(#empty-row)').forEach(r => r.remove());

  if (leads.length === 0) {
    emptyRow.classList.remove('hidden');
  } else {
    emptyRow.classList.add('hidden');
    leads.forEach(lead => tableBody.appendChild(renderRow(lead)));
  }

  renderStats(leads);
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(lead = null) {
  leadForm.reset();
  hideFormError();

  if (lead) {
    modalTitle.textContent = 'Edit Lead';
    leadIdInput.value     = lead._id;
    nameInput.value       = lead.name;
    companyInput.value    = lead.company || '';
    emailInput.value      = lead.email || '';
    phoneInput.value      = lead.phone || '';
    statusInput.value     = lead.status;
    homeTypeInput.value   = lead.homeType || 'other';
    knockCountInput.value = lead.knockCount ?? 0;
    lastVisitInput.value  = toDateTimeLocalValue(lead.lastVisitAt);
    streetInput.value     = lead.address?.street || '';
    cityInput.value       = lead.address?.city || '';
    stateInput.value      = lead.address?.state || '';
    postalInput.value     = lead.address?.postalCode || '';
    countryInput.value    = lead.address?.country || '';
    latInput.value        = lead.location?.lat ?? '';
    lngInput.value        = lead.location?.lng ?? '';
    notesInput.value      = lead.notes || '';
  } else {
    modalTitle.textContent = 'Add Lead';
    leadIdInput.value = '';
    homeTypeInput.value = 'other';
    knockCountInput.value = '0';
    lastVisitInput.value = '';
  }

  modalOverlay.classList.remove('hidden');
  nameInput.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
}

function showFormError(msg) {
  formError.textContent = msg;
  formError.classList.remove('hidden');
}

function hideFormError() {
  formError.textContent = '';
  formError.classList.add('hidden');
}

// ── Form submit ───────────────────────────────────────────────────────────────
leadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideFormError();

  const payload = {
    name:    nameInput.value.trim(),
    company: companyInput.value.trim(),
    email:   emailInput.value.trim(),
    phone:   phoneInput.value.trim(),
    status:  statusInput.value,
    homeType: homeTypeInput.value,
    knockCount: Number(knockCountInput.value || 0),
    lastVisitAt: lastVisitInput.value ? new Date(lastVisitInput.value).toISOString() : null,
    address: {
      street: streetInput.value.trim(),
      city: cityInput.value.trim(),
      state: stateInput.value.trim(),
      postalCode: postalInput.value.trim(),
      country: countryInput.value.trim(),
    },
    location: {
      lat: latInput.value === '' ? null : Number(latInput.value),
      lng: lngInput.value === '' ? null : Number(lngInput.value),
    },
    notes:   notesInput.value.trim(),
  };

  const id = leadIdInput.value;

  try {
    if (id) {
      await apiFetch(`${API}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch(API, { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal();
    loadLeads();
  } catch (err) {
    showFormError(err.message);
  }
});

// ── Delete flow ───────────────────────────────────────────────────────────────
function openConfirm(id) {
  pendingDeleteId = id;
  confirmOverlay.classList.remove('hidden');
}

function closeConfirm() {
  pendingDeleteId = null;
  confirmOverlay.classList.add('hidden');
}

btnConfirmDel.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  try {
    await apiFetch(`${API}/${pendingDeleteId}`, { method: 'DELETE' });
    closeConfirm();
    loadLeads();
  } catch (err) {
    alert(err.message);
  }
});

// ── Event delegation for table buttons ───────────────────────────────────────
tableBody.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-id]');
  if (!btn) return;
  const id = btn.dataset.id;

  if (btn.classList.contains('btn-edit')) {
    const lead = await apiFetch(`${API}/${id}`);
    openModal(lead);
  } else if (btn.classList.contains('btn-delete')) {
    openConfirm(id);
  }
});

// ── Toolbar event listeners ───────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadLeads, 300);
});

statusFilter.addEventListener('change', loadLeads);

// ── Modal open/close wiring ───────────────────────────────────────────────────
document.getElementById('btn-open-modal').addEventListener('click', () => openModal());
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('btn-close-confirm').addEventListener('click', closeConfirm);
document.getElementById('btn-cancel-delete').addEventListener('click', closeConfirm);

// Close overlays on backdrop click
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) closeConfirm(); });

// ── Init ──────────────────────────────────────────────────────────────────────
loadLeads();
