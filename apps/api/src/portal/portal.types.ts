import type { Request } from 'express';

/** A different name from the staff cookie, so neither kind of login can be mistaken for the other. */
export const PATIENT_SESSION_COOKIE = 'patient_session';

/** The patient signed in to online booking. */
export type AuthenticatedPatient = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  /** 'YYYY-MM-DD' */
  birthDate: string;
  /** The patient record staff linked this account to, or null. */
  patientId: string | null;
};

export type PatientRequest = Request & { patient: AuthenticatedPatient };
