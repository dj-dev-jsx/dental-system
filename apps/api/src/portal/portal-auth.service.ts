import { randomBytes } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { BadRequestException, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { recordPatientAudit } from '../audit/audit.js';
import { FAILED_LOGIN_MIN_MS, hashToken } from '../auth/auth.service.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  type PatientAccount,
  type PatientTokenPurpose,
  Prisma,
} from '../generated/prisma/client.js';
import * as mails from '../mail/mail.templates.js';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type BookingClinic,
  checkBookable,
  checkDentist,
  createOnlineRequest,
  findBookingClinic,
  type PortalAppointment,
} from './booking.js';
import type { RegisterInput } from './portal.schemas.js';
import type { AuthenticatedPatient } from './portal.types.js';

export const PATIENT_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const VERIFY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const RESET_LIFETIME_MS = 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;

const ACCOUNT_FIELDS = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  birthDate: true,
  patientId: true,
} satisfies Prisma.PatientAccountSelect;

type AccountRow = Prisma.PatientAccountGetPayload<{ select: typeof ACCOUNT_FIELDS }>;

/** The account as the patient sees it: GET /me. */
export function toMe(account: Pick<AccountRow, 'id' | 'firstName' | 'lastName' | 'email' | 'phone' | 'birthDate'>) {
  return {
    id: account.id,
    firstName: account.firstName,
    lastName: account.lastName,
    email: account.email,
    phone: account.phone,
    // PostgreSQL returns a date as midnight UTC; 'YYYY-MM-DD' stops browsers shifting it a day.
    birthDate: account.birthDate.toISOString().slice(0, 10),
  };
}

// What sign-up keeps in pending_request until the email is confirmed.
const pendingSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }),
  dentistId: z.uuid().nullable(),
  reason: z.string().min(1).max(500),
});

const TOKEN_INVALID = 'TOKEN_INVALID';

type AfterCommit = () => void;

/**
 * Patient accounts for online booking: sign-up, the emailed links, login and sessions.
 *
 * A patient account is a separate kind of login from staff, in its own tables with its own
 * cookie. Every route answers 404 BOOKING_NOT_AVAILABLE while online booking is switched off.
 *
 * Emails go out only after the transaction commits (the `after` callbacks), so nobody is sent
 * a link to something that was then undone.
 */
@Injectable()
export class PortalAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Sign-up. Always ends the same way, whether or not the email already has an account, so
   * the answer never reveals who is registered. The difference is only in the email sent.
   */
  async register(input: RegisterInput): Promise<void> {
    const clinic = await findBookingClinic(this.prisma);
    // Hashed for every sign-up, new or not, so both take about as long.
    const passwordHash = await hashPassword(input.password);
    const after: AfterCommit[] = [];
    try {
      await this.prisma.$transaction(async (tx) => {
        // A request that could never be booked is refused now, before anything is saved. This
        // doesn't depend on the email, so it reveals nothing about accounts.
        if (input.request) await checkBookable(tx, clinic, input.request.startsAt, input.request.dentistId);

        const existing = await tx.patientAccount.findUnique({
          where: { email: input.email },
        });
        if (existing) {
          // Change nothing. Tell the owner of the address, who may have forgotten they signed up.
          const verify = existing.emailVerifiedAt ? null : await this.newToken(tx, existing, 'VERIFY_EMAIL');
          after.push(() => this.sendAlreadyRegistered(clinic, existing, verify));
          return;
        }

        const now = new Date();
        const account = await tx.patientAccount.create({
          data: {
            email: input.email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            birthDate: new Date(input.birthDate),
            phone: input.phone,
            privacyConsentAt: now,
            pendingRequest: input.request
              ? {
                  startsAt: input.request.startsAt.toISOString(),
                  dentistId: input.request.dentistId,
                  reason: input.request.reason,
                }
              : Prisma.DbNull,
          },
        });
        await recordPatientAudit(tx, account, 'PATIENT_ACCOUNT_REGISTERED', {
          entityId: account.id,
          metadata: { withRequest: Boolean(input.request) },
        });
        const token = await this.newToken(tx, account, 'VERIFY_EMAIL');
        const links = mails.portalLinks(this.mail.webOrigin);
        after.push(() => this.sendTo(clinic, account.email, mails.verifyEmail(clinic, account.firstName, links.verify(token))));
      });
    } catch (error) {
      // Two sign-ups with the same email at the same moment: the second one finds the first
      // has just taken it. Answer as for any existing email.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
    for (const send of after) send();
  }

  /** Sends a fresh confirmation link, if the email has an account that still needs one. */
  async resendVerification(email: string): Promise<void> {
    const clinic = await findBookingClinic(this.prisma);
    const after: AfterCommit[] = [];
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.patientAccount.findUnique({
        where: { email },
      });
      if (!account || account.emailVerifiedAt) return;
      const token = await this.newToken(tx, account, 'VERIFY_EMAIL');
      const links = mails.portalLinks(this.mail.webOrigin);
      after.push(() => this.sendTo(clinic, account.email, mails.verifyEmail(clinic, account.firstName, links.verify(token))));
    });
    for (const send of after) send();
  }

  /**
   * The link from the first email. Marks the address confirmed, saves the appointment asked
   * for while signing up, and signs the patient in.
   */
  async verify(token: string) {
    const clinic = await findBookingClinic(this.prisma);
    const after: AfterCommit[] = [];
    const result = await this.prisma.$transaction(async (tx) => {
      const account = await this.useToken(tx, token, 'VERIFY_EMAIL');
      const now = new Date();
      if (!account.emailVerifiedAt) {
        await tx.patientAccount.update({
          where: { id: account.id },
          data: { emailVerifiedAt: now },
        });
        await recordPatientAudit(tx, account, 'PATIENT_EMAIL_VERIFIED', { entityId: account.id });
      }
      // Any other confirmation links sent earlier have done their job.
      await tx.patientToken.updateMany({
        where: { accountId: account.id, purpose: 'VERIFY_EMAIL', usedAt: null },
        data: { usedAt: now },
      });
      const request = await this.releasePendingRequest(tx, clinic, account, after);
      const sessionToken = await this.startSession(tx, account, now);
      await recordPatientAudit(tx, account, 'PATIENT_LOGIN_SUCCEEDED', { metadata: { via: 'EMAIL_LINK' } });
      return { account: toMe(account), request, sessionToken };
    });
    for (const send of after) send();
    return result;
  }

  /**
   * Returns a session token, 'UNVERIFIED' when the password is right but the email was never
   * confirmed, or null when the login failed for any reason.
   */
  async login(email: string, password: string): Promise<{ token: string } | 'UNVERIFIED' | null> {
    await findBookingClinic(this.prisma);
    const startedAt = Date.now();
    const result = await this.attemptLogin(email, password);
    // Every failure takes the same time, whatever the reason, like the staff login. Otherwise
    // an attacker could tell which emails are real by timing the response.
    if (!result) await sleep(Math.max(0, FAILED_LOGIN_MIN_MS - (Date.now() - startedAt)));
    return result;
  }

  private attemptLogin(email: string, password: string) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.patientAccount.findUnique({
        where: { email },
      });
      // An unknown email isn't logged: there's no account to name as the actor.
      if (!account) return null;
      const now = new Date();
      if (account.lockedUntil && account.lockedUntil > now) {
        await recordPatientAudit(tx, account, 'PATIENT_LOGIN_FAILED', { metadata: { reason: 'ACCOUNT_LOCKED' } });
        return null;
      }
      if (!(await verifyPassword(account.passwordHash, password))) {
        const failedLogins = account.failedLogins + 1;
        const locked = failedLogins >= MAX_FAILED_LOGINS;
        await tx.patientAccount.update({
          where: { id: account.id },
          data: {
            failedLogins: locked ? 0 : failedLogins,
            lockedUntil: locked ? new Date(now.getTime() + LOCK_MS) : null,
          },
        });
        await recordPatientAudit(tx, account, 'PATIENT_LOGIN_FAILED', {
          metadata: { reason: 'WRONG_PASSWORD', accountLocked: locked },
        });
        return null;
      }
      if (!account.emailVerifiedAt) {
        await recordPatientAudit(tx, account, 'PATIENT_LOGIN_FAILED', { metadata: { reason: 'EMAIL_NOT_VERIFIED' } });
        return 'UNVERIFIED' as const;
      }
      await tx.patientAccount.update({
        where: { id: account.id },
        data: { failedLogins: 0, lockedUntil: null },
      });
      const token = await this.startSession(tx, account, now);
      await recordPatientAudit(tx, account, 'PATIENT_LOGIN_SUCCEEDED');
      return { token };
    });
  }

  async logout(patient: AuthenticatedPatient, token: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.patientSession.deleteMany({ where: { tokenHash: hashToken(token) } });
      await recordPatientAudit(tx, patient, 'PATIENT_LOGOUT');
    });
  }

  /** Emails a link to set a new password, if the email has an account. Silent either way. */
  async forgotPassword(email: string): Promise<void> {
    const clinic = await findBookingClinic(this.prisma);
    const after: AfterCommit[] = [];
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.patientAccount.findUnique({
        where: { email },
      });
      if (!account) return;
      const token = await this.newToken(tx, account, 'RESET_PASSWORD');
      const links = mails.portalLinks(this.mail.webOrigin);
      after.push(() => this.sendTo(clinic, account.email, mails.resetPassword(clinic, account.firstName, links.reset(token))));
    });
    for (const send of after) send();
  }

  /**
   * Sets a new password from the emailed link. Signs the account out everywhere (whoever knew
   * the old password is out), clears a lock, and counts as confirming the email: only its
   * owner could have opened the link.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const clinic = await findBookingClinic(this.prisma);
    const passwordHash = await hashPassword(newPassword);
    const after: AfterCommit[] = [];
    await this.prisma.$transaction(async (tx) => {
      const account = await this.useToken(tx, token, 'RESET_PASSWORD');
      const now = new Date();
      await tx.patientAccount.update({
        where: { id: account.id },
        data: {
          passwordHash,
          failedLogins: 0,
          lockedUntil: null,
          emailVerifiedAt: account.emailVerifiedAt ?? now,
        },
      });
      // Other reset links sent earlier must not work after this one has.
      await tx.patientToken.updateMany({
        where: { accountId: account.id, purpose: 'RESET_PASSWORD', usedAt: null },
        data: { usedAt: now },
      });
      await tx.patientSession.deleteMany({ where: { accountId: account.id } });
      await recordPatientAudit(tx, account, 'PATIENT_PASSWORD_RESET', {
        entityId: account.id,
        metadata: { emailVerified: !account.emailVerifiedAt },
      });
      if (!account.emailVerifiedAt) await this.releasePendingRequest(tx, clinic, account, after);
    });
    for (const send of after) send();
  }

  /**
   * For the global guard, on every @PatientRoute: 404 BOOKING_NOT_AVAILABLE while online
   * booking is switched off (before even looking at the cookie), then the patient, or null
   * without a valid session.
   */
  async authenticate(token: unknown): Promise<AuthenticatedPatient | null> {
    await findBookingClinic(this.prisma);
    return typeof token === 'string' && token ? this.findSessionPatient(token) : null;
  }

  /**
   * Checked on every patient request. Null for a missing, made-up or expired session.
   */
  async findSessionPatient(token: string): Promise<AuthenticatedPatient | null> {
    const session = await this.prisma.$transaction((tx) =>
      tx.patientSession.findUnique({
        where: { tokenHash: hashToken(token) },
        select: { expiresAt: true, account: { select: { ...ACCOUNT_FIELDS, emailVerifiedAt: true } } },
      }),
    );
    if (!session || session.expiresAt <= new Date()) return null;
    if (!session.account.emailVerifiedAt) return null;
    const { emailVerifiedAt: _verified, birthDate, ...account } = session.account;
    return { ...account, birthDate: birthDate.toISOString().slice(0, 10) };
  }

  /** The current account, fresh from the database: GET /me. */
  async me(patient: AuthenticatedPatient) {
    const account = await this.prisma.$transaction((tx) =>
      tx.patientAccount.findUniqueOrThrow({
        where: { id: patient.id },
        select: ACCOUNT_FIELDS,
      }),
    );
    return toMe(account);
  }

  private async startSession(tx: Prisma.TransactionClient, account: { id: string }, now: Date) {
    const token = randomBytes(32).toString('base64url');
    // A good moment to clear this account's old sessions, since no background job does it.
    await tx.patientSession.deleteMany({
      where: { accountId: account.id, expiresAt: { lte: now } },
    });
    await tx.patientSession.create({
      data: {
        accountId: account.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + PATIENT_SESSION_LIFETIME_MS),
      },
    });
    return token;
  }

  /** A new emailed link. Only its hash is kept; the link itself goes in the email. */
  private async newToken(
    tx: Prisma.TransactionClient,
    account: { id: string },
    purpose: PatientTokenPurpose,
  ) {
    const token = randomBytes(32).toString('base64url');
    const lifetime = purpose === 'VERIFY_EMAIL' ? VERIFY_LIFETIME_MS : RESET_LIFETIME_MS;
    await tx.patientToken.create({
      data: {
        accountId: account.id,
        tokenHash: hashToken(token),
        purpose,
        expiresAt: new Date(Date.now() + lifetime),
      },
    });
    return token;
  }

  /**
   * Uses up an emailed link and returns its account. Any problem (unknown, used, expired, for
   * or for the other purpose) gets the same answer.
   */
  private async useToken(tx: Prisma.TransactionClient, token: string, purpose: PatientTokenPurpose) {
    const found = await tx.patientToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { account: true },
    });
    const now = new Date();
    if (!found || found.purpose !== purpose || found.usedAt || found.expiresAt <= now) {
      throw new BadRequestException(TOKEN_INVALID);
    }
    // "Only if still unused", so two clicks at the same moment can't both use it.
    const { count } = await tx.patientToken.updateMany({
      where: { id: found.id, usedAt: null },
      data: { usedAt: now },
    });
    if (count !== 1) throw new BadRequestException(TOKEN_INVALID);
    return found.account;
  }

  /**
   * Turns the appointment asked for while signing up into a real request, now that the email
   * is confirmed. Dropped if its time has passed meanwhile. A dentist who has since left
   * becomes "any dentist". It may overlap a booking made meanwhile: staff see that as a
   * conflict on the request, like any other.
   */
  private async releasePendingRequest(
    tx: Prisma.TransactionClient,
    clinic: BookingClinic,
    account: PatientAccount,
    after: AfterCommit[],
  ): Promise<PortalAppointment | null> {
    if (account.pendingRequest === null) return null;
    await tx.patientAccount.update({
      where: { id: account.id },
      data: { pendingRequest: Prisma.DbNull },
    });
    const pending = pendingSchema.safeParse(account.pendingRequest);
    if (!pending.success) return null;
    const startsAt = new Date(pending.data.startsAt);
    if (startsAt <= new Date()) return null;
    let dentistId = pending.data.dentistId;
    if (dentistId) {
      try {
        await checkDentist(tx, dentistId);
      } catch {
        dentistId = null;
      }
    }
    const request = await createOnlineRequest(tx, account, {
      startsAt,
      endsAt: new Date(startsAt.getTime() + clinic.defaultVisitMinutes * 60_000),
      dentistId,
      reason: pending.data.reason,
    });
    const links = mails.portalLinks(this.mail.webOrigin);
    after.push(() =>
      this.sendTo(clinic, account.email, mails.requestReceived(clinic, account.firstName, request, links.appointments)),
    );
    return request;
  }

  private sendAlreadyRegistered(clinic: BookingClinic, account: PatientAccount, verifyToken: string | null) {
    const links = mails.portalLinks(this.mail.webOrigin);
    this.sendTo(
      clinic,
      account.email,
      mails.alreadyRegistered(clinic, account.firstName, {
        signIn: links.signIn,
        forgotPassword: links.forgotPassword,
        verify: verifyToken ? links.verify(verifyToken) : null,
      }),
    );
  }

  /** Used by PortalService too, for the "request received" email. */
  sendTo(clinic: BookingClinic, to: string, content: mails.MailContent) {
    this.mail.send({ ...content, from: this.mail.fromFor(clinic.name), to });
  }
}
