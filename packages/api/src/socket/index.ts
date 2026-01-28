import type { Server, Socket } from 'socket.io'
import { verifyToken } from '../utils/jwt.js'
import type { JwtPayload } from '@streamvu/shared'
import { setupCallCenterNamespace } from './callCenter.js'

interface AuthenticatedSocket extends Socket {
  user?: JwtPayload
}

export function setupSocketHandlers(io: Server): void {
  // Set up the call center namespace (WebRTC)
  setupCallCenterNamespace(io)
  // Authentication middleware
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token as string

    if (!token) {
      return next(new Error('Authentication required'))
    }

    try {
      const payload = verifyToken(token)
      socket.user = payload
      next()
    } catch {
      next(new Error('Invalid token'))
    }
  })

  io.on('connection', (socket: AuthenticatedSocket) => {
    const user = socket.user!
    console.log(`User ${user.email} connected`)

    // Join account room for targeted broadcasts
    socket.join(`account:${user.organizationId}`)

    socket.on('subscribe:streams', () => {
      // Client wants stream status updates
      socket.join(`streams:${user.organizationId}`)
    })

    socket.on('unsubscribe:streams', () => {
      socket.leave(`streams:${user.organizationId}`)
    })

    socket.on('disconnect', () => {
      console.log(`User ${user.email} disconnected`)
    })
  })
}

// Helper to broadcast stream status updates
export function broadcastStreamStatus(
  io: Server,
  organizationId: string,
  streamId: string,
  status: { isOnline: boolean; bitrate?: number; listeners?: number }
): void {
  io.to(`streams:${organizationId}`).emit('stream:status', {
    streamId,
    ...status,
    timestamp: new Date().toISOString(),
  })
}
