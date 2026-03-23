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
