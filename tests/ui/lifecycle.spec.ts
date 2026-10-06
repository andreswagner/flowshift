import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KTR = path.join(__dirname, 'fixtures', 'load_customers.ktr');
const KJB = path.join(__dirname, 'fixtures', 'run_job.kjb');
const DOC = path.join(__dirname, 'fixtures', 'spec.pdf');

/** Upload all three required inputs and return. */
async function uploadAll(page: any) {
  for (const [kind, file] of [['ktr', KTR], ['kjb', KJB], ['doc', DOC]]) {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click(`label[data-kind="${kind}"]`),
    ]);
    await fc.setFiles(file);
  }
  // Wait for all uploads to finish (no spinners remaining)
  await page.locator('[aria-label="Uploading"]').waitFor({ state: 'detached', timeout: 10_000 });
}

test.describe('Migration lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Start translation is disabled until all inputs are uploaded', async ({ page }) => {
    await expect(page.locator('button[data-act="start"]')).toBeDisabled();
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('label[data-kind="ktr"]'),
    ]);
    await fc.setFiles(KTR);
    // Still disabled — kjb and doc are missing
    await expect(page.locator('button[data-act="start"]')).toBeDisabled();
  });

  test('happy path: upload → start → progress → complete → download button', async ({ page }) => {
    await uploadAll(page);
    await expect(page.locator('button[data-act="start"]')).toBeEnabled();
    await page.click('button[data-act="start"]');

    // Progress section should appear
    await expect(page.locator('[aria-label="Translation progress"]')).toBeVisible();

    // Wait for completion (mock takes ~6 s at 1.2 s/step)
    await expect(page.locator('button[data-act="download"]')).toBeVisible({ timeout: 15_000 });
  });

  test('cancel returns to upload phase', async ({ page }) => {
    await uploadAll(page);
    await page.click('button[data-act="start"]');
    await expect(page.locator('button[data-act="cancel"]')).toBeVisible();
    await page.click('button[data-act="cancel"]');
    // Should be back on the upload phase
    await expect(page.locator('button[data-act="start"]')).toBeVisible();
  });

  test('Start a new migration resets all state', async ({ page }) => {
    await uploadAll(page);
    await page.click('button[data-act="start"]');
    await expect(page.locator('button[data-act="download"]')).toBeVisible({ timeout: 15_000 });
    await page.click('button[data-act="reset"]');
    // Upload panels should be back with no files listed
    await expect(page.locator('.files li')).toHaveCount(0);
  });
});
