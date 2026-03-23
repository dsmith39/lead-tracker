const { test, expect } = require('@playwright/test');

const BASE = 'http://localhost:3001';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function clearLeads() {
  // Use the API directly to delete all leads between tests
  const res = await fetch(`${BASE}/api/leads`);
  const leads = await res.json();
  await Promise.all(
    leads.map((l) =>
      fetch(`${BASE}/api/leads/${l._id}`, { method: 'DELETE' })
    )
  );
}

async function createLead(data) {
  const res = await fetch(`${BASE}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

// ── Test setup ────────────────────────────────────────────────────────────────

test.beforeEach(async () => {
  await clearLeads();
});

// ── Page load ─────────────────────────────────────────────────────────────────

test('displays empty state on first load', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#empty-row')).toBeVisible();
  await expect(page.locator('#empty-row')).toContainText('No leads found');
});

// ── Add lead ──────────────────────────────────────────────────────────────────

test('can add a new lead', async ({ page }) => {
  await page.goto('/');

  await page.click('#btn-open-modal');
  await expect(page.locator('#modal-overlay')).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('Add Lead');

  await page.fill('#input-name', 'Alice Johnson');
  await page.fill('#input-company', 'Acme Corp');
  await page.fill('#input-email', 'alice@acme.com');
  await page.fill('#input-phone', '+1 555 111 2222');
  await page.selectOption('#input-status', 'spoke-to-owner');
  await page.fill('#input-notes', 'Met at conference');

  await page.click('#lead-form button[type="submit"]');

  // Modal closes
  await expect(page.locator('#modal-overlay')).toBeHidden();

  // Row appears in table
  await expect(page.locator('tbody tr:not(#empty-row)')).toHaveCount(1);
  await expect(page.locator('tbody tr:not(#empty-row) td').first()).toContainText('Alice Johnson');
  await expect(page.locator('.badge-spoke-to-owner')).toBeVisible();
});

test('clicking the map in browse mode does not open the add modal', async ({ page }) => {
  await page.goto('/');

  await page.click('#lead-map', { position: { x: 220, y: 180 } });

  await expect(page.locator('#modal-overlay')).toBeHidden();
  await expect(page.locator('#map-selection-status')).toContainText('Map browsing mode');
});

test('clicking the map in add mode opens the add modal with coordinates prefilled', async ({ page }) => {
  await page.route('**/api/geocode/reverse**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        displayName: '123 Main St, Springfield, Illinois, USA',
        address: {
          street: '123 Main St',
          city: 'Springfield',
          state: 'Illinois',
          postalCode: '62701',
          country: 'USA',
        },
      }),
    });
  });

  await page.goto('/');

  await page.click('#btn-map-add-mode');
  await expect(page.locator('#map-selection-status')).toContainText('Add mode armed');

  await page.click('#lead-map', { position: { x: 220, y: 180 } });

  await expect(page.locator('#modal-overlay')).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('Add Lead from Map');
  await expect(page.locator('#input-lat')).not.toHaveValue('');
  await expect(page.locator('#input-lng')).not.toHaveValue('');
  await expect(page.locator('#input-address-street')).toHaveValue('123 Main St');
  await expect(page.locator('#input-address-city')).toHaveValue('Springfield');
  await expect(page.locator('#input-address-state')).toHaveValue('Illinois');
  await expect(page.locator('#input-address-postal')).toHaveValue('62701');
  await expect(page.locator('#input-address-country')).toHaveValue('USA');
});

test('searching the map jumps directly to the requested location', async ({ page }) => {
  await page.route('**/api/geocode/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        displayName: 'Denver, Colorado, USA',
        lat: 39.7392,
        lng: -104.9903,
        boundingBox: [39.6, 39.9, -105.2, -104.8],
      }),
    });
  });

  await page.goto('/');

  await page.fill('#map-search-input', 'Denver, CO');
  await page.click('#btn-map-search');

  await expect(page.locator('#map-search-feedback')).toContainText('Centered on: Denver, Colorado, USA');

  const mapCenter = await page.evaluate(() => {
    const center = window.__leadTrackerMap.getCenter();
    return { lat: center.lat, lng: center.lng };
  });

  expect(mapCenter.lat).toBeGreaterThan(39.6);
  expect(mapCenter.lat).toBeLessThan(39.9);
  expect(mapCenter.lng).toBeGreaterThan(-105.2);
  expect(mapCenter.lng).toBeLessThan(-104.8);
});

test('clicking my location centers the map on the user position', async ({ page, context }) => {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 33.7488, longitude: -84.3877 });

  await page.goto('/');

  await page.click('#btn-current-location');
  await expect(page.locator('#map-search-feedback')).toContainText('Centered on your location');

  const mapCenter = await page.evaluate(() => {
    const center = window.__leadTrackerMap.getCenter();
    return { lat: center.lat, lng: center.lng };
  });

  expect(mapCenter.lat).toBeGreaterThan(33.7);
  expect(mapCenter.lat).toBeLessThan(33.8);
  expect(mapCenter.lng).toBeGreaterThan(-84.5);
  expect(mapCenter.lng).toBeLessThan(-84.3);
});

test('shows validation error when name is empty', async ({ page }) => {
  await page.goto('/');
  await page.click('#btn-open-modal');
  await page.click('#lead-form button[type="submit"]');

  await expect(page.locator('#form-error')).toBeVisible();
  await expect(page.locator('#modal-overlay')).toBeVisible(); // stays open
});

// ── Edit lead ─────────────────────────────────────────────────────────────────

test('can edit an existing lead', async ({ page }) => {
  await createLead({ name: 'Bob Smith', status: 'not-visited' });
  await page.goto('/');

  await expect(page.locator('tbody tr:not(#empty-row)')).toHaveCount(1);

  await page.click('.btn-edit');
  await expect(page.locator('#modal-title')).toHaveText('Edit Lead');
  await expect(page.locator('#input-name')).toHaveValue('Bob Smith');

  await page.fill('#input-name', 'Robert Smith');
  await page.selectOption('#input-status', 'callback-requested');
  await page.click('#lead-form button[type="submit"]');

  await expect(page.locator('#modal-overlay')).toBeHidden();
  await expect(page.locator('tbody tr:not(#empty-row) td').first()).toContainText('Robert Smith');
  await expect(page.locator('.badge-callback-requested')).toBeVisible();
});

test('clicking a map marker opens the edit modal for that lead', async ({ page }) => {
  await createLead({
    name: 'Marker Lead',
    status: 'not-visited',
    location: { lat: 39.8283, lng: -98.5795 },
    address: { street: '100 Route Rd', city: 'Center', state: 'KS', postalCode: '67000', country: 'USA' },
  });
  await page.goto('/');

  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1);
  await page.locator('.leaflet-marker-icon').click();

  await expect(page.locator('#modal-overlay')).toBeVisible();
  await expect(page.locator('#modal-title')).toHaveText('Edit Lead');
  await expect(page.locator('#input-name')).toHaveValue('Marker Lead');
});

// ── Delete lead ───────────────────────────────────────────────────────────────

test('can delete a lead via confirmation modal', async ({ page }) => {
  await createLead({ name: 'Carol White', status: 'not-visited' });
  await page.goto('/');

  await expect(page.locator('tbody tr:not(#empty-row)')).toHaveCount(1);

  await page.click('.btn-delete');
  await expect(page.locator('#confirm-overlay')).toBeVisible();

  await page.click('#btn-confirm-delete');
  await expect(page.locator('#confirm-overlay')).toBeHidden();
  await expect(page.locator('#empty-row')).toBeVisible();
});

test('cancel on delete confirmation keeps the lead', async ({ page }) => {
  await createLead({ name: 'Dave Brown', status: 'not-visited' });
  await page.goto('/');

  await page.click('.btn-delete');
  await expect(page.locator('#confirm-overlay')).toBeVisible();
  await page.click('#btn-cancel-delete');

  await expect(page.locator('#confirm-overlay')).toBeHidden();
  await expect(page.locator('tbody tr:not(#empty-row)')).toHaveCount(1);
});

// ── Search ────────────────────────────────────────────────────────────────────

test('search filters leads by name', async ({ page }) => {
  await createLead({ name: 'Eve Adams', status: 'not-visited' });
  await createLead({ name: 'Frank Castle', status: 'not-visited' });
  await page.goto('/');

  await expect(page.locator('tbody tr:not(#empty-row)')).toHaveCount(2);

  await page.fill('#search-input', 'Eve');
  await expect(page.locator('tbody tr:not(#empty-row)')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('Eve Adams');
  await expect(page.locator('tbody')).not.toContainText('Frank Castle');
});

test('search with no matches shows empty state', async ({ page }) => {
  await createLead({ name: 'Grace Hopper', status: 'not-visited' });
  await page.goto('/');

  await page.fill('#search-input', 'ZZZnonexistent');
  await expect(page.locator('#empty-row')).toBeVisible();
});

// ── Status filter ─────────────────────────────────────────────────────────────

test('status filter shows only matching leads', async ({ page }) => {
  await createLead({ name: 'Henry Ford', status: 'not-visited' });
  await createLead({ name: 'Ida Wells', status: 'sale-closed' });
  await page.goto('/');

  await expect(page.locator('tbody tr:not(#empty-row)')).toHaveCount(2);

  await page.selectOption('#status-filter', 'sale-closed');
  await expect(page.locator('tbody tr:not(#empty-row)')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('Ida Wells');
  await expect(page.locator('tbody')).not.toContainText('Henry Ford');
});

// ── Stats bar ─────────────────────────────────────────────────────────────────

test('stats bar reflects correct counts', async ({ page }) => {
  await createLead({ name: 'Jack Ma', status: 'not-visited' });
  await createLead({ name: 'Karen Page', status: 'sale-closed' });
  await createLead({ name: 'Leo Messi', status: 'callback-requested' });
  await page.goto('/');

  const pills = page.locator('.stat-pill');
  await expect(pills.filter({ hasText: 'Total' })).toContainText('3');
  await expect(pills.filter({ hasText: 'Not Visited' })).toContainText('1');
  await expect(pills.filter({ hasText: 'Sale Closed' })).toContainText('1');
  await expect(pills.filter({ hasText: 'Callback Requested' })).toContainText('1');
});

// ── Modal close behaviours ────────────────────────────────────────────────────

test('close button dismisses the add modal', async ({ page }) => {
  await page.goto('/');
  await page.click('#btn-open-modal');
  await expect(page.locator('#modal-overlay')).toBeVisible();
  await page.click('#btn-close-modal');
  await expect(page.locator('#modal-overlay')).toBeHidden();
});

test('clicking backdrop dismisses the add modal', async ({ page }) => {
  await page.goto('/');
  await page.click('#btn-open-modal');
  await expect(page.locator('#modal-overlay')).toBeVisible();
  // Click the overlay backdrop (outside the .modal box)
  await page.locator('#modal-overlay').click({ position: { x: 10, y: 10 } });
  await expect(page.locator('#modal-overlay')).toBeHidden();
});
