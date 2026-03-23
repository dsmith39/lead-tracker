/* global fetch, L */
'use strict';

const API = '/api/leads';
const DEFAULT_MAP_CENTER = [39.8283, -98.5795];
const DEFAULT_MAP_ZOOM = 4;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const tableBody       = document.getElementById('leads-table-body');
const emptyRow        = document.getElementById('empty-row');
const statsBar        = document.getElementById('stats-bar');
const searchInput     = document.getElementById('search-input');
const statusFilter    = document.getElementById('status-filter');
const mapSearchForm   = document.getElementById('map-search-form');
const mapSearchInput  = document.getElementById('map-search-input');
const currentLocationButton = document.getElementById('btn-current-location');
const mapAddModeButton = document.getElementById('btn-map-add-mode');
const mapSelectionStatus = document.getElementById('map-selection-status');
const mapSearchFeedback = document.getElementById('map-search-feedback');

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
let leadMap = null;
let mapMarkersLayer = null;
let leadsCache = [];
let mapAddModeEnabled = false;
let searchMarker = null;
let locatingUser = false;

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

function hasCoordinates(lead) {
  return Number.isFinite(lead?.location?.lat) && Number.isFinite(lead?.location?.lng);
}

function formatCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return mapAddModeEnabled ? 'Add mode armed: click the map' : 'Map browsing mode';
  return `Selected: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function getCoordinateInputValue(input) {
  if (input.value === '') {
    return Number.NaN;
  }

  return Number(input.value);
}

function updateMapSelectionStatus(lat, lng) {
  mapSelectionStatus.textContent = formatCoordinates(lat, lng);
}

function setMapSearchFeedback(message) {
  mapSearchFeedback.textContent = message;
}

function setCurrentLocationButtonState(isLoading) {
  locatingUser = isLoading;
  currentLocationButton.classList.toggle('btn-loading', isLoading);
  currentLocationButton.textContent = isLoading ? 'Locating...' : 'My Location';
}

function syncMapAddModeUi() {
  mapAddModeButton.classList.toggle('btn-map-active', mapAddModeEnabled);
  mapAddModeButton.textContent = mapAddModeEnabled ? 'Cancel Map Add' : 'Add Lead on Map';
  if (!Number.isFinite(getCoordinateInputValue(latInput)) || !Number.isFinite(getCoordinateInputValue(lngInput))) {
    updateMapSelectionStatus(Number.NaN, Number.NaN);
  }
}

function setMapAddMode(enabled) {
  mapAddModeEnabled = enabled;
  syncMapAddModeUi();
}

function renderSearchMarker(result) {
  if (!leadMap) return;

  if (searchMarker) {
    leadMap.removeLayer(searchMarker);
  }

  searchMarker = L.marker([result.lat, result.lng], { opacity: 0.85 })
    .addTo(leadMap)
    .bindPopup(`<div class="map-popup"><strong>Search Result</strong><p>${escHtml(result.displayName)}</p></div>`);
}

function focusMapOnSearchResult(result) {
  if (!leadMap) return;

  if (Array.isArray(result.boundingBox) && result.boundingBox.length === 4 && result.boundingBox.every(Number.isFinite)) {
    const bounds = L.latLngBounds(
      [result.boundingBox[0], result.boundingBox[2]],
      [result.boundingBox[1], result.boundingBox[3]]
    );
    leadMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  } else {
    leadMap.flyTo([result.lat, result.lng], 16, { duration: 0.8 });
  }

  renderSearchMarker(result);
  setMapSearchFeedback(`Centered on: ${result.displayName}`);
}

function focusMapOnCurrentLocation(lat, lng) {
  if (!leadMap) return;

  if (searchMarker) {
    leadMap.removeLayer(searchMarker);
  }

  searchMarker = L.marker([lat, lng], { opacity: 0.9 })
    .addTo(leadMap)
    .bindPopup('<div class="map-popup"><strong>Your Location</strong><p>Map centered on your current position.</p></div>');

  leadMap.setView([lat, lng], 16);
  setMapSearchFeedback(`Centered on your location: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
}

async function reverseGeocodeCoordinates(lat, lng) {
  try {
    const result = await apiFetch(`/api/geocode/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`);
    if (result.displayName) {
      setMapSearchFeedback(`Address found: ${result.displayName}`);
    }
    return result.address || {};
  } catch (error) {
    setMapSearchFeedback('Address lookup unavailable. You can still enter the address manually.');
    return {};
  }
}

function setMapFieldValues(lat, lng) {
  latInput.value = Number(lat).toFixed(6);
  lngInput.value = Number(lng).toFixed(6);
  updateMapSelectionStatus(Number(lat), Number(lng));
}

function mapPopupHtml(lead) {
  return `
    <div class="map-popup">
      <strong>${escHtml(lead.name || 'Unnamed Lead')}</strong>
      <p>${escHtml(addressLine(lead.address))}</p>
      <button class="btn btn-primary" type="button" data-map-edit-id="${lead._id}">Edit Lead</button>
    </div>`;
}

function savedLeadMarkerIcon(status) {
  const statusClass = String(status || 'not-visited').replace(/[^a-z0-9-]/gi, '');
  return L.divIcon({
    className: 'saved-lead-marker-wrapper',
    html: `<span class="saved-lead-marker saved-lead-marker-${statusClass}" title="Saved lead location" aria-label="Saved lead location">●</span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function fitMapToLeads(leads) {
  const leadsWithCoordinates = leads.filter(hasCoordinates);
  if (!leadMap || leadsWithCoordinates.length === 0) {
    return;
  }

  if (leadsWithCoordinates.length === 1) {
    leadMap.setView([leadsWithCoordinates[0].location.lat, leadsWithCoordinates[0].location.lng], 15);
    return;
  }

  const bounds = L.latLngBounds(
    leadsWithCoordinates.map((lead) => [lead.location.lat, lead.location.lng])
  );
  leadMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
}

function renderMapMarkers(leads) {
  if (!leadMap || !mapMarkersLayer) return;

  mapMarkersLayer.clearLayers();

  leads
    .filter(hasCoordinates)
    .forEach((lead) => {
      const marker = L.marker([lead.location.lat, lead.location.lng], {
        icon: savedLeadMarkerIcon(lead.status),
      });
      marker.bindPopup(mapPopupHtml(lead));
      marker.on('click', async () => {
        const freshLead = await apiFetch(`${API}/${lead._id}`);
        openModal(freshLead);
      });
      mapMarkersLayer.addLayer(marker);
    });
}

function initializeMap() {
  if (leadMap || typeof L === 'undefined') return;

  leadMap = L.map('lead-map', {
    zoomControl: true,
    attributionControl: true,
  }).setView(DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM);

  window.__leadTrackerMap = leadMap;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(leadMap);

  mapMarkersLayer = L.layerGroup().addTo(leadMap);

  leadMap.on('click', async (event) => {
    if (!mapAddModeEnabled) {
      return;
    }

    const { lat, lng } = event.latlng;
    setMapAddMode(false);
    setMapSearchFeedback('Looking up address for selected map point...');
    const resolvedAddress = await reverseGeocodeCoordinates(lat, lng);

    openModal({
      address: resolvedAddress,
      location: { lat, lng },
      homeType: 'other',
      status: 'not-visited',
      knockCount: 0,
    });
  });
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
  leadsCache = leads;

  // Clear existing rows (keep emptyRow in DOM for reference)
  tableBody.querySelectorAll('tr:not(#empty-row)').forEach(r => r.remove());

  if (leads.length === 0) {
    emptyRow.classList.remove('hidden');
  } else {
    emptyRow.classList.add('hidden');
    leads.forEach(lead => tableBody.appendChild(renderRow(lead)));
  }

  renderStats(leads);
  renderMapMarkers(leads);

  if (search || status !== 'all') {
    fitMapToLeads(leads);
  }
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(lead = null) {
  leadForm.reset();
  hideFormError();

  if (lead) {
    const isEditing = Boolean(lead._id);
    modalTitle.textContent = isEditing ? 'Edit Lead' : 'Add Lead from Map';
    leadIdInput.value     = lead._id || '';
    nameInput.value       = lead.name || '';
    companyInput.value    = lead.company || '';
    emailInput.value      = lead.email || '';
    phoneInput.value      = lead.phone || '';
    statusInput.value     = lead.status || 'not-visited';
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
    updateMapSelectionStatus(Number(lead.location?.lat), Number(lead.location?.lng));
  } else {
    modalTitle.textContent = 'Add Lead';
    leadIdInput.value = '';
    homeTypeInput.value = 'other';
    knockCountInput.value = '0';
    lastVisitInput.value = '';
    updateMapSelectionStatus(Number.NaN, Number.NaN);
  }

  modalOverlay.classList.remove('hidden');
  nameInput.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  updateMapSelectionStatus(getCoordinateInputValue(latInput), getCoordinateInputValue(lngInput));
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

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-map-edit-id]');
  if (!btn) return;
  const lead = await apiFetch(`${API}/${btn.dataset.mapEditId}`);
  openModal(lead);
});

// ── Toolbar event listeners ───────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadLeads, 300);
});

statusFilter.addEventListener('change', loadLeads);
latInput.addEventListener('input', () => updateMapSelectionStatus(getCoordinateInputValue(latInput), getCoordinateInputValue(lngInput)));
lngInput.addEventListener('input', () => updateMapSelectionStatus(getCoordinateInputValue(latInput), getCoordinateInputValue(lngInput)));
mapAddModeButton.addEventListener('click', () => {
  setMapAddMode(!mapAddModeEnabled);
});
mapSearchForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const query = mapSearchInput.value.trim();
  if (!query) {
    setMapSearchFeedback('Enter an address, city, ZIP, or neighborhood to jump the map.');
    return;
  }

  try {
    setMapSearchFeedback(`Searching for: ${query}`);
    const result = await apiFetch(`${'/api/geocode/search'}?q=${encodeURIComponent(query)}`);
    focusMapOnSearchResult(result);
  } catch (error) {
    setMapSearchFeedback(error.message);
  }
});
currentLocationButton.addEventListener('click', () => {
  if (locatingUser) {
    return;
  }

  if (!navigator.geolocation) {
    setMapSearchFeedback('Geolocation is not supported by this browser.');
    return;
  }

  setCurrentLocationButtonState(true);
  setMapSearchFeedback('Locating your current position...');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      focusMapOnCurrentLocation(latitude, longitude);
      setCurrentLocationButtonState(false);
    },
    (error) => {
      const message = error && error.code === 1
        ? 'Location access was denied.'
        : 'Unable to determine your current location.';
      setMapSearchFeedback(message);
      setCurrentLocationButtonState(false);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
});

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
initializeMap();
syncMapAddModeUi();
loadLeads();
