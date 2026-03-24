/* global fetch, L */
'use strict';

const API = '/api/leads';
const TEAM_API = '/api/teams';
const REP_API = '/api/reps';
const SESSION_API = '/api/session';
const MEMBERS_API = '/api/members';
const INVITATIONS_API = '/api/invitations';
const DEFAULT_MAP_CENTER = [39.8283, -98.5795];
const DEFAULT_MAP_ZOOM = 4;

// DOM refs
const tableBody = document.getElementById('leads-table-body');
const emptyRow = document.getElementById('empty-row');
const statsBar = document.getElementById('stats-bar');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');

const teamForm = document.getElementById('team-form');
const teamNameInput = document.getElementById('team-name-input');
const teamNotesInput = document.getElementById('team-notes-input');
const teamFormError = document.getElementById('team-form-error');
const teamDirectorySummary = document.getElementById('team-directory-summary');
const teamDirectoryList = document.getElementById('team-directory-list');

const repForm = document.getElementById('rep-form');
const repNameInput = document.getElementById('rep-name-input');
const repEmailInput = document.getElementById('rep-email-input');
const repPhoneInput = document.getElementById('rep-phone-input');
const repTeamSelect = document.getElementById('rep-team-select');
const repFormError = document.getElementById('rep-form-error');
const repDirectorySummary = document.getElementById('rep-directory-summary');
const repDirectoryList = document.getElementById('rep-directory-list');
const memberInvitesPanel = document.getElementById('member-invites-panel');
const memberInviteForm = document.getElementById('member-invite-form');
const inviteEmailInput = document.getElementById('invite-email-input');
const inviteRoleSelect = document.getElementById('invite-role-select');
const memberInviteFormError = document.getElementById('member-invite-form-error');
const memberInviteFeedback = document.getElementById('member-invite-feedback');
const pendingInvitesSummary = document.getElementById('pending-invites-summary');
const pendingInvitesList = document.getElementById('pending-invites-list');

const plannerTeamSelect = document.getElementById('route-team-select');
const plannerRepSelect = document.getElementById('route-rep-select');
const plannerDateInput = document.getElementById('route-date-input');
const turfGroupsSummary = document.getElementById('turf-groups-summary');
const turfGroupsList = document.getElementById('turf-groups-list');
const routePlanSummary = document.getElementById('route-plan-summary');
const routeStopsList = document.getElementById('route-stops-list');

const mapSearchForm = document.getElementById('map-search-form');
const mapSearchInput = document.getElementById('map-search-input');
const currentLocationButton = document.getElementById('btn-current-location');
const mapAddModeButton = document.getElementById('btn-map-add-mode');
const mapSelectionStatus = document.getElementById('map-selection-status');
const mapSearchFeedback = document.getElementById('map-search-feedback');

const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const leadForm = document.getElementById('lead-form');
const leadIdInput = document.getElementById('lead-id');
const nameInput = document.getElementById('input-name');
const companyInput = document.getElementById('input-company');
const emailInput = document.getElementById('input-email');
const phoneInput = document.getElementById('input-phone');
const statusInput = document.getElementById('input-status');
const homeTypeInput = document.getElementById('input-home-type');
const turfTypeInput = document.getElementById('input-turf-type');
const turfLabelInput = document.getElementById('input-turf-label');
const assignedTeamInput = document.getElementById('input-assigned-team');
const assignedRepInput = document.getElementById('input-assigned-rep');
const routeDateFieldInput = document.getElementById('input-route-date');
const knockCountInput = document.getElementById('input-knock-count');
const lastVisitInput = document.getElementById('input-last-visit');
const streetInput = document.getElementById('input-address-street');
const cityInput = document.getElementById('input-address-city');
const stateInput = document.getElementById('input-address-state');
const postalInput = document.getElementById('input-address-postal');
const countryInput = document.getElementById('input-address-country');
const latInput = document.getElementById('input-lat');
const lngInput = document.getElementById('input-lng');
const notesInput = document.getElementById('input-notes');
const formError = document.getElementById('form-error');
const leadFormLockHint = document.getElementById('lead-form-lock-hint');
const enableLeadEditButton = document.getElementById('btn-enable-lead-edit');

const visitLogSection = document.getElementById('visit-log-section');
const visitForm = document.getElementById('visit-form');
const visitOutcomeInput = document.getElementById('visit-outcome');
const visitDispositionReasonInput = document.getElementById('visit-disposition-reason');
const visitNextFollowUpInput = document.getElementById('visit-next-follow-up');
const visitNotesInput = document.getElementById('visit-notes');
const visitFormError = document.getElementById('visit-form-error');
const visitHistoryList = document.getElementById('visit-history-list');
const visitHistoryEmpty = document.getElementById('visit-history-empty');

const confirmOverlay = document.getElementById('confirm-overlay');
const btnConfirmDel = document.getElementById('btn-confirm-delete');

// State
let pendingDeleteId = null;
let debounceTimer = null;
let leadMap = null;
let mapMarkersLayer = null;
let leadsCache = [];
let teamsCache = [];
let repsCache = [];
let mapAddModeEnabled = false;
let searchMarker = null;
let locatingUser = false;
let visitHistory = [];
let leadDetailsEditable = true;
let editingRouteSnapshot = { repId: '', date: '', order: null };
let sessionContext = null;
let isManagerRole = true; // default true until session resolves
let pendingInvitesCache = [];

async function apiFetch(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showInlineError(element, message) {
  element.textContent = message;
  element.classList.remove('hidden');
}

function hideInlineError(element) {
  element.textContent = '';
  element.classList.add('hidden');
}

function statusBadge(status) {
  const labels = {
    'not-visited': 'Not Visited',
    'no-answer': 'No Answer',
    'spoke-to-owner': 'Spoke To Owner',
    'not-interested': 'Not Interested',
    'callback-requested': 'Callback Requested',
    'sale-closed': 'Sale Closed',
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

function formatTurfType(type) {
  const labels = {
    neighborhood: 'Neighborhood',
    zip: 'ZIP',
    grid: 'Grid',
  };
  return labels[type] || 'Turf';
}

function buildGridLabel(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  const latBucket = Math.floor((lat + 90) / 0.02);
  const lngBucket = Math.floor((lng + 180) / 0.02);
  return `Grid ${latBucket}-${lngBucket}`;
}

function turfLabel(lead) {
  const explicitLabel = String(lead?.turf?.label || '').trim();
  if (explicitLabel) return explicitLabel;

  const turfType = lead?.turf?.type || 'zip';
  if (turfType === 'zip') return String(lead?.address?.postalCode || '').trim();
  if (turfType === 'neighborhood') return String(lead?.address?.city || '').trim();
  return buildGridLabel(lead?.location?.lat, lead?.location?.lng);
}

function formatTurfArea(lead) {
  const label = turfLabel(lead);
  return label ? `${formatTurfType(lead?.turf?.type || 'zip')}: ${label}` : 'Unassigned Turf';
}

function assignedTeamName(lead) {
  return String(lead?.assignedTeamName || '').trim();
}

function assignedRepName(lead) {
  return String(lead?.assignedRep || '').trim();
}

function assignedRepId(lead) {
  return String(lead?.assignedRepId || '').trim();
}

function routeSummaryText(lead) {
  const repName = assignedRepName(lead);
  const routeDate = lead?.routePlan?.date || '';
  const routeOrder = lead?.routePlan?.order;
  const teamName = assignedTeamName(lead);

  if (!repName || !routeDate) {
    return 'Not on a route yet';
  }

  const parts = [repName];
  if (teamName) parts.push(teamName);
  parts.push(routeDate);
  parts.push(Number.isInteger(routeOrder) ? `Stop ${routeOrder}` : 'Unordered');
  return parts.join(' · ');
}

function formatTeamCell(lead) {
  const teamName = assignedTeamName(lead);
  if (!teamName) {
    return '—';
  }

  const repName = assignedRepName(lead);
  return `
    <div class="team-cell">
      <strong>${escHtml(teamName)}</strong>
      <div>${escHtml(repName || 'Team only')}</div>
    </div>`;
}

function formatRoutePlan(lead) {
  const repName = assignedRepName(lead);
  const routeDate = lead?.routePlan?.date || '';
  const routeOrder = lead?.routePlan?.order;
  const teamName = assignedTeamName(lead);

  if (!repName || !routeDate) {
    return '—';
  }

  return `
    <div class="route-plan-cell">
      <strong>${escHtml(repName)}</strong>
      <div>${escHtml(teamName || 'No team')}</div>
      <div>${escHtml(routeDate)}</div>
      <div>${escHtml(Number.isInteger(routeOrder) ? `Stop ${routeOrder}` : 'Unordered')}</div>
    </div>`;
}

function hasCoordinates(lead) {
  return Number.isFinite(lead?.location?.lat) && Number.isFinite(lead?.location?.lng);
}

function formatCoordinates(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return mapAddModeEnabled ? 'Add mode armed: click the map' : 'Map browsing mode';
  }
  return `Selected: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

function getCoordinateInputValue(input) {
  return input.value === '' ? Number.NaN : Number(input.value);
}

function updateMapSelectionStatus(lat, lng) {
  mapSelectionStatus.textContent = formatCoordinates(lat, lng);
}

function setMapSearchFeedback(message) {
  mapSearchFeedback.textContent = message;
}

function showVisitFormError(message) {
  showInlineError(visitFormError, message);
}

function hideVisitFormError() {
  hideInlineError(visitFormError);
}

function showFormError(message) {
  showInlineError(formError, message);
}

function hideFormError() {
  hideInlineError(formError);
}

function setCurrentLocationButtonState(isLoading) {
  locatingUser = isLoading;
  currentLocationButton.classList.toggle('btn-loading', isLoading);
  currentLocationButton.textContent = isLoading ? 'Locating...' : 'My Location';
}

function selectedPlannerTeamId() {
  return plannerTeamSelect.value;
}

function selectedPlannerRepId() {
  return plannerRepSelect.value;
}

function selectedPlannerRep() {
  return repsCache.find((rep) => rep._id === selectedPlannerRepId()) || null;
}

function selectedLeadTeamId() {
  return assignedTeamInput.value;
}

function selectedLeadRepId() {
  return assignedRepInput.value;
}

function selectedLeadRep() {
  return repsCache.find((rep) => rep._id === selectedLeadRepId()) || null;
}

function selectedPlannerDate() {
  return plannerDateInput.value;
}

function hasPlannerSelection() {
  return Boolean(selectedPlannerRep() && selectedPlannerDate());
}

function isLeadOnSelectedRoute(lead) {
  const rep = selectedPlannerRep();
  if (!rep || !selectedPlannerDate()) {
    return false;
  }

  return Boolean(
    lead.routePlan?.date === selectedPlannerDate()
    && ((assignedRepId(lead) && assignedRepId(lead) === rep._id) || assignedRepName(lead) === rep.name)
  );
}

function routeStopsForSelection(leads) {
  return leads
    .filter(isLeadOnSelectedRoute)
    .sort((left, right) => {
      const leftOrder = Number.isInteger(left.routePlan?.order) ? left.routePlan.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isInteger(right.routePlan?.order) ? right.routePlan.order : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return String(left.name || '').localeCompare(String(right.name || ''));
    });
}

function groupedTurfAreas(leads) {
  const groups = new Map();

  leads.forEach((lead) => {
    const type = lead?.turf?.type || 'zip';
    const label = turfLabel(lead) || 'Unassigned Turf';
    const key = `${type}:${label}`;

    if (!groups.has(key)) {
      groups.set(key, { type, label, leads: [] });
    }

    groups.get(key).leads.push(lead);
  });

  return Array.from(groups.values())
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((group) => ({
      ...group,
      leads: group.leads.sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''))),
    }));
}

function setSelectOptions(select, items, blankLabel) {
  const previousValue = select.value;
  const options = [];

  if (blankLabel !== null) {
    options.push(`<option value="">${escHtml(blankLabel)}</option>`);
  }

  items.forEach((item) => {
    options.push(`<option value="${escHtml(item.value)}">${escHtml(item.label)}</option>`);
  });

  select.innerHTML = options.join('');
  const hasPreviousValue = items.some((item) => item.value === previousValue);
  if (hasPreviousValue) {
    select.value = previousValue;
  }
}

function repsForTeam(teamId) {
  return repsCache.filter((rep) => !teamId || rep.teamId === teamId);
}

function syncRosterSelectors() {
  setSelectOptions(repTeamSelect, teamsCache.map((team) => ({ value: team._id, label: team.name })), 'No team');

  setSelectOptions(plannerTeamSelect, teamsCache.map((team) => ({ value: team._id, label: team.name })), 'All teams');
  const plannerTeamId = selectedPlannerTeamId();
  const plannerRepItems = repsForTeam(plannerTeamId).map((rep) => ({ value: rep._id, label: rep.name }));
  setSelectOptions(plannerRepSelect, plannerRepItems, 'Select rep');

  setSelectOptions(assignedTeamInput, teamsCache.map((team) => ({ value: team._id, label: team.name })), 'No team');
  const leadTeamId = selectedLeadTeamId();
  const leadRepItems = repsForTeam(leadTeamId).map((rep) => ({ value: rep._id, label: rep.name }));
  setSelectOptions(assignedRepInput, leadRepItems, 'No rep');
}

function renderRosterDirectory() {
  const teamCount = teamsCache.length;
  const repCount = repsCache.length;
  teamDirectorySummary.textContent = teamCount
    ? `${teamCount} team${teamCount === 1 ? '' : 's'} configured.`
    : 'No teams created yet.';
  repDirectorySummary.textContent = repCount
    ? `${repCount} active rep${repCount === 1 ? '' : 's'} ready for assignment.`
    : 'No reps created yet.';

  teamDirectoryList.innerHTML = '';
  if (!teamCount) {
    teamDirectoryList.innerHTML = '<p class="planner-empty-state">Create a team to start organizing the roster.</p>';
  } else {
    teamsCache.forEach((team) => {
      const memberCount = repsCache.filter((rep) => rep.teamId === team._id).length;
      const card = document.createElement('article');
      card.className = 'directory-card';
      card.innerHTML = `
        <div class="directory-card-title">${escHtml(team.name)}</div>
        <div class="directory-card-meta">${memberCount} rep${memberCount === 1 ? '' : 's'}</div>
        <div class="directory-card-meta">${escHtml(team.notes || 'No notes')}</div>`;
      teamDirectoryList.appendChild(card);
    });
  }

  repDirectoryList.innerHTML = '';
  if (!repCount) {
    repDirectoryList.innerHTML = '<p class="planner-empty-state">Add reps so routes can be assigned from the planner.</p>';
  } else {
    repsCache.forEach((rep) => {
      const card = document.createElement('article');
      card.className = 'directory-card';
      card.innerHTML = `
        <div class="directory-card-title">${escHtml(rep.name)}</div>
        <div class="directory-card-meta">${escHtml(rep.teamName || 'No team assigned')}</div>
        <div class="directory-card-meta">${escHtml(rep.email || 'No email')}</div>
        <div class="directory-card-meta">${escHtml(rep.phone || 'No phone')}</div>`;
      repDirectoryList.appendChild(card);
    });
  }
}

function showMemberInviteFeedback(message, isError = false) {
  memberInviteFeedback.textContent = message;
  memberInviteFeedback.classList.toggle('hidden', !message);
  memberInviteFeedback.classList.toggle('invite-feedback-error', isError);
}

function renderPendingInvites() {
  if (!pendingInvitesList || !pendingInvitesSummary) {
    return;
  }

  pendingInvitesSummary.textContent = pendingInvitesCache.length
    ? `${pendingInvitesCache.length} pending invite${pendingInvitesCache.length === 1 ? '' : 's'}.`
    : 'No pending invites.';

  pendingInvitesList.innerHTML = '';
  if (!pendingInvitesCache.length) {
    pendingInvitesList.innerHTML = '<p class="planner-empty-state">Create an invite to onboard a teammate.</p>';
    return;
  }

  pendingInvitesCache.forEach((invite) => {
    const card = document.createElement('article');
    card.className = 'directory-card';
    card.innerHTML = `
      <div class="directory-card-title">${escHtml(invite.email)}</div>
      <div class="directory-card-meta">Role: ${escHtml(invite.role)}</div>
      <div class="directory-card-meta">Expires: ${escHtml(formatDate(invite.expiresAt))}</div>`;
    pendingInvitesList.appendChild(card);
  });
}

async function loadPendingInvites() {
  if (!isManagerRole) {
    pendingInvitesCache = [];
    renderPendingInvites();
    return;
  }

  try {
    pendingInvitesCache = await apiFetch(`${MEMBERS_API}/invites`);
    renderPendingInvites();
  } catch {
    showMemberInviteFeedback('Failed to load invites.', true);
  }
}

function renderStats(leads) {
  const counts = leads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {});
  const routedCount = leads.filter((lead) => assignedRepName(lead) && lead.routePlan?.date).length;
  const turfCount = groupedTurfAreas(leads).length;

  const items = [
    { label: 'Total', value: leads.length },
    { label: 'Teams', value: teamsCache.length },
    { label: 'Active Reps', value: repsCache.length },
    { label: 'Turf Areas', value: turfCount },
    { label: 'On Route', value: routedCount },
    { label: 'Not Visited', value: counts['not-visited'] || 0 },
    { label: 'No Answer', value: counts['no-answer'] || 0 },
    { label: 'Callback Requested', value: counts['callback-requested'] || 0 },
    { label: 'Sale Closed', value: counts['sale-closed'] || 0 },
  ];

  statsBar.innerHTML = items
    .map((item) => `<div class="stat-pill"><strong>${item.value}</strong> ${item.label}</div>`)
    .join('');
}

function renderRoutePlanner(leads) {
  const turfGroups = groupedTurfAreas(leads);
  turfGroupsSummary.textContent = turfGroups.length
    ? `${turfGroups.length} turf areas across ${leads.length} visible leads.`
    : 'No visible leads to group right now.';

  turfGroupsList.innerHTML = '';
  if (!turfGroups.length) {
    turfGroupsList.innerHTML = '<p class="planner-empty-state">No leads match the current filters.</p>';
  } else {
    turfGroups.forEach((group) => {
      const card = document.createElement('article');
      card.className = 'turf-group-card';
      card.innerHTML = `
        <div class="turf-group-header">
          <div>
            <div class="turf-group-title">${escHtml(`${formatTurfType(group.type)}: ${group.label}`)}</div>
            <div class="turf-group-meta">${group.leads.length} lead${group.leads.length === 1 ? '' : 's'}</div>
          </div>
        </div>
        <ul class="planner-lead-list">
          ${group.leads.map((lead) => {
            const routeAction = !selectedPlannerRep()
              ? '<button type="button" class="btn btn-secondary" disabled>Select a rep</button>'
              : isLeadOnSelectedRoute(lead)
                ? `<button type="button" class="btn btn-secondary" data-route-remove-id="${lead._id}">Remove</button>`
                : `<button type="button" class="btn btn-primary" data-route-add-id="${lead._id}">Add to Route</button>`;

            return `
              <li class="planner-lead-row">
                <div>
                  <div class="planner-lead-name">${escHtml(lead.name || 'Unnamed Lead')}</div>
                  <div class="planner-lead-meta">${escHtml(addressLine(lead.address))}</div>
                  <div class="planner-lead-meta">${escHtml(routeSummaryText(lead))}</div>
                </div>
                <div class="planner-inline-actions">${routeAction}</div>
              </li>`;
          }).join('')}
        </ul>`;
      turfGroupsList.appendChild(card);
    });
  }

  const rep = selectedPlannerRep();
  const routeDate = selectedPlannerDate();
  const routeStops = routeStopsForSelection(leads);
  routeStopsList.innerHTML = '';

  if (!rep || !routeDate) {
    routePlanSummary.textContent = 'Select a rep and date, then add stops from the turf groups.';
    routeStopsList.innerHTML = '<li class="planner-empty-state">Manual ordering is enabled once a rep and route date are selected.</li>';
    return;
  }

  routePlanSummary.textContent = routeStops.length
    ? `${routeStops.length} stop${routeStops.length === 1 ? '' : 's'} for ${rep.name}${rep.teamName ? ` (${rep.teamName})` : ''} on ${routeDate}.`
    : `No stops assigned to ${rep.name} on ${routeDate} yet.`;

  if (!routeStops.length) {
    routeStopsList.innerHTML = '<li class="planner-empty-state">Add leads from the turf groups to build this rep\'s day.</li>';
    return;
  }

  routeStops.forEach((lead, index) => {
    const item = document.createElement('li');
    item.className = 'route-stop-card';
    item.innerHTML = `
      <div class="route-stop-header">
        <div>
          <div class="route-stop-title route-stop-name">${escHtml(lead.name || 'Unnamed Lead')}</div>
          <div class="route-stop-meta">${escHtml(addressLine(lead.address))}</div>
          <div class="route-stop-meta">${escHtml(formatTurfArea(lead))}</div>
        </div>
      </div>
      <div class="route-stop-actions">
        <button type="button" class="btn btn-secondary btn-route-move" data-route-move-up-id="${lead._id}" ${index === 0 ? 'disabled' : ''}>Up</button>
        <button type="button" class="btn btn-secondary btn-route-move" data-route-move-down-id="${lead._id}" ${index === routeStops.length - 1 ? 'disabled' : ''}>Down</button>
        <button type="button" class="btn btn-secondary" data-route-remove-id="${lead._id}">Remove</button>
      </div>`;
    routeStopsList.appendChild(item);
  });
}

async function loadRosterData() {
  const [teams, reps] = await Promise.all([
    apiFetch(TEAM_API),
    apiFetch(`${REP_API}?active=true`),
  ]);
  teamsCache = teams;
  repsCache = reps;
  syncRosterSelectors();
  renderRosterDirectory();
  await loadPendingInvites();
  renderStats(leadsCache);
  renderRoutePlanner(leadsCache);
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
    const bounds = L.latLngBounds([result.boundingBox[0], result.boundingBox[2]], [result.boundingBox[1], result.boundingBox[3]]);
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

function renderVisitHistory() {
  visitHistoryList.innerHTML = '';

  if (!visitHistory.length) {
    visitHistoryEmpty.classList.remove('hidden');
    return;
  }

  visitHistoryEmpty.classList.add('hidden');
  visitHistory.forEach((visit) => {
    const item = document.createElement('li');
    item.className = 'visit-history-item';
    item.innerHTML = `
      <div class="visit-history-top">
        ${statusBadge(visit.outcome)}
        <span class="visit-history-meta">${formatDateTime(visit.visitAt)}</span>
      </div>
      <div class="visit-history-meta">Disposition: ${escHtml(visit.dispositionReason || '—')}</div>
      <div class="visit-history-meta">Next Follow-up: ${formatDateTime(visit.nextFollowUpAt)}</div>
      <div class="visit-history-notes">${escHtml(visit.notes || 'No notes')}</div>`;
    visitHistoryList.appendChild(item);
  });
}

function setVisitSectionMode(isExistingLead) {
  visitLogSection.style.opacity = isExistingLead ? '1' : '0.55';
  visitForm.querySelectorAll('input, select, textarea, button').forEach((el) => {
    el.disabled = !isExistingLead;
  });

  if (!isExistingLead) {
    visitHistory = [];
    renderVisitHistory();
  }
}

function leadDetailControls() {
  return [
    nameInput,
    companyInput,
    emailInput,
    phoneInput,
    statusInput,
    homeTypeInput,
    turfTypeInput,
    turfLabelInput,
    assignedTeamInput,
    assignedRepInput,
    routeDateFieldInput,
    knockCountInput,
    lastVisitInput,
    streetInput,
    cityInput,
    stateInput,
    postalInput,
    countryInput,
    latInput,
    lngInput,
    notesInput,
  ];
}

function setLeadDetailsEditable(enabled, isExistingLead) {
  leadDetailsEditable = enabled;
  leadDetailControls().forEach((control) => {
    control.disabled = !enabled;
  });

  const saveLeadButton = leadForm.querySelector('button[type="submit"]');
  saveLeadButton.disabled = !enabled;
  saveLeadButton.classList.toggle('hidden', isExistingLead && !enabled);
  enableLeadEditButton.classList.toggle('hidden', !isExistingLead || enabled);
  leadFormLockHint.classList.toggle('hidden', !isExistingLead || enabled);
}

async function loadVisitHistory(leadId) {
  visitHistory = await apiFetch(`${API}/${leadId}/visits`);
  renderVisitHistory();
}

function mapPopupHtml(lead) {
  return `
    <div class="map-popup">
      <strong>${escHtml(lead.name || 'Unnamed Lead')}</strong>
      <p>${escHtml(addressLine(lead.address))}</p>
      <button class="btn btn-secondary" type="button" data-map-visit-id="${lead._id}">Quick Log Visit</button>
      <button class="btn btn-primary" type="button" data-map-edit-id="${lead._id}">Edit Lead</button>
    </div>`;
}

async function focusMapOnLeadAddress(lead) {
  if (hasCoordinates(lead)) {
    leadMap.setView([lead.location.lat, lead.location.lng], 17);
    setMapSearchFeedback(`Centered on lead: ${lead.name}`);
    return;
  }

  const query = addressLine(lead.address);
  if (!query || query === '—') {
    setMapSearchFeedback('This lead does not have a searchable address yet.');
    return;
  }

  try {
    setMapSearchFeedback(`Locating lead address: ${query}`);
    const result = await apiFetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
    focusMapOnSearchResult(result);
  } catch (error) {
    setMapSearchFeedback(error.message || 'Could not locate this lead address on the map.');
  }
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
  if (!leadMap || !leadsWithCoordinates.length) return;

  if (leadsWithCoordinates.length === 1) {
    leadMap.setView([leadsWithCoordinates[0].location.lat, leadsWithCoordinates[0].location.lng], 15);
    return;
  }

  const bounds = L.latLngBounds(leadsWithCoordinates.map((lead) => [lead.location.lat, lead.location.lng]));
  leadMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
}

function renderMapMarkers(leads) {
  if (!leadMap || !mapMarkersLayer) return;

  mapMarkersLayer.clearLayers();
  leads.filter(hasCoordinates).forEach((lead) => {
    const marker = L.marker([lead.location.lat, lead.location.lng], {
      icon: savedLeadMarkerIcon(lead.status),
    });
    marker.bindPopup(mapPopupHtml(lead));
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
    if (!mapAddModeEnabled) return;

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
  const renderedAddress = addressLine(lead.address);
  const addressCell = renderedAddress === '—'
    ? '—'
    : `<button type="button" class="address-link btn-zoom-address" data-id="${lead._id}" title="Zoom map to this lead">${escHtml(renderedAddress)}</button>`;

  tr.innerHTML = `
    <td><strong>${escHtml(lead.name)}</strong></td>
    <td>${addressCell}</td>
    <td>${escHtml(formatTurfArea(lead))}</td>
    <td>${formatTeamCell(lead)}</td>
    <td>${formatRoutePlan(lead)}</td>
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
        <button class="btn-icon-sm btn-edit" data-id="${lead._id}">Edit</button>
        <button class="btn-icon-sm btn-delete${isManagerRole ? '' : ' hidden'}" data-id="${lead._id}">Delete</button>
      </div>
    </td>`;
  return tr;
}

async function loadLeads() {
  const params = new URLSearchParams();
  const search = searchInput.value.trim();
  const status = statusFilter.value;
  if (search) params.set('search', search);
  if (status !== 'all') params.set('status', status);

  const leads = await apiFetch(`${API}?${params}`);
  leadsCache = leads;

  tableBody.querySelectorAll('tr:not(#empty-row)').forEach((row) => row.remove());

  if (!leads.length) {
    emptyRow.classList.remove('hidden');
  } else {
    emptyRow.classList.add('hidden');
    leads.forEach((lead) => tableBody.appendChild(renderRow(lead)));
  }

  renderStats(leads);
  renderRoutePlanner(leads);
  renderMapMarkers(leads);

  if (search || status !== 'all') {
    fitMapToLeads(leads);
  }
}

function applyLeadTeamFilter(preserveRepId = '') {
  const currentTeamId = selectedLeadTeamId();
  const items = repsForTeam(currentTeamId).map((rep) => ({ value: rep._id, label: rep.name }));
  setSelectOptions(assignedRepInput, items, 'No rep');
  if (preserveRepId && items.some((item) => item.value === preserveRepId)) {
    assignedRepInput.value = preserveRepId;
  }
}

function populateLeadAssignmentControls({ teamId = '', repId = '' }) {
  assignedTeamInput.value = teamId;
  applyLeadTeamFilter(repId);
  if (!assignedRepInput.value && repId) {
    assignedRepInput.value = repId;
  }
}

function openModal(lead = null) {
  leadForm.reset();
  hideFormError();
  const defaultPlannerRep = selectedPlannerRep();
  const defaultPlannerTeamId = defaultPlannerRep?.teamId || selectedPlannerTeamId();
  const defaultPlannerRepId = defaultPlannerRep?._id || '';
  const defaultPlannerDate = selectedPlannerDate();

  if (lead) {
    const isEditing = Boolean(lead._id);
    modalTitle.textContent = isEditing ? 'Edit Lead' : 'Add Lead from Map';
    leadIdInput.value = lead._id || '';
    nameInput.value = lead.name || '';
    companyInput.value = lead.company || '';
    emailInput.value = lead.email || '';
    phoneInput.value = lead.phone || '';
    statusInput.value = lead.status || 'not-visited';
    homeTypeInput.value = lead.homeType || 'other';
    turfTypeInput.value = lead.turf?.type || 'zip';
    turfLabelInput.value = turfLabel(lead);
    populateLeadAssignmentControls({
      teamId: lead.assignedTeamId || (!isEditing ? defaultPlannerTeamId : ''),
      repId: lead.assignedRepId || (!isEditing ? defaultPlannerRepId : ''),
    });
    routeDateFieldInput.value = lead.routePlan?.date || ((!isEditing && defaultPlannerRepId) ? defaultPlannerDate : '');
    knockCountInput.value = lead.knockCount ?? 0;
    lastVisitInput.value = toDateTimeLocalValue(lead.lastVisitAt);
    streetInput.value = lead.address?.street || '';
    cityInput.value = lead.address?.city || '';
    stateInput.value = lead.address?.state || '';
    postalInput.value = lead.address?.postalCode || '';
    countryInput.value = lead.address?.country || '';
    latInput.value = lead.location?.lat ?? '';
    lngInput.value = lead.location?.lng ?? '';
    notesInput.value = lead.notes || '';
    updateMapSelectionStatus(Number(lead.location?.lat), Number(lead.location?.lng));
    setVisitSectionMode(isEditing);
    setLeadDetailsEditable(!isEditing, isEditing);
    hideVisitFormError();
    editingRouteSnapshot = {
      repId: lead.assignedRepId || '',
      date: lead.routePlan?.date || '',
      order: Number.isInteger(lead.routePlan?.order) ? lead.routePlan.order : null,
    };

    if (isEditing) {
      loadVisitHistory(lead._id).catch(() => {
        visitHistory = [];
        renderVisitHistory();
      });
    }
  } else {
    modalTitle.textContent = 'Add Lead';
    leadIdInput.value = '';
    homeTypeInput.value = 'other';
    turfTypeInput.value = 'zip';
    turfLabelInput.value = '';
    populateLeadAssignmentControls({ teamId: defaultPlannerTeamId || '', repId: defaultPlannerRepId });
    routeDateFieldInput.value = defaultPlannerRepId ? defaultPlannerDate : '';
    knockCountInput.value = '0';
    lastVisitInput.value = '';
    updateMapSelectionStatus(Number.NaN, Number.NaN);
    setVisitSectionMode(false);
    setLeadDetailsEditable(true, false);
    hideVisitFormError();
    editingRouteSnapshot = { repId: '', date: '', order: null };
  }

  modalOverlay.classList.remove('hidden');
  nameInput.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  updateMapSelectionStatus(getCoordinateInputValue(latInput), getCoordinateInputValue(lngInput));
}

async function updateLeadRouteAssignment(leadId, assignment) {
  await apiFetch(`${API}/${leadId}/route-plan`, {
    method: 'PATCH',
    body: JSON.stringify(assignment),
  });
  await loadLeads();
}

async function savePlannerRouteOrder(orderedLeadIds) {
  const rep = selectedPlannerRep();
  if (!rep) return;

  await apiFetch(`${API}/route-plan/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({
      assignedTeamId: rep.teamId || '',
      assignedRepId: rep._id,
      routeDate: selectedPlannerDate(),
      orderedLeadIds,
    }),
  });
  await loadLeads();
}

leadForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideFormError();

  if (!leadDetailsEditable) {
    return;
  }

  const selectedRep = selectedLeadRep();
  const selectedTeamId = selectedRep?.teamId || selectedLeadTeamId() || '';

  if ((selectedRep && !routeDateFieldInput.value) || (!selectedRep && routeDateFieldInput.value)) {
    showFormError('Assigned rep and route date must both be set together.');
    return;
  }

  const preservedRouteOrder = selectedLeadRepId() === editingRouteSnapshot.repId && routeDateFieldInput.value === editingRouteSnapshot.date
    ? editingRouteSnapshot.order
    : null;

  const payload = {
    name: nameInput.value.trim(),
    company: companyInput.value.trim(),
    email: emailInput.value.trim(),
    phone: phoneInput.value.trim(),
    status: statusInput.value,
    homeType: homeTypeInput.value,
    turf: {
      type: turfTypeInput.value,
      label: turfLabelInput.value.trim(),
    },
    assignedTeamId: selectedTeamId || null,
    assignedRepId: selectedRep?._id || null,
    routePlan: {
      date: routeDateFieldInput.value || null,
      order: preservedRouteOrder,
    },
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
    notes: notesInput.value.trim(),
  };

  const id = leadIdInput.value;

  try {
    if (id) {
      await apiFetch(`${API}/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await apiFetch(API, { method: 'POST', body: JSON.stringify(payload) });
    }
    closeModal();
    await loadLeads();
  } catch (error) {
    showFormError(error.message);
  }
});

visitForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideVisitFormError();

  const leadId = leadIdInput.value;
  if (!leadId) {
    showVisitFormError('Save the lead first before adding visit history.');
    return;
  }

  try {
    const result = await apiFetch(`${API}/${leadId}/visits`, {
      method: 'POST',
      body: JSON.stringify({
        outcome: visitOutcomeInput.value,
        notes: visitNotesInput.value.trim(),
        dispositionReason: visitDispositionReasonInput.value.trim(),
        nextFollowUpAt: visitNextFollowUpInput.value ? new Date(visitNextFollowUpInput.value).toISOString() : null,
      }),
    });

    statusInput.value = result.lead.status;
    knockCountInput.value = String(result.lead.knockCount);
    lastVisitInput.value = toDateTimeLocalValue(result.lead.lastVisitAt);
    visitNotesInput.value = '';
    visitDispositionReasonInput.value = '';
    visitNextFollowUpInput.value = '';

    await loadVisitHistory(leadId);
    await loadLeads();
  } catch (error) {
    showVisitFormError(error.message);
  }
});

teamForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideInlineError(teamFormError);

  try {
    await apiFetch(TEAM_API, {
      method: 'POST',
      body: JSON.stringify({
        name: teamNameInput.value.trim(),
        notes: teamNotesInput.value.trim(),
      }),
    });
    teamForm.reset();
    await loadRosterData();
  } catch (error) {
    showInlineError(teamFormError, error.message);
  }
});

repForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideInlineError(repFormError);

  try {
    await apiFetch(REP_API, {
      method: 'POST',
      body: JSON.stringify({
        name: repNameInput.value.trim(),
        email: repEmailInput.value.trim(),
        phone: repPhoneInput.value.trim(),
        teamId: repTeamSelect.value || null,
      }),
    });
    repForm.reset();
    repTeamSelect.value = '';
    await loadRosterData();
  } catch (error) {
    showInlineError(repFormError, error.message);
  }
});

if (memberInviteForm) {
  memberInviteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideInlineError(memberInviteFormError);
    showMemberInviteFeedback('');

    if (!isManagerRole) {
      showInlineError(memberInviteFormError, 'You do not have permission to invite members.');
      return;
    }

    try {
      const result = await apiFetch(`${MEMBERS_API}/invites`, {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmailInput.value.trim(),
          role: inviteRoleSelect.value,
        }),
      });

      memberInviteForm.reset();
      inviteRoleSelect.value = 'canvasser';
      await loadPendingInvites();
      showMemberInviteFeedback(`Invite created: ${result.inviteUrl}`);
    } catch (error) {
      showInlineError(memberInviteFormError, error.message);
    }
  });
}

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
    await loadLeads();
  } catch (error) {
    alert(error.message);
  }
});

tableBody.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-id]');
  if (!button) return;
  const id = button.dataset.id;

  if (button.classList.contains('btn-zoom-address')) {
    const lead = leadsCache.find((item) => item._id === id) || await apiFetch(`${API}/${id}`);
    await focusMapOnLeadAddress(lead);
  } else if (button.classList.contains('btn-edit')) {
    const lead = await apiFetch(`${API}/${id}`);
    openModal(lead);
  } else if (button.classList.contains('btn-delete')) {
    openConfirm(id);
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-map-edit-id]');
  if (!button) return;
  const lead = await apiFetch(`${API}/${button.dataset.mapEditId}`);
  openModal(lead);
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-map-visit-id]');
  if (!button) return;
  const lead = await apiFetch(`${API}/${button.dataset.mapVisitId}`);
  openModal(lead);
  visitLogSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  visitOutcomeInput.focus();
});

turfGroupsList.addEventListener('click', async (event) => {
  const addButton = event.target.closest('[data-route-add-id]');
  const removeButton = event.target.closest('[data-route-remove-id]');
  if (!addButton && !removeButton) return;

  if (addButton) {
    const rep = selectedPlannerRep();
    if (!rep) return;
    await updateLeadRouteAssignment(addButton.dataset.routeAddId, {
      assignedTeamId: rep.teamId || '',
      assignedRepId: rep._id,
      routeDate: selectedPlannerDate(),
      routeOrder: null,
    });
    return;
  }

  const lead = leadsCache.find((item) => item._id === removeButton.dataset.routeRemoveId);
  await updateLeadRouteAssignment(removeButton.dataset.routeRemoveId, {
    assignedTeamId: lead?.assignedTeamId || '',
    assignedRepId: null,
    routeDate: '',
    routeOrder: null,
  });
});

routeStopsList.addEventListener('click', async (event) => {
  const moveUpButton = event.target.closest('[data-route-move-up-id]');
  const moveDownButton = event.target.closest('[data-route-move-down-id]');
  const removeButton = event.target.closest('[data-route-remove-id]');

  if (removeButton) {
    const lead = leadsCache.find((item) => item._id === removeButton.dataset.routeRemoveId);
    await updateLeadRouteAssignment(removeButton.dataset.routeRemoveId, {
      assignedTeamId: lead?.assignedTeamId || '',
      assignedRepId: null,
      routeDate: '',
      routeOrder: null,
    });
    return;
  }

  const routeStops = routeStopsForSelection(leadsCache);

  if (moveUpButton) {
    const currentIndex = routeStops.findIndex((lead) => lead._id === moveUpButton.dataset.routeMoveUpId);
    if (currentIndex > 0) {
      [routeStops[currentIndex - 1], routeStops[currentIndex]] = [routeStops[currentIndex], routeStops[currentIndex - 1]];
      await savePlannerRouteOrder(routeStops.map((lead) => lead._id));
    }
    return;
  }

  if (moveDownButton) {
    const currentIndex = routeStops.findIndex((lead) => lead._id === moveDownButton.dataset.routeMoveDownId);
    if (currentIndex > -1 && currentIndex < routeStops.length - 1) {
      [routeStops[currentIndex], routeStops[currentIndex + 1]] = [routeStops[currentIndex + 1], routeStops[currentIndex]];
      await savePlannerRouteOrder(routeStops.map((lead) => lead._id));
    }
  }
});

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadLeads, 300);
});

statusFilter.addEventListener('change', loadLeads);
plannerTeamSelect.addEventListener('change', () => {
  const currentRep = selectedPlannerRep();
  syncRosterSelectors();
  if (currentRep && currentRep.teamId === plannerTeamSelect.value) {
    plannerRepSelect.value = currentRep._id;
  }
  renderRoutePlanner(leadsCache);
});
plannerRepSelect.addEventListener('change', () => {
  const rep = selectedPlannerRep();
  if (rep?.teamId && plannerTeamSelect.value !== rep.teamId) {
    plannerTeamSelect.value = rep.teamId;
    syncRosterSelectors();
    plannerRepSelect.value = rep._id;
  }
  renderRoutePlanner(leadsCache);
});
plannerDateInput.addEventListener('change', () => renderRoutePlanner(leadsCache));
assignedTeamInput.addEventListener('change', () => applyLeadTeamFilter());
assignedRepInput.addEventListener('change', () => {
  const rep = selectedLeadRep();
  if (rep?.teamId && assignedTeamInput.value !== rep.teamId) {
    assignedTeamInput.value = rep.teamId;
    applyLeadTeamFilter(rep._id);
  }
});
latInput.addEventListener('input', () => updateMapSelectionStatus(getCoordinateInputValue(latInput), getCoordinateInputValue(lngInput)));
lngInput.addEventListener('input', () => updateMapSelectionStatus(getCoordinateInputValue(latInput), getCoordinateInputValue(lngInput)));
mapAddModeButton.addEventListener('click', () => setMapAddMode(!mapAddModeEnabled));
enableLeadEditButton.addEventListener('click', () => {
  setLeadDetailsEditable(true, true);
  nameInput.focus();
});
mapSearchForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = mapSearchInput.value.trim();
  if (!query) {
    setMapSearchFeedback('Enter an address, city, ZIP, or neighborhood to jump the map.');
    return;
  }

  try {
    setMapSearchFeedback(`Searching for: ${query}`);
    const result = await apiFetch(`/api/geocode/search?q=${encodeURIComponent(query)}`);
    focusMapOnSearchResult(result);
  } catch (error) {
    setMapSearchFeedback(error.message);
  }
});
currentLocationButton.addEventListener('click', () => {
  if (locatingUser) return;
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

document.getElementById('btn-open-modal').addEventListener('click', () => openModal());
document.getElementById('btn-close-modal').addEventListener('click', closeModal);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('btn-close-confirm').addEventListener('click', closeConfirm);
document.getElementById('btn-cancel-delete').addEventListener('click', closeConfirm);
modalOverlay.addEventListener('click', (event) => { if (event.target === modalOverlay) closeModal(); });
confirmOverlay.addEventListener('click', (event) => { if (event.target === confirmOverlay) closeConfirm(); });

async function loadSession() {
  try {
    const data = await apiFetch(`${SESSION_API}/me`);
    sessionContext = data;

    const orgEl = document.getElementById('session-org');
    const roleEl = document.getElementById('session-role');
    const userEl = document.getElementById('session-user');
    if (orgEl) orgEl.textContent = data.organization?.slug ?? '';
    if (roleEl) {
      roleEl.textContent = data.role ?? '';
      roleEl.className = `session-role role-${data.role ?? 'canvasser'}`;
    }
    if (userEl) userEl.textContent = data.user?.email ?? '';

    applyRoleGating(data.role ?? 'canvasser');
    syncInviteRoleOptions(data.role ?? 'canvasser');
  } catch {
    // Degrade gracefully — session bar stays empty, no restrictions enforced
  }
}

function syncInviteRoleOptions(role) {
  if (!inviteRoleSelect) {
    return;
  }

  const allowedRoles = role === 'manager'
    ? ['canvasser', 'manager']
    : ['canvasser', 'manager', 'admin'];

  inviteRoleSelect.innerHTML = allowedRoles
    .map((allowedRole) => `<option value="${allowedRole}">${allowedRole.charAt(0).toUpperCase()}${allowedRole.slice(1)}</option>`)
    .join('');
}

function applyRoleGating(role) {
  const ROLE_WEIGHT = { canvasser: 10, manager: 20, admin: 30, owner: 40 };
  isManagerRole = (ROLE_WEIGHT[role] ?? 10) >= 20;

  // Static UI elements
  document.getElementById('btn-open-modal').classList.toggle('hidden', !isManagerRole);
  document.getElementById('btn-enable-lead-edit').classList.toggle('hidden', !isManagerRole);
  document.getElementById('team-form').classList.toggle('hidden', !isManagerRole);
  document.getElementById('rep-form').classList.toggle('hidden', !isManagerRole);
  if (memberInvitesPanel) {
    memberInvitesPanel.classList.toggle('hidden', !isManagerRole);
  }
}

async function initializeApp() {
  plannerDateInput.value = new Date().toISOString().slice(0, 10);
  initializeMap();
  syncMapAddModeUi();
  await loadSession();
  await loadRosterData();
  await loadLeads();
}

initializeApp().catch((error) => {
  setMapSearchFeedback(error.message || 'App failed to initialize.');
});
