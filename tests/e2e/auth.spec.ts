import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should register a new user and redirect to XMB', async ({ page }) => {
    // 1. Click Register on Splash Screen
    await page.getByText('Реєстрація').click();

    // 2. Fill form
    const testEmail = `test_${Date.now()}@prism.io`;
    await page.getByPlaceholder('john.doe@prism.io').fill(testEmail);
    await page.getByPlaceholder('••••••••').fill('password123');

    // 3. Submit
    await page.getByText('ENTER ->').click();

    // 4. Verify we are on XMB (check for category text or user email)
    await expect(page.getByText(testEmail)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('CATEGORIES.VIDEO')).toBeVisible();
  });

  test('should allow guest login', async ({ page }) => {
    await page.getByText('Увійти як гість').click();
    await expect(page.getByText('Guest User')).toBeVisible();
    await expect(page.getByText('CATEGORIES.VIDEO')).toBeVisible();
  });
});
