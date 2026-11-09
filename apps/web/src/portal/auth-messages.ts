import { ApiError } from '../lib/api'
import { commonMessage } from './api'

export const EMAIL_RATE_LIMITED =
  'You’ve asked for this email a few times in a short while. Wait 10 minutes, then try again. Check your spam or promotions folder in the meantime.'

/** Why a sign-in failed, in words. The server answers every wrong try the same way, on purpose. */
export function signInMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'That email and password don’t match an account here. After 5 wrong tries, the account locks for 15 minutes.'
    }
    if (error.status === 429) return 'Too many tries from this device. Wait a minute, then try again.'
    if (error.status === 400) return 'Enter your email address and your password.'
  }
  return commonMessage(error)
}

export const isUnverified = (error: unknown) =>
  error instanceof ApiError && error.status === 403 && (error.details as { message?: unknown } | undefined)?.message === 'EMAIL_NOT_VERIFIED'
