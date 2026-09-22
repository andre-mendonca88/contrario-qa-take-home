import { test, expect } from '@playwright/test';

/**
 * E2E for the thin recruiter form at "/".
 *
 * This suite's job is to prove the form is wired to the real API — that
 * selecting a recruiter/role, filling the fields, and clicking Submit produces
 * the request the API expects and renders back what the API returns. It is
 * deliberately NOT a re-test of the business rules already covered in
 * test/api/**: those are asserted once, at the API layer, where they are
 * cheap and precise. E2E is the expensive layer, so it stays to a handful of
 * journeys — happy path, one rejection, one collision — not the full matrix.
 *
 * State is reset via a direct API call in beforeEach, not through the UI: the
 * form has no way to reset state itself, and driving a reset through clicks
 * would just be slower, flakier plumbing for the same HTTP call.
 */

test.beforeEach(async ({ request, baseURL }) => {
  await request.post(`${baseURL}/test/reset`);
});

function uniqueEmail(tag: string) {
  return `e2e-${tag}-${Date.now()}@example.com`;
}

test('happy path: submitting the default form as a direct recruiter succeeds', async ({ page }) => {
  await page.goto('/');
  await page.selectOption('#userId', 'u_recruiter_direct');
  await page.selectOption('#jobId', 'job_active');
  await page.fill('#email', uniqueEmail('happy'));

  await page.click('#submit');

  await expect(page.locator('#status')).toHaveText('HTTP 200');
  const body = JSON.parse(await page.locator('#result').innerText());
  expect(body.submission).toMatchObject({ status: 'PENDING_ADMIN_APPROVAL', jobId: 'job_active' });
});

test('rejection: a non-recruiter caller is forbidden, and the API error is rendered', async ({ page }) => {
  await page.goto('/');
  await page.selectOption('#userId', 'u_non_recruiter');
  await page.fill('#email', uniqueEmail('rejected'));

  await page.click('#submit');

  await expect(page.locator('#status')).toHaveText('HTTP 403');
  const body = JSON.parse(await page.locator('#result').innerText());
  expect(body.message).toBe('Only recruiters can submit candidates.');
});

test('collision: submitting the same email to the same role twice through the form is rejected', async ({
  page,
}) => {
  await page.goto('/');
  await page.selectOption('#userId', 'u_recruiter_direct');
  await page.selectOption('#jobId', 'job_active');
  await page.fill('#email', uniqueEmail('collision'));

  await page.click('#submit');
  await expect(page.locator('#status')).toHaveText('HTTP 200');

  await page.click('#submit');
  await expect(page.locator('#status')).toHaveText('HTTP 409');
});
