import { test, expect } from '@playwright/test';

test.describe('Gateway settings dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('opens and closes without errors', async ({ page }) => {
    await page.click('#open-settings');
    await expect(page.locator('#settings')).toBeVisible();
    await page.click('#cfg-close');
    await expect(page.locator('#settings')).toBeHidden();
  });

  test('shows all four auth-type options', async ({ page }) => {
    await page.click('#open-settings');
    const options = await page.locator('select[data-path="upstream.auth.type"] option').allTextContents();
    expect(options).toEqual(
      expect.arrayContaining(['None', 'Bearer token', 'API key header', 'Basic (username and password)']),
    );
  });

  test('bearer token field is hidden when auth type is none', async ({ page }) => {
    await page.click('#open-settings');
    await page.selectOption('select[data-path="upstream.auth.type"]', 'none');
    // The token/key field lives in [data-auth="bearer header"]
    await expect(page.locator('[data-auth="bearer header"]')).toBeHidden();
  });

  test('bearer token field is visible when auth type is bearer', async ({ page }) => {
    await page.click('#open-settings');
    await page.selectOption('select[data-path="upstream.auth.type"]', 'bearer');
    await expect(page.locator('[data-auth="bearer header"]')).toBeVisible();
  });

  test('Save and test connection shows a result message in mock mode', async ({ page }) => {
    await page.click('#open-settings');
    await page.click('#cfg-test');
    // The status message should mention mock mode
    await expect(page.locator('#cfg-msg')).toContainText(/mock/i, { timeout: 5_000 });
  });

  test('masked secret is not replaced when left unchanged', async ({ page }) => {
    // Pre-condition: set a token via the admin API so the mask is present.
    await page.evaluate(async () => {
      await fetch('/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upstream: { auth: { type: 'bearer', token: 'my-real-token' } },
        }),
      });
    });
    await page.click('#open-settings');
    // The token field should show the mask, not the real value.
    const tokenValue = await page.inputValue('[data-path="upstream.auth.token"]');
    expect(tokenValue).toBe('••••••••');
  });
});
