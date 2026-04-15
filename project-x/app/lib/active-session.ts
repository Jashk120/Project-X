'use client'

import { API_BASE_URL } from './webauthn'

type SessionResponse = {
  sessionId: string
  driverPubkey: string
  riderPubkey: string | null
  expiresAt: string
  error?: string
}

const ACTIVE_TRIP_ID = 'active-trip'
const SESSION_ID_OPTIONS = [ACTIVE_TRIP_ID, `${ACTIVE_TRIP_ID}-1`, `${ACTIVE_TRIP_ID}-2`] as const
const SESSION_ID_KEY = 'project_x_session_id'
const PLATFORM_API_KEY = process.env.NEXT_PUBLIC_PLATFORM_API_KEY

function getPlatformApiKey(): string {
  if (!PLATFORM_API_KEY) {
    throw new Error('NEXT_PUBLIC_PLATFORM_API_KEY is required')
  }

  return PLATFORM_API_KEY
}

function getSessionUrl(sessionId: string) {
  return `${API_BASE_URL}/session/${sessionId}`
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  return text ? JSON.parse(text) as T : {} as T
}

export function getStoredSessionId() {
  if (typeof window === 'undefined') {
    return ACTIVE_TRIP_ID
  }

  const stored = window.localStorage.getItem(SESSION_ID_KEY)
  return stored && SESSION_ID_OPTIONS.includes(stored as typeof SESSION_ID_OPTIONS[number])
    ? stored
    : ACTIVE_TRIP_ID
}

export function storeSessionId(sessionId: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(SESSION_ID_KEY, sessionId)
}

async function createSession(sessionId: string, driverPubkey: string) {
  const response = await fetch(`${API_BASE_URL}/session/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Project-X-Platform-Key': getPlatformApiKey(),
    },
    body: JSON.stringify({
      tripId: sessionId,
      driverPubkey,
    }),
  })
  const data = await parseJson<SessionResponse & { error?: string }>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to create session')
  }

  return data
}

export async function closeSession(sessionId: string) {
  const response = await fetch(`${API_BASE_URL}/session/close`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Project-X-Platform-Key': getPlatformApiKey(),
    },
    body: JSON.stringify({ sessionId }),
  })
  const data = await parseJson<SessionResponse & { error?: string }>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to close session')
  }

  return data
}

export async function ensureDriverSession(sessionId: string, driverPubkey: string) {
  const sessionResponse = await fetch(getSessionUrl(sessionId))
  if (sessionResponse.ok) {
    const session = await parseJson<SessionResponse>(sessionResponse)
    if (session.driverPubkey !== driverPubkey) {
      throw new Error('session already belongs to a different driver')
    }

    return session
  }

  const sessionData = await parseJson<{ error?: string }>(sessionResponse)
  if (sessionData.error && sessionData.error !== 'session not found or expired') {
    throw new Error(sessionData.error)
  }

  return createSession(sessionId, driverPubkey)
}

export async function joinRiderSession(sessionId: string, riderPubkey: string) {
  const response = await fetch(`${API_BASE_URL}/session/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionId,
      riderPubkey,
    }),
  })
  const data = await parseJson<SessionResponse & { error?: string }>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to join session')
  }

  return data
}

export { ACTIVE_TRIP_ID, SESSION_ID_OPTIONS }
