import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { addDays, todayInManila } from '../src/common/manila.js';
import { configureApp } from '../src/configure-app.js';
import { type OutgoingMail, MailService } from '../src/mail/mail.service.js';

// Shared by the online booking tests.

export const STAFF_PASSWORD = 'a-long-test-password';
export const PATIENT_PASSWORD = 'patient-password-1';

/** Booking opens tomorrow, so the tests use days counted from then. */
export const TOMORROW = addDays(todayInManila(), 1);
/** A Philippine time on a day relative to tomorrow, as the exact moment (ISO, UTC). */
export const at = (time: string, dayOffset = 0) =>
  new Date(`${addDays(TOMORROW, dayOffset)}T${time}:00+08:00`).toISOString();

/** The app as the tests run it, with rate limits off unless asked for. */
export async function startApp({ rateLimits = false } = {}) {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (!rateLimits) builder = builder.overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true });
  const app = (await builder.compile()).createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/** "name=value" of one cookie a response set, or undefined. */
export function cookieNamed(response: request.Response, name: string) {
  const all = [response.headers['set-cookie'] ?? []].flat() as string[];
  return all.find((c) => c.startsWith(`${name}=`))?.split(';')[0];
}

/** The emails "sent" so far, from the in-memory transport. */
export function outbox(app: INestApplication): OutgoingMail[] {
  return app.get(MailService).outbox;
}

/** The token in the first link of an email. */
export function tokenIn(mail: OutgoingMail) {
  const match = /token=([A-Za-z0-9_-]+)/.exec(mail.text);
  if (!match) throw new Error(`No link with a token in the "${mail.kind}" email`);
  return match[1];
}

export const signUpBody = (fields: Record<string, unknown> = {}) => ({
  firstName: 'Rosa',
  lastName: 'Villanueva',
  birthDate: '1995-05-05',
  phone: '0900 000 0010',
  email: 'rosa@example.test',
  password: PATIENT_PASSWORD,
  privacyConsent: true,
  ...fields,
});
