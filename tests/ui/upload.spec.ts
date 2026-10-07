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

test.describe('Flow summary', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('is absent before any file is uploaded', async ({ page }) => {
    await expect(page.locator('section.flow-sum')).toHaveCount(0);
  });

  test('appears with the file name after a valid .ktr is uploaded', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('label[data-kind="ktr"]'),
    ]);
    await fc.setFiles(KTR);
    await page.locator('.file [aria-label="Uploaded"]').first().waitFor();
    await expect(page.locator('section.flow-sum')).toBeVisible();
    await expect(page.locator('#sec-flowsum')).toContainText('Flow summary');
    await expect(page.locator('.flow-sum-list')).toContainText('load_customers.ktr');
  });

  test('appears with the file name after a valid .kjb is uploaded', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('label[data-kind="kjb"]'),
    ]);
    await fc.setFiles(KJB);
    await page.locator('.file [aria-label="Uploaded"]').first().waitFor();
    await expect(page.locator('section.flow-sum')).toBeVisible();
    await expect(page.locator('.flow-sum-list')).toContainText('run_job.kjb');
  });

  test('shows output shape when both .kjb and .ktr are present', async ({ page }) => {
    for (const [kind, file] of [['kjb', KJB], ['ktr', KTR]] as const) {
      const [fc] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.click(`label[data-kind="${kind}"]`),
      ]);
      await fc.setFiles(file);
      await page.locator('.file [aria-label="Uploaded"]').last().waitFor();
    }
    await expect(page.locator('section.flow-sum p.sub')).toContainText('sequence job');
    await expect(page.locator('section.flow-sum p.sub')).toContainText('parallel job');
  });

  test('disappears when all .ktr and .kjb files are removed', async ({ page }) => {
    const [fc] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.click('label[data-kind="ktr"]'),
    ]);
    await fc.setFiles(KTR);
    await page.locator('.file [aria-label="Uploaded"]').first().waitFor();
    await expect(page.locator('section.flow-sum')).toBeVisible();
    await page.locator('button[aria-label="Remove file"]').first().click();
    await expect(page.locator('section.flow-sum')).toHaveCount(0);
  });
});
