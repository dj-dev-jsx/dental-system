// Small labels for online bookings, used wherever an appointment is listed (see requester.ts).
import { Pill } from '../../components/Table'

/** Booked by the patient on the clinic's booking page. */
export function OnlinePill() {
  return <Pill tone="muted">Online</Pill>
}

/** The person isn't tied to a patient record yet: the name is only what they typed. */
export function NotLinkedPill() {
  return <Pill tone="outline">Not linked</Pill>
}
