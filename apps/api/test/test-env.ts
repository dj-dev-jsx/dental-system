import 'dotenv/config';

// Runs before any test file, so the app under test connects to the test database.
// The check stops a misconfigured .env from pointing the tests at development data.
const url = process.env['TEST_DATABASE_URL'];
if (!url?.includes('_test')) {
  throw new Error('TEST_DATABASE_URL must point to a *_test database');
}
process.env['DATABASE_URL'] = url;
