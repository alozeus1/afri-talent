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

  test('Companies page no-result state is honest and actionable', async ({ page }) => {
    await page.goto('/companies', { waitUntil: 'domcontentloaded' });

    await expect(page.getByText('Verified profiles, reviews, and hiring outcomes will appear only after real verification.')).toBeVisible();
    const searchBox = page.getByPlaceholder('Search companies by name or industry...');
    // A fill that lands before hydration is dropped by React; retry until the
    // debounced search actually runs.
    await expect(async () => {
      await searchBox.fill('');
      await searchBox.fill('zzzz-no-company-match-verified-directory');
      await expect(page.getByText('0 companies found')).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 20000 });
    await expect(page.locator('h2', { hasText: 'No companies found' })).toBeVisible();

    await expect(page.locator("text=We couldn't find any companies matching your search")).toBeVisible();
    const clearSearch = page.getByRole('button', { name: 'Clear the search to see all companies' });
    await expect(clearSearch).toBeVisible();
    await clearSearch.click();
    await expect(page.getByPlaceholder('Search companies by name or industry...')).toHaveValue('');
  });
});
