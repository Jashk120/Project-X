'use client'

import { API_BASE_URL } from './webauthn'

type UsersStore = {
  driver: string | null
  rider: string | null
}

type SessionResponse = {
  sessionId: string
  driverPubkey: string
  riderPubkey: string
  expiresAt: string
  error?: string
}

const ACTIVE_TRIP_ID = 'active-trip'
const PLATFORM_API_KEY = process.env.NEXT_PUBLIC_PLATFORM_API_KEY

function getPlatformApiKey(): string {
  if (!PLATFORM_API_KEY) {
    throw new Error('NEXT_PUBLIC_PLATFORM_API_KEY is required')
  }

  return PLATFORM_API_KEY
}

const SESSION_URL = `${API_BASE_URL}/session/${ACTIVE_TRIP_ID}`
const SESSION_CREATE_URL = `${API_BASE_URL}/session/create`

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  return text ? JSON.parse(text) as T : {} as T
}

export async function fetchUsers() {
  const response = await fetch('/api/users')
  const data = await parseJson<UsersStore & { error?: string }>(response)

  if (!response.ok) {
    throw new Error(data.error || 'Failed to load users')
  }

  return data
}

export async function ensureActiveTripSession(users: UsersStore) {
  if (!users.driver || !users.rider) {
    throw new Error('Both driver and rider must be registered before starting the active trip')
  }

  const sessionResponse = await fetch(SESSION_URL)
  if (sessionResponse.ok) {
    return parseJson<SessionResponse>(sessionResponse)
  }

  const sessionData = await parseJson<{ error?: string }>(sessionResponse)
  if (sessionData.error && sessionData.error !== 'session not found or expired') {
    throw new Error(sessionData.error)
  }

  const createResponse = await fetch(SESSION_CREATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Project-X-Platform-Key': getPlatformApiKey(),
    },
    body: JSON.stringify({
      tripId: ACTIVE_TRIP_ID,
      driverPubkey: users.driver,
      riderPubkey: users.rider,
    }),
  })
  const createData = await parseJson<SessionResponse & { error?: string }>(createResponse)

  if (!createResponse.ok) {
    throw new Error(createData.error || 'Failed to create active trip session')
  }

  return createData
}

export { ACTIVE_TRIP_ID }
