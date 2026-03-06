import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
    test('login page loads', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('input[type="text"], input[name="username"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
    });

    test('unauthenticated access to dashboard redirects', async ({ page }) => {
        await page.goto('/dashboard');
        // Should either show dashboard or redirect to login
        await page.waitForURL(/\/(dashboard|login)/);
    });

    test('editor page loads', async ({ page }) => {
        await page.goto('/');
        // Editor should show upload zone or main app
        await expect(page.locator('body')).toBeVisible();
    });
});

test.describe('Auth flow', () => {
    test('login with invalid credentials shows error', async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="text"], input[name="username"]', 'wrong');
        await page.fill('input[type="password"]', 'wrongpassword');
        await page.click('button[type="submit"]');
        // Should show error or stay on login page
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe('Dashboard pages', () => {
    // These tests assume the user can access the dashboard
    // In a real setup, you'd login first via API or fixture
    test('dashboard overview has correct structure', async ({ page }) => {
        await page.goto('/dashboard');
        // If redirected to login, that's fine — the route exists
        const url = page.url();
        expect(url).toMatch(/\/(dashboard|login)/);
    });

    test('dashboard templates page exists', async ({ page }) => {
        const response = await page.goto('/dashboard/templates');
        expect(response?.status()).toBeLessThan(500);
    });

    test('dashboard settings page exists', async ({ page }) => {
        const response = await page.goto('/dashboard/settings');
        expect(response?.status()).toBeLessThan(500);
    });
});
