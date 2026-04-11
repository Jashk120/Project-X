import { Server, Socket } from 'socket.io'
import { filestore } from '../db/filestore'

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
}

type RoomState = {
  sessionId: string
  partyA: string
  partyB: string
  hasPartyA: boolean
  hasPartyB: boolean
}

export const roomState = new Map<string, RoomState>()

function getSessionOrEmit(socket: Socket, sessionId: string) {
  const session = filestore.getSession(sessionId)
  if (!session) {
    socket.emit('session:error', { error: 'session not found or expired' })
    return null
  }

  return session
}

function getExpectedPubkey(
  session: { driverPubkey: string, riderPubkey: string },
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

    socket.on('join', ({ sessionId, pubkey, role }: JoinPayload) => {
      if (!isPartyRole(role)) {
        socket.emit('session:error', { error: 'invalid party role' })
        return
      }

      const session = getSessionOrEmit(socket, sessionId)
      if (!session) return

      if (pubkey !== getExpectedPubkey(session, role)) {
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
      }

      if (role === 'partyA') state.hasPartyA = true
      if (role === 'partyB') state.hasPartyB = true
      roomState.set(sessionId, state)

      console.log(`${role} ${pubkey} joined room: ${sessionId}`)

      if (state.hasPartyA && state.hasPartyB) {
        io.to(sessionId).emit('party:connected')
      }
    })

    socket.on('driver:thumb', ({ sessionId, pubkey, role }: ThumbPayload) => {
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

      console.log(`verification requested by ${role} ${pubkey} in room: ${sessionId}`)

      io.to(sessionId).emit('driver:verifying', {
        pubkey,
        role,
        timestamp: Date.now()
      })
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
