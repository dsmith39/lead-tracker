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
    'new':          'New',
    'contacted':    'Contacted',
    'qualified':    'Qualified',
    'proposal':     'Proposal',
    'closed-won':   'Closed Won',
    'closed-lost':  'Closed Lost',
  };
  return `<span class="badge badge-${status}">${labels[status] ?? status}</span>`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function renderRow(lead) {
  const tr = document.createElement('tr');
  tr.dataset.id = lead._id;
  tr.innerHTML = `
    <td><strong>${escHtml(lead.name)}</strong></td>
    <td>${escHtml(lead.company || '—')}</td>
    <td>${lead.email ? `<a href="mailto:${escHtml(lead.email)}">${escHtml(lead.email)}</a>` : '—'}</td>
    <td>${escHtml(lead.phone || '—')}</td>
    <td>${statusBadge(lead.status)}</td>
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
    { label: 'New',         value: counts['new'] || 0 },
    { label: 'In Progress', value: (counts['contacted'] || 0) + (counts['qualified'] || 0) + (counts['proposal'] || 0) },
    { label: 'Closed Won',  value: counts['closed-won'] || 0 },
    { label: 'Closed Lost', value: counts['closed-lost'] || 0 },
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
    notesInput.value      = lead.notes || '';
  } else {
    modalTitle.textContent = 'Add Lead';
    leadIdInput.value = '';
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
