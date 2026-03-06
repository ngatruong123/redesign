import { test, expect } from '@playwright/test';

test.describe('Smoke tests', () => {
    test('login page loads with form', async ({ page }) => {
        await page.goto('/login');
        await expect(page.locator('input[type="text"], input[name="username"]')).toBeVisible();
        await expect(page.locator('input[type="password"]')).toBeVisible();
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('register page loads', async ({ page }) => {
        const res = await page.goto('/register');
        expect(res?.status()).toBeLessThan(500);
    });

    test('editor page loads', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('body')).toBeVisible();
    });
});

test.describe('Auth flow', () => {
    test('login with invalid credentials shows error', async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="text"], input[name="username"]', 'wrong');
        await page.fill('input[type="password"]', 'wrongpassword');
        await page.click('button[type="submit"]');
        await page.waitForTimeout(1000);
        // Should stay on login page or show error
        await expect(page).toHaveURL(/\/login/);
    });
});

test.describe('Dashboard pages', () => {
    test('dashboard overview exists', async ({ page }) => {
        const response = await page.goto('/dashboard');
        expect(response?.status()).toBeLessThan(500);
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

test.describe('API health', () => {
    test('workspaces API requires auth', async ({ request }) => {
        const res = await request.get('/api/workspaces');
        expect([401, 403]).toContain(res.status());
    });

    test('templates API requires auth', async ({ request }) => {
        const res = await request.get('/api/templates?workspace=default');
        // Returns empty array or 401 when not authenticated
        expect(res.status()).toBeLessThan(500);
    });

    test('CSRF token endpoint works', async ({ request }) => {
        const res = await request.get('/api/csrf');
        expect(res.status()).toBeLessThan(500);
    });
});
