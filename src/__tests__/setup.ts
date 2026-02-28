// Global test setup for vitest
// Mock environment variables
process.env.AUTH_USERNAME = 'testuser';
process.env.AUTH_PASSWORD = 'testpassword123';
process.env.AI_PROVIDER = 'mock';
process.env.DATABASE_URL = 'file:./test.db';
