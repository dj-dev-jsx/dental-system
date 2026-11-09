import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { recordAudit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Staff deciding who an online account belongs to. Self-registered accounts are never matched
// to a patient record automatically: anyone can type someone else's name and birth date. Staff
// check with the person (a call, an ID at the desk), then link the account to the right record
// or register them as a new patient. Until then, their requests can't be confirmed.

const ACCOUNT_FIELDS = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  birthDate: true,
  emailVerifiedAt: true,
  createdAt: true,
  patientId: true,
  linkedAt: true,
} satisfies Prisma.PatientAccountSelect;

type AccountRow = Prisma.PatientAccountGetPayload<{ select: typeof ACCOUNT_FIELDS }>;

const toJson = (account: AccountRow) => ({ ...account, birthDate: account.birthDate.toISOString().slice(0, 10) });

type MatchRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  birth_date: Date;
  sex: 'FEMALE' | 'MALE' | null;
  phone: string | null;
  email: string | null;
  same_birth_and_name: boolean;
  same_phone: boolean;
  same_email: boolean;
  has_account: boolean;
};

@Injectable()
export class PatientAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findOne(user: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => toJson(await this.find(tx, user, id)));
  }

  /**
   * Patient records that might be this person, for staff to choose from: the same birth date
   * and a similar last name, or the same phone number, or the same email. At most five, best
   * first. Only a suggestion: nothing is linked until staff choose.
   */
  matches(user: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const account = await this.find(tx, user, id);
      // Names and phones are compared without spaces, dashes or capitals, so "Dela Cruz" finds
      // "delacruz" and "0917 123 4567" finds "0917-123-4567". Phones compare their last 10
      // digits, so +63 917... and 0917... match.
      const lastName = account.lastName.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
      const digits = account.phone.replace(/\D/g, '').slice(-10);
      const rows = await tx.$queryRaw<MatchRow[]>`
        SELECT * FROM (
          SELECT p.id, p.first_name, p.middle_name, p.last_name, p.suffix, p.birth_date, p.sex, p.phone, p.email,
                 (p.birth_date = ${account.birthDate}::date AND (
                    regexp_replace(lower(p.last_name), '[^[:alnum:]]', '', 'g') = ${lastName}::text
                    OR (length(${lastName}::text) >= 3 AND strpos(regexp_replace(lower(p.last_name), '[^[:alnum:]]', '', 'g'), ${lastName}::text) > 0)
                    OR (length(regexp_replace(lower(p.last_name), '[^[:alnum:]]', '', 'g')) >= 3
                        AND strpos(${lastName}::text, regexp_replace(lower(p.last_name), '[^[:alnum:]]', '', 'g')) > 0)
                 )) AS same_birth_and_name,
                 (length(${digits}::text) >= 7 AND right(regexp_replace(coalesce(p.phone, ''), '[^0-9]', '', 'g'), 10) = ${digits}::text) AS same_phone,
                 (lower(p.email) = ${account.email}::text) AS same_email,
                 EXISTS (SELECT 1 FROM patient_accounts pa WHERE pa.patient_id = p.id) AS has_account
          FROM patients p
          WHERE p.archived_at IS NULL
        ) m
        WHERE m.same_birth_and_name OR m.same_phone OR m.same_email
        ORDER BY (m.same_birth_and_name::int + m.same_phone::int + m.same_email::int) DESC, m.last_name, m.first_name, m.id
        LIMIT 5`;
      return {
        items: rows.map((row) => ({
          id: row.id,
          firstName: row.first_name,
          middleName: row.middle_name,
          lastName: row.last_name,
          suffix: row.suffix,
          birthDate: row.birth_date.toISOString().slice(0, 10),
          sex: row.sex,
          phone: row.phone,
          email: row.email,
          // Why it was suggested, so staff know what to check.
          matchedOn: [
            ...(row.same_birth_and_name ? ['BIRTH_DATE_AND_NAME'] : []),
            ...(row.same_phone ? ['PHONE'] : []),
            ...(row.same_email ? ['EMAIL'] : []),
          ],
          // Already linked to another online account: it can't be linked to this one too.
          hasOnlineAccount: row.has_account,
        })),
      };
    });
  }

  /** Links the account to an existing patient record, after staff checked it's them. */
  link(user: AuthenticatedUser, id: string, patientId: string) {
    return this.prisma.$transaction(async (tx) => {
      const account = await this.find(tx, user, id);
      if (account.patientId) throw new ConflictException('ALREADY_LINKED');
      const patient = await tx.patient.findUnique({
        where: { id: patientId },
        select: { archivedAt: true },
      });
      if (!patient) throw new BadRequestException(['patientId: Patient not found']);
      if (patient.archivedAt) throw new ConflictException('PATIENT_ARCHIVED');
      return toJson(await this.connect(tx, user, account, patientId));
    });
  }

  /** Registers the account holder as a new patient, from what they typed, and links them. */
  createPatient(user: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.patientAccount.findUnique({
        where: { id },
        select: { ...ACCOUNT_FIELDS, privacyConsentAt: true },
      });
      if (!account) throw new NotFoundException('Account not found');
      if (account.patientId) throw new ConflictException('ALREADY_LINKED');
      const patient = await tx.patient.create({
        data: {
          firstName: account.firstName,
          lastName: account.lastName,
          birthDate: account.birthDate,
          phone: account.phone,
          email: account.email,
          // They agreed to the privacy notice when they signed up.
          privacyConsentAt: account.privacyConsentAt,
        },
        select: { id: true },
      });
      await recordAudit(tx, user, 'PATIENT_CREATED', { entityId: patient.id, metadata: { fromAccountId: account.id } });
      await this.connect(tx, user, account, patient.id);
      return { patientId: patient.id };
    });
  }

  /**
   * Undoes a link made by mistake. Admins only. Appointments keep the patient they were given:
   * a visit that happened stays in that record.
   */
  unlink(user: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const account = await this.find(tx, user, id);
      if (!account.patientId) throw new ConflictException('NOT_LINKED');
      const updated = await tx.patientAccount.update({
        where: { id },
        data: { patientId: null, linkedAt: null, linkedById: null },
        select: ACCOUNT_FIELDS,
      });
      await recordAudit(tx, user, 'PATIENT_ACCOUNT_UNLINKED', {
        entityId: account.patientId,
        metadata: { accountId: id },
      });
      return toJson(updated);
    });
  }

  private async find(tx: Prisma.TransactionClient, user: AuthenticatedUser, id: string) {
    const account = await tx.patientAccount.findUnique({
      where: { id },
      select: ACCOUNT_FIELDS,
    });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  /** Sets the link, and gives the account's online requests that patient. */
  private async connect(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    account: { id: string },
    patientId: string,
  ) {
    const other = await tx.patientAccount.findUnique({
      where: { patientId },
      select: { id: true },
    });
    if (other) throw new ConflictException('PATIENT_HAS_ACCOUNT');
    // "Only if still unlinked", so two staff linking at the same moment can't both succeed.
    const { count } = await tx.patientAccount
      .updateMany({
        where: { id: account.id, patientId: null },
        data: { patientId, linkedAt: new Date(), linkedById: user.id },
      })
      .catch((error: unknown) => {
        // The unique rule: this patient already has an online account.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('PATIENT_HAS_ACCOUNT');
        }
        throw error;
      });
    if (count !== 1) throw new ConflictException('ALREADY_LINKED');
    const { count: appointments } = await tx.appointment.updateMany({
      where: { patientAccountId: account.id, patientId: null },
      data: { patientId },
    });
    await recordAudit(tx, user, 'PATIENT_ACCOUNT_LINKED', {
      entityId: patientId,
      metadata: { accountId: account.id, appointmentsUpdated: appointments },
    });
    return tx.patientAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: ACCOUNT_FIELDS,
    });
  }
}
