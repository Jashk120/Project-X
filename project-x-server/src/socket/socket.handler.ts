import { Server, Socket } from 'socket.io'
import { getSession } from '../db/store'
import { areBothSigned } from '../modules/session/session.service'
import { attestProximity } from '../modules/proximity/proximity.service'
import { verify } from '../modules/solana/solana.service'

type PartyRole = 'partyA' | 'partyB'

interface JoinPayload {
  sessionId: string
  pubkey: string
  role: PartyRole
}

interface ThumbPayload {
  sessionId: string
  pubkey: string
  role: PartyRole
  coords: {
    lat: number
    lng: number
    accuracy?: number
  }
  timestamp: string
}

type RoomState = {
  sessionId: string
  partyA: string
  partyB: string | null
  hasPartyA: boolean
  hasPartyB: boolean
  latestThumbs: Partial<Record<PartyRole, ThumbPayload>>
  verificationInFlight?: boolean
}

export const roomState = new Map<string, RoomState>()

function emitVerifyResult(
  io: Server,
  sessionId: string,
  driverPubkey: string,
  result: { verified: boolean, reason: string },
) {
  io.to(sessionId).emit('verify:result', {
    ...result,
    driverPubkey,
    timestamp: Date.now(),
  })
}

async function getSessionOrEmit(socket: Socket, sessionId: string) {
  const session = await getSession(sessionId)
  if (!session) {
    socket.emit('session:error', { error: 'session not found or expired' })
    return null
  }

  return session
}

function getExpectedPubkey(
  session: { driverPubkey: string, riderPubkey: string | null },
  role: PartyRole,
) {
  return role === 'partyA' ? session.driverPubkey : session.riderPubkey
}

function isPartyRole(role: string): role is PartyRole {
  return role === 'partyA' || role === 'partyB'
}

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log('socket connected:', socket.id)

    socket.on('join', async ({ sessionId, pubkey, role }: JoinPayload) => {
      if (!isPartyRole(role)) {
        socket.emit('session:error', { error: 'invalid party role' })
        return
      }

      const session = await getSessionOrEmit(socket, sessionId)
      if (!session) return

      const expectedPubkey = getExpectedPubkey(session, role)
      if (!expectedPubkey || pubkey !== expectedPubkey) {
        socket.emit('session:error', { error: `${role} pubkey does not match session` })
        return
      }

      socket.join(sessionId)
      socket.data.role = role
      socket.data.roomId = sessionId

      const state = roomState.get(sessionId) || {
        sessionId,
        partyA: session.driverPubkey,
        partyB: session.riderPubkey,
        hasPartyA: false,
        hasPartyB: false,
        latestThumbs: {},
      }

      // Refresh expected identities from the durable session record so a driver who
      // joined before the rider was attached does not keep a stale/null partyB.
      state.partyA = session.driverPubkey
      state.partyB = session.riderPubkey

      if (role === 'partyA') state.hasPartyA = true
      if (role === 'partyB') state.hasPartyB = true
      roomState.set(sessionId, state)

      console.log(`${role} ${pubkey} joined room: ${sessionId}`)

      if (state.hasPartyA && state.hasPartyB) {
        io.to(sessionId).emit('party:connected')
      }
    })

    socket.on('driver:thumb', async ({ sessionId, pubkey, role, coords, timestamp }: ThumbPayload) => {
      if (!isPartyRole(role)) {
        socket.emit('session:error', { error: 'invalid party role' })
        return
      }

      const state = roomState.get(sessionId)
      if (!state) {
        socket.emit('session:error', { error: 'session room not found' })
        return
      }

      const expectedPubkey = role === 'partyA' ? state.partyA : state.partyB
      if (pubkey !== expectedPubkey) {
        socket.emit('session:error', { error: `${role} pubkey does not match session` })
        return
      }

      state.latestThumbs[role] = { sessionId, pubkey, role, coords, timestamp }
      roomState.set(sessionId, state)

      console.log(`verification requested by ${role} ${pubkey} in room: ${sessionId}`)

      if (role === 'partyA') {
        io.to(sessionId).emit('driver:verifying', {
          pubkey,
          role,
          timestamp: Date.now()
        })
      }

      const driverThumb = state.latestThumbs.partyA
      const riderThumb = state.latestThumbs.partyB
      if (!driverThumb || !riderThumb || !(await areBothSigned(sessionId))) {
        return
      }

      if (state.verificationInFlight) {
        return
      }

      state.verificationInFlight = true
      roomState.set(sessionId, state)

      try {
        const attestation = await attestProximity({
          sessionId,
          driver: {
            pubkey: driverThumb.pubkey,
            coords: driverThumb.coords,
            timestamp: driverThumb.timestamp,
          },
          rider: {
            pubkey: riderThumb.pubkey,
            coords: riderThumb.coords,
            timestamp: riderThumb.timestamp,
          },
        })

        if (attestation.result !== 'approved') {
          emitVerifyResult(io, sessionId, state.partyA, {
            verified: false,
            reason: 'proximity check failed',
          })
          return
        }

        if (!state.partyB) {
          throw new Error('session rider missing')
        }

        await verify(state.partyA, state.partyB, sessionId)
        emitVerifyResult(io, sessionId, state.partyA, {
          verified: true,
          reason: 'verified',
        })
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'verification failed'
        emitVerifyResult(io, sessionId, state.partyA, {
          verified: false,
          reason,
        })
      } finally {
        state.verificationInFlight = false
        roomState.set(sessionId, state)
      }
    })

    socket.on('disconnect', () => {
      // cleanup if driver or rider disconnects
      const sessionId = socket.data.roomId
      if (sessionId) {
        const state = roomState.get(sessionId)
        if (state) {
          if (socket.data.role === 'partyA') state.hasPartyA = false
          if (socket.data.role === 'partyB') state.hasPartyB = false
          if (!state.hasPartyA && !state.hasPartyB) {
            roomState.delete(sessionId)
          } else {
            roomState.set(sessionId, state)
          }
        }
      }
      console.log('socket disconnected:', socket.id)
    })
  })
}
