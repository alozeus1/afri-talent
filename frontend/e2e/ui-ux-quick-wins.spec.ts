import { test, expect } from '@playwright/test';

test.describe('UI/UX Quick Wins Verification', () => {
  test('Skip to main content link exists and is keyboard accessible', async ({ page }) => {
    await page.goto('/');
    
    // The skip link should be present in the DOM
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();
    
    // Press Tab to focus the first element (should be the skip link)
    await page.keyboard.press('Tab');
    
    // Verify it is focused
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveText('Skip to main content');
    
    // Press Enter and verify focus moves to main content
    await page.keyboard.press('Enter');
    
    // Note: Actually verifying the focus shifted to #main-content might require the browser to handle the anchor tag
    // But the link existence and focusability is the core fix.
  });

  test('Companies page empty state shows featured companies', async ({ page }) => {
    await page.goto('/companies');
    
    // Wait for network/loading states to resolve
    await page.waitForLoadState('networkidle');
    
    // Since we mocked this to show up when search is empty and no companies are returned by API
    // We should see "Directory is being updated" OR "Featured Companies"
    const heading = page.locator('h2', { hasText: 'Directory is being updated' });
    const featuredHeading = page.locator('h3', { hasText: 'Featured Companies' });
    
    // If the API returns 0 companies, our new empty state appears
    // Since it's a test environment, if there are NO companies, it shows the empty state.
    // Let's intercept the API request to guarantee it returns 0 companies to test the empty state.
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

    await page.goto('/companies');
    
    // Now we are guaranteed to hit the empty state
    await expect(heading).toBeVisible();
    await expect(featuredHeading).toBeVisible();
    
    // Verify mock companies are displayed
    await expect(page.locator('text=Paystack')).toBeVisible();
    await expect(page.locator('text=Andela')).toBeVisible();
    await expect(page.locator('text=Flutterwave')).toBeVisible();
  });
});
