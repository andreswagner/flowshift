import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fixtures — tiny real files placed next to this spec for reproducibility.
const KTR  = path.join(__dirname, 'fixtures', 'load_customers.ktr');
const KJB  = path.join(__dirname, 'fixtures', 'run_job.kjb');
const DOC  = path.join(__dirname, 'fixtures', 'spec.pdf');

test.describe('File upload', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('accepts a valid .ktr file', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('label[data-kind="ktr"]'),
    ]);
    await fileChooser.setFiles(KTR);
    // File row should appear with a success icon (aria-label="Uploaded")
    await expect(page.locator('.file [aria-label="Uploaded"]').first()).toBeVisible();
  });

  test('rejects a file with the wrong extension inline', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('label[data-kind="ktr"]'),
    ]);
    // Set a .csv file — should be rejected without a toast
    await fileChooser.setFiles({
      name: 'data.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('col1,col2\n1,2'),
    });
    await expect(page.locator('.file.bad').first()).toBeVisible();
    await expect(page.locator('#toast')).toBeHidden();
  });

  test('rejects an empty file inline', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('label[data-kind="ktr"]'),
    ]);
    await fileChooser.setFiles({
      name: 'empty.ktr',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from(''),
    });
    await expect(page.locator('.file.bad').first()).toBeVisible();
  });

  test('remove button deletes the file row', async ({ page }) => {
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('label[data-kind="ktr"]'),
    ]);
    await fileChooser.setFiles(KTR);
    await page.locator('.file [aria-label="Uploaded"]').first().waitFor();
    await page.locator('button[aria-label="Remove file"]').first().click();
    await expect(page.locator('.files li')).toHaveCount(0);
  });
});
