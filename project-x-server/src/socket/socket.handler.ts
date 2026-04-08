import { Server, Socket } from 'socket.io'
import { verifyDriverForRider } from './socket.service'

function getRoomId(driverPubkey: string, riderPubkey: string, identifier: string): string {
  return `${driverPubkey}:${riderPubkey}:${identifier}`
}

interface JoinPayload {
  driverPubkey: string
  riderPubkey: string
  identifier: string
}

interface ThumbPayload {
  driverPubkey: string
  riderPubkey: string
  identifier: string
}

// in-memory room state
const roomState = new Map<string, { hasDriver: boolean, hasRider: boolean }>()

export function registerSocketHandlers(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log('socket connected:', socket.id)

    socket.on('rider:join', ({ driverPubkey, riderPubkey, identifier }: JoinPayload) => {
      const roomId = getRoomId(driverPubkey, riderPubkey, identifier)
      socket.join(roomId)
      socket.data.role = 'rider'
      socket.data.roomId = roomId

      const state = roomState.get(roomId) || { hasDriver: false, hasRider: false }
      state.hasRider = true
      roomState.set(roomId, state)

      console.log(`rider ${riderPubkey} joined room: ${roomId}`)

      if (state.hasDriver) {
        // driver already waiting — tell rider driver is ready
        socket.emit('driver:connected')
        // tell driver rider just joined
        socket.to(roomId).emit('rider:waiting')
      } else {
        // driver not here yet — tell driver when they join
        socket.to(roomId).emit('rider:waiting')
      }
    })

    socket.on('driver:join', ({ driverPubkey, riderPubkey, identifier }: JoinPayload) => {
      const roomId = getRoomId(driverPubkey, riderPubkey, identifier)
      socket.join(roomId)
      socket.data.role = 'driver'
      socket.data.roomId = roomId
      socket.data.driverPubkey = driverPubkey

      const state = roomState.get(roomId) || { hasDriver: false, hasRider: false }
      state.hasDriver = true
      roomState.set(roomId, state)

      console.log(`driver ${driverPubkey} joined room: ${roomId}`)

      if (state.hasRider) {
        // rider already waiting — immediately prompt driver
        socket.emit('rider:waiting')
        // tell rider driver is now connected
        socket.to(roomId).emit('driver:connected')
      } else {
        socket.to(roomId).emit('driver:connected')
      }
    })

    socket.on('driver:thumb', async ({ driverPubkey, riderPubkey, identifier }: ThumbPayload) => {
      const roomId = getRoomId(driverPubkey, riderPubkey, identifier)
      console.log(`thumb pressed by ${driverPubkey} in room: ${roomId}`)

      const result = await verifyDriverForRider(driverPubkey)

      io.to(roomId).emit('verify:result', {
        verified: result.verified,
        reason: result.reason,
        driverPubkey,
        timestamp: Date.now()
      })

      // cleanup room state after verification
      roomState.delete(roomId)
    })

    socket.on('disconnect', () => {
      // cleanup if driver or rider disconnects
      const roomId = socket.data.roomId
      if (roomId) {
        const state = roomState.get(roomId)
        if (state) {
          if (socket.data.role === 'driver') state.hasDriver = false
          if (socket.data.role === 'rider') state.hasRider = false
          if (!state.hasDriver && !state.hasRider) {
            roomState.delete(roomId)
          } else {
            roomState.set(roomId, state)
          }
        }
      }
      console.log('socket disconnected:', socket.id)
    })
  })
}