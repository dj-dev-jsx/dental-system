import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { Resend } from 'resend';

/** One email, ready to send. `kind` names it in logs, so addresses and contents never need to be. */
export type OutgoingMail = {
  kind: string;
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

/**
 * Sends email, one of three ways, chosen once at startup:
 *  - memory: kept in `outbox` for the tests to read. Nothing leaves the computer.
 *  - Resend (resend.com), when RESEND_API_KEY is set. Required in production.
 *  - SMTP otherwise, to Mailpit in development (http://localhost:8025 shows what was "sent"),
 *    so trying the app never emails a real person.
 *
 * Sending never makes a request fail: the caller has already saved its work, and an email
 * that didn't go out is logged for someone to look into. Call it after the transaction
 * commits, so nobody is told about a change that was then undone.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  /** Every message "sent" with the memory transport. Tests read and empty it. */
  readonly outbox: OutgoingMail[] = [];
  /** Where the links in emails point: the web app. */
  readonly webOrigin: string;
  private readonly mode: 'memory' | 'resend' | 'smtp';
  private readonly fromSetting: string | undefined;
  private readonly resend?: Resend;
  private readonly smtp?: Transporter;

  constructor(config: ConfigService) {
    const production = config.get('NODE_ENV') === 'production';
    const apiKey = config.get<string>('RESEND_API_KEY') || undefined;
    this.fromSetting = config.get<string>('MAIL_FROM') || undefined;
    const webOrigin = config.get<string>('WEB_ORIGIN') || undefined;

    // The tests ask for this, and it wins over everything else: a test must never send real
    // email, even on a computer whose .env has a Resend key in it.
    if (config.get('MAIL_TRANSPORT') === 'memory') {
      this.mode = 'memory';
    } else if (apiKey) {
      this.mode = 'resend';
      this.resend = new Resend(apiKey);
    } else if (production) {
      throw new Error('RESEND_API_KEY must be set in production, so emails can be sent.');
    } else {
      this.mode = 'smtp';
      this.smtp = createTransport(config.get<string>('SMTP_URL') || 'smtp://localhost:1025');
    }
    if (production && !this.fromSetting) {
      // Resend only sends from a domain the clinic has verified with it.
      throw new Error('MAIL_FROM must be set in production, like "Clinic Name <bookings@clinic.ph>".');
    }
    if (production && !webOrigin) {
      throw new Error('WEB_ORIGIN must be set in production, so links in emails work.');
    }
    this.webOrigin = (webOrigin ?? 'http://localhost:5173').replace(/\/+$/, '');
  }

  /**
   * The sender. MAIL_FROM may be a whole "Name <address>", used as it is, or just an address,
   * which is then shown under the clinic's name. Without it (development only) the address is
   * no-reply@localhost.
   */
  fromFor(clinicName: string) {
    if (this.fromSetting?.includes('<')) return this.fromSetting;
    // Quotes and angle brackets would break the header, so they're left out of the name.
    const name = clinicName.replace(/["<>\\\r\n]/g, '').trim();
    return `"${name}" <${this.fromSetting ?? 'no-reply@localhost'}>`;
  }

  /** Starts sending and returns at once. A failure is logged, never thrown. */
  send(mail: OutgoingMail): void {
    if (this.mode === 'memory') {
      this.outbox.push(mail);
      return;
    }
    void this.deliver(mail).catch((error: unknown) => {
      // Only the kind of email and the error: never the address, the contents or the key.
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not send the "${mail.kind}" email: ${reason}`);
    });
  }

  private async deliver({ from, to, subject, text, html }: OutgoingMail) {
    if (this.resend) {
      // The Resend library doesn't throw when Resend refuses a message: it returns the reason.
      const { error } = await this.resend.emails.send({ from, to, subject, text, html });
      if (error) throw new Error(`${error.name}: ${error.message}`);
      return;
    }
    await this.smtp!.sendMail({ from, to, subject, text, html });
  }
}
