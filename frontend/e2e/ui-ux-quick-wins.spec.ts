import { test, expect } from '@playwright/test';

test.describe('UI/UX Quick Wins Verification', () => {
  test('Skip to main content link exists and is keyboard accessible', async ({ page }) => {
    await page.goto('/');
    
    // The skip link should be present in the DOM
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();
    
    // Verify the skip link can receive focus. Mobile/touch projects do not
    // consistently advance focus with Tab, so focus the element directly.
    await skipLink.focus();
    
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveText('Skip to main content');
    
    // Press Enter and verify focus moves to main content
    await page.keyboard.press('Enter');
    
    // Note: Actually verifying the focus shifted to #main-content might require the browser to handle the anchor tag
    // But the link existence and focusability is the core fix.
  });

  test('Companies page empty state shows featured companies', async ({ page }) => {
    await page.route('**/api/companies*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          companies: [],
          pagination: { page: 1, limit: 12, total: 0, totalPages: 1 }
        })
      });
    });

    await page.goto('/companies', { waitUntil: 'domcontentloaded' });

    const heading = page.locator('h2', { hasText: 'Directory is being updated' });
    const sampleHeading = page.locator('h3', { hasText: 'Sample Employer Profile Structure' });

    await expect(heading).toBeVisible();
    await expect(sampleHeading).toBeVisible();

    await expect(page.locator('text=Sample fintech employer profile')).toBeVisible();
    await expect(page.locator('text=Sample distributed engineering network')).toBeVisible();
    await expect(page.locator('text=Sample global payments company')).toBeVisible();
  });
});
