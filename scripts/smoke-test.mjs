#!/usr/bin/env node

/**
 * Smoke test — verifies core API endpoints are responding.
 * Usage: node scripts/smoke-test.mjs [base_url]
 * Default: http://localhost:3000
 */

const BASE = process.argv[2] || 'http://localhost:3000';

const tests = [
    { name: 'Homepage', method: 'GET', path: '/', expect: 200 },
    { name: 'Login page', method: 'GET', path: '/login', expect: 200 },
    { name: 'Auth login (no body)', method: 'POST', path: '/api/auth/login', expect: [400, 401] },
    { name: 'Upload (no file)', method: 'POST', path: '/api/upload', expect: [400, 401] },
    { name: 'Templates API', method: 'GET', path: '/api/templates', expect: [200, 401] },
];

let passed = 0;
let failed = 0;

for (const t of tests) {
    const url = `${BASE}${t.path}`;
    try {
        const res = await fetch(url, {
            method: t.method,
            headers: t.method === 'POST' ? { 'Content-Type': 'application/json' } : {},
            body: t.method === 'POST' ? '{}' : undefined,
            redirect: 'follow',
        });
        const expected = Array.isArray(t.expect) ? t.expect : [t.expect];
        if (expected.includes(res.status)) {
            console.log(`  ✓ ${t.name} — ${res.status}`);
            passed++;
        } else {
            console.log(`  ✗ ${t.name} — expected ${t.expect}, got ${res.status}`);
            failed++;
        }
    } catch (err) {
        console.log(`  ✗ ${t.name} — ${err.message}`);
        failed++;
    }
}

console.log(`\n${passed} passed, ${failed} failed out of ${tests.length} tests`);
process.exit(failed > 0 ? 1 : 0);
