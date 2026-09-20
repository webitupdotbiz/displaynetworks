import { test, expect } from '@playwright/test';

test('basic app smoke test - navbar visible', async ({ page }) => {
  await page.goto('/');
  // expect a navigation element to be visible
  const nav = page.locator('nav');
  await expect(nav.first()).toBeVisible();
});
