import 'dotenv/config';

// Runs before any test file, so the app under test connects to the test database.
// The check stops a misconfigured .env from pointing the tests at development data.
const url = process.env['TEST_DATABASE_URL'];
if (!url?.includes('_test')) {
  throw new Error('TEST_DATABASE_URL must point to a *_test database');
}
process.env['DATABASE_URL'] = url;

// Emails are kept in memory (MailService.outbox) for the tests to read: nothing is ever sent,
// even if the .env has a Resend key or a mail server is running.
process.env['MAIL_TRANSPORT'] = 'memory';
// The emails' sender and links are checked against the development defaults, whatever .env says.
// Empty rather than deleted: Nest's ConfigModule would otherwise fill them in from .env.
process.env['MAIL_FROM'] = '';
process.env['WEB_ORIGIN'] = '';
process.env['SMTP_URL'] = '';
