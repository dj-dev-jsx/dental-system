/** Thrown for every failed request. A status of 0 means the server couldn't be reached at all. */
export class ApiError extends Error {
  readonly status: number
  /** The error body the API sent, if any, such as a list of validation messages. */
  readonly details: unknown

  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

let onSessionEnded: (() => void) | null = null

/**
 * Called when any request (other than the login routes) gets 401, meaning the session
 * expired or was ended elsewhere. The auth store uses it to go back to the sign-in screen.
 */
export function setSessionEndedHandler(handler: () => void) {
  onSessionEnded = handler
}

type ApiOptions = Omit<RequestInit, 'body'> & { json?: unknown }

/**
 * Calls our API. Requests go to /api on the same address as the page, which Vite forwards to
 * the API in development. Same address means the login cookie is sent automatically, and
 * its SameSite=Strict setting keeps working.
 */
export async function api<T = void>(path: string, { json, headers, ...init }: ApiOptions = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      ...init,
      headers: json === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
      body: json === undefined ? undefined : JSON.stringify(json),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server')
  }

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) onSessionEnded?.()
    let details: unknown
    try {
      details = await response.json()
    } catch {
      details = undefined // not every error has a JSON body
    }
    throw new ApiError(response.status, response.statusText, details)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** A sentence for the user about a failed request, for the cases every screen shares. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0 || error.status >= 502) {
      return 'Can’t reach the server. Check this computer’s internet connection, then try again.'
    }
    if (error.status === 403) return 'Your role doesn’t allow this. Ask your clinic admin.'
    if (error.status === 404) return 'This record doesn’t exist, or the link is wrong.'
  }
  return 'Something went wrong on our side. Try again in a moment.'
}
