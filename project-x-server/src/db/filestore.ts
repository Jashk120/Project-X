import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const DB_PATH = join(process.cwd(), 'data.json')

type ChallengeRecord = { challenge: string, expiresAt: string, usedAt?: string }
type SessionRecord = {
  sessionId: string
  tripId: string
  driverPubkey: string
  riderPubkey: string
  createdAt: string
  expiresAt: string
  completedAt?: string
  signatures: {
    partyA: string | null
    partyB: string | null
  }
}

interface Store {
  regChallenges: Record<string, ChallengeRecord>
  authChallenges: Record<string, ChallengeRecord>
  sessions: Record<string, SessionRecord>
  credentials: Record<string, { credentialId: string, publicKey: string, counter: number, transports: string[] | null, deviceType: string, backedUp: boolean }>
  drivers?: Record<string, { pubkey: string, secretKey: number[], name: string, phone: string }>
}

function read(): Store {
  if (!existsSync(DB_PATH)) return { regChallenges: {}, authChallenges: {}, sessions: {}, credentials: {} }

  const store = JSON.parse(readFileSync(DB_PATH, 'utf-8'))

  return {
    regChallenges: store.regChallenges ?? store.challenges ?? {},
    authChallenges: store.authChallenges ?? {},
    sessions: Object.fromEntries(
      Object.entries(store.sessions ?? {}).map(([sessionId, session]: [string, any]) => [
        sessionId,
        {
          ...session,
          signatures: session.signatures ?? { partyA: null, partyB: null },
        },
      ]),
    ),
    credentials: store.credentials ?? {},
    drivers: store.drivers,
  }
}

function write(store: Store) {
  writeFileSync(DB_PATH, JSON.stringify(store, null, 2))
}

export const filestore = {
  getCredential: (ownerPubkey: string) => read().credentials[ownerPubkey] ?? null,
  
  saveCredential: (ownerPubkey: string, data: Store['credentials'][string]) => {
    const store = read()
    store.credentials[ownerPubkey] = data
    write(store)
  },

  saveRegChallenge: (ownerPubkey: string, data: Store['regChallenges'][string]) => {
    const store = read()
    store.regChallenges[ownerPubkey] = data
    write(store)
  },

  getRegChallenge: (ownerPubkey: string) => {
    const store = read()
    const c = store.regChallenges[ownerPubkey]
    if (!c) return null
    if (new Date(c.expiresAt) < new Date()) return null
    return c
  },

  markRegChallengeUsed: (ownerPubkey: string) => {
    const store = read()
    if (store.regChallenges[ownerPubkey]) {
      store.regChallenges[ownerPubkey].usedAt = new Date().toISOString()
    }
    write(store)
  },

  saveAuthChallenge: (ownerPubkey: string, data: Store['authChallenges'][string]) => {
    const store = read()
    store.authChallenges[ownerPubkey] = data
    write(store)
  },

  getAuthChallenge: (ownerPubkey: string) => {
    const store = read()
    const c = store.authChallenges[ownerPubkey]
    if (!c) return null
    if (new Date(c.expiresAt) < new Date()) return null
    return c
  },

  markAuthChallengeUsed: (ownerPubkey: string) => {
    const store = read()
    if (store.authChallenges[ownerPubkey]) {
      store.authChallenges[ownerPubkey].usedAt = new Date().toISOString()
    }
    write(store)
  },

  getSession: (sessionId: string) => {
    const store = read()
    const session = store.sessions[sessionId]
    if (!session) return null
    if (new Date(session.expiresAt) < new Date()) return null
    return session
  },

  setSession: (sessionId: string, data: Store['sessions'][string]) => {
    const store = read()
    store.sessions[sessionId] = data
    write(store)
  },

  completeSession: (sessionId: string) => {
    const store = read()
    if (store.sessions[sessionId]) {
      store.sessions[sessionId].completedAt = new Date().toISOString()
    }
    write(store)
  }
}
