import { manilaDate, manilaTime } from '../common/manila.js';

// The emails patients get from online booking. Each is plain text plus simple HTML (some mail
// apps show only one of the two), with the clinic's name, address and phone at the bottom so
// the patient can always call. Nothing here goes into logs.

export type MailClinic = {
  name: string;
  address: string | null;
  phone: string | null;
};

export type MailAppointment = {
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
  statusNote: string | null;
  dentist: { firstName: string; lastName: string } | null;
};

export type MailContent = { kind: string; subject: string; text: string; html: string };

type Draft = {
  kind: string;
  subject: string;
  greeting: string;
  paragraphs: string[];
  action?: { label: string; url: string } | null;
  after?: string[];
};

/** Stops a name like "<b>Ana</b>" from turning into HTML. */
function escape(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(clinic: MailClinic, draft: Draft): MailContent {
  const footer = [clinic.name, clinic.address, clinic.phone].filter(Boolean) as string[];
  const text = [
    draft.greeting,
    '',
    ...draft.paragraphs.flatMap((p) => [p, '']),
    ...(draft.action ? [`${draft.action.label}: ${draft.action.url}`, ''] : []),
    ...(draft.after ?? []).flatMap((p) => [p, '']),
    '--',
    ...footer,
  ].join('\n');
  const para = (p: string) => `<p style="margin:0 0 16px">${escape(p)}</p>`;
  const html = [
    '<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">',
    '<div style="max-width:560px;margin:0 auto">',
    `<p style="margin:0 0 24px;font-size:20px;font-weight:bold">${escape(clinic.name)}</p>`,
    para(draft.greeting),
    ...draft.paragraphs.map(para),
    draft.action
      ? `<p style="margin:24px 0"><a href="${escape(draft.action.url)}" style="display:inline-block;padding:12px 20px;background:#111111;color:#ffffff;text-decoration:none;border-radius:6px">${escape(draft.action.label)}</a></p>` +
        `<p style="margin:0 0 16px;font-size:13px;color:#555555">Or copy this link into your browser: ${escape(draft.action.url)}</p>`
      : '',
    ...(draft.after ?? []).map(para),
    `<hr style="border:none;border-top:1px solid #dddddd;margin:32px 0 16px">`,
    `<p style="margin:0;font-size:13px;color:#555555">${footer.map(escape).join('<br>')}</p>`,
    '</div></body></html>',
  ].join('');
  return { kind: draft.kind, subject: draft.subject, text, html };
}

/** Where each link in an email goes, on the web app. */
export function portalLinks(webOrigin: string) {
  return {
    verify: (token: string) => `${webOrigin}/verify?token=${encodeURIComponent(token)}`,
    reset: (token: string) => `${webOrigin}/reset-password?token=${encodeURIComponent(token)}`,
    signIn: `${webOrigin}/sign-in`,
    forgotPassword: `${webOrigin}/forgot-password`,
    appointments: `${webOrigin}/appointments`,
    book: `${webOrigin}/book`,
  };
}

function when(a: Pick<MailAppointment, 'startsAt' | 'endsAt'>) {
  return `${manilaDate(a.startsAt)}, ${manilaTime(a.startsAt)} to ${manilaTime(a.endsAt)}`;
}

function withDentist(a: MailAppointment) {
  return a.dentist ? `with Dr. ${a.dentist.firstName} ${a.dentist.lastName}` : 'with any available dentist';
}

const hi = (firstName: string) => `Hi ${firstName},`;
const action = (label: string, url: string | null) => (url ? { label, url } : null);
const IGNORE = 'If you didn’t ask for this, you can ignore this email.';

export function verifyEmail(clinic: MailClinic, firstName: string, url: string | null) {
  return render(clinic, {
    kind: 'verify-email',
    subject: `Confirm your email for ${clinic.name}`,
    greeting: hi(firstName),
    paragraphs: [
      `Thanks for signing up to book online with ${clinic.name}. Please confirm your email address. If you asked for an appointment, we’ll send your request to the clinic as soon as you do.`,
      'The link works for 24 hours.',
    ],
    action: action('Confirm my email', url),
    after: [IGNORE],
  });
}

export function alreadyRegistered(
  clinic: MailClinic,
  firstName: string,
  links: { signIn: string | null; forgotPassword: string | null; verify: string | null },
) {
  return render(clinic, {
    kind: 'already-registered',
    subject: `You already have an account with ${clinic.name}`,
    greeting: hi(firstName),
    paragraphs: [
      'Someone tried to sign up for online booking with this email address, but you already have an account. Nothing was changed.',
      links.verify
        ? 'You haven’t confirmed this email address yet. Confirm it with the button below, then sign in to book. The link works for 24 hours.'
        : 'To book, sign in. If you don’t remember your password, you can set a new one.',
    ],
    action: links.verify ? action('Confirm my email', links.verify) : action('Sign in', links.signIn),
    after: [
      ...(links.forgotPassword ? [`Forgot your password? ${links.forgotPassword}`] : []),
      IGNORE,
    ],
  });
}

export function resetPassword(clinic: MailClinic, firstName: string, url: string | null) {
  return render(clinic, {
    kind: 'reset-password',
    subject: `Set a new password for ${clinic.name}`,
    greeting: hi(firstName),
    paragraphs: [
      'We got a request to set a new password for your online booking account. The link works for 1 hour, and only once.',
    ],
    action: action('Set a new password', url),
    after: ['If you didn’t ask for this, you can ignore this email: your password stays the same.'],
  });
}

export function requestReceived(clinic: MailClinic, firstName: string, a: MailAppointment, url: string | null) {
  return render(clinic, {
    kind: 'request-received',
    subject: `We received your appointment request`,
    greeting: hi(firstName),
    paragraphs: [
      `Thank you. ${clinic.name} received your request for ${when(a)}, ${withDentist(a)}.`,
      'This is a request, not a booking yet: the clinic will confirm it, suggest another time, or let you know if they can’t see you then. We’ll email you when they answer.',
    ],
    action: action('See my appointments', url),
  });
}

export function appointmentConfirmed(clinic: MailClinic, firstName: string, a: MailAppointment, url: string | null) {
  return render(clinic, {
    kind: 'appointment-confirmed',
    subject: `Your appointment is confirmed: ${manilaDate(a.startsAt)}`,
    greeting: hi(firstName),
    paragraphs: [
      `Your appointment at ${clinic.name} is confirmed for ${when(a)}, ${withDentist(a)}.`,
      'If you can’t come, please cancel it or call the clinic, so someone else can have the time.',
    ],
    action: action('See my appointments', url),
  });
}

export function appointmentDeclined(clinic: MailClinic, firstName: string, a: MailAppointment, url: string | null) {
  return render(clinic, {
    kind: 'appointment-declined',
    subject: `About your appointment request`,
    greeting: hi(firstName),
    paragraphs: [
      `${clinic.name} can’t see you at the time you asked for (${when(a)}).`,
      ...(a.statusNote ? [`Message from the clinic: ${a.statusNote}`] : []),
      'You’re welcome to ask for another time, or call the clinic.',
    ],
    action: action('Book another time', url),
  });
}

export function appointmentCancelled(clinic: MailClinic, firstName: string, a: MailAppointment, url: string | null) {
  return render(clinic, {
    kind: 'appointment-cancelled',
    subject: `Your appointment was cancelled`,
    greeting: hi(firstName),
    paragraphs: [
      `Your appointment at ${clinic.name} on ${when(a)} was cancelled.`,
      ...(a.statusNote ? [`Message from the clinic: ${a.statusNote}`] : []),
      'If this is unexpected, please call the clinic.',
    ],
    action: action('See my appointments', url),
  });
}

export function appointmentChanged(clinic: MailClinic, firstName: string, a: MailAppointment, url: string | null) {
  return render(clinic, {
    kind: 'appointment-changed',
    subject: `Your appointment was changed`,
    greeting: hi(firstName),
    paragraphs: [
      `${clinic.name} changed your appointment. It is now on ${when(a)}, ${withDentist(a)}.`,
      'If this time doesn’t work for you, please call the clinic or cancel it.',
    ],
    action: action('See my appointments', url),
  });
}
