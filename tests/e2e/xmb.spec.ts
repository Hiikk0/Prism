import { test, expect } from '@playwright/test';

test.describe('XMB Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Start with guest session
    await page.goto('/');
    await page.getByText('Увійти як гість').click();
    await expect(page.getByText('CATEGORIES.VIDEO')).toBeVisible();
  });

  test('should navigate horizontal categories using keyboard', async ({ page }) => {
    // Default is first category (Profile or Video)
    // Press Right
    await page.keyboard.press('ArrowRight');
    await expect(page.getByText('CATEGORIES.MUSIC')).toBeVisible();
    
    // Press Left
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByText('CATEGORIES.VIDEO')).toBeVisible();
  });

  test('should scroll vertical items using global wheel', async ({ page }) => {
    // Get initial position of an item if possible, or just check focus
    // We can use the global wheel on the page
    await page.mouse.wheel(0, 500); // Scroll down
    
    // Check if the first item moved or active index changed
    // Since we don't have IDs for every element, we can check if the second item text is present
    await expect(page.getByText('Нещодавно додані')).toBeVisible();
  });
  
  test('should scroll categories specifically in the top strip', async ({ page, viewport }) => {
    // Current viewport center-ish height is cY (let's assume center)
    const centerX = 1280 / 2;
    const centerY = 720 / 2;
    
    // The strip is at -130 to 0 relative to centerY
    // So go to centerY - 65
    await page.mouse.move(centerX, centerY - 65);
    await page.mouse.wheel(0, 100); // Scroll categories
    
    // Check if category changed
    await expect(page.getByText('CATEGORIES.MUSIC')).toBeVisible();
  });
});
