/**
 * Bonding Service
 *
 * Server-side handling for bonded connections from contributors.
 * Manages multiple network paths per participant and provides:
 * - Path registration and tracking
 * - Heartbeat handling for latency measurement
 * - Path quality metrics
 * - Failover coordination
 *
 * Uses Socket.IO for WebSocket communication (matches rest of application).
 */

import type { Server, Socket, Namespace } from 'socket.io'
import { EventEmitter } from 'events'
import { verifyToken } from '../utils/jwt.js'

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface BondedPath {
  id: string
  participantId: string
  roomId: string
  socketId: string
  priority: number
  connectedAt: Date
  lastHeartbeat: Date
  stats: PathStats
}

export interface PathStats {
  latency: number
  jitter: number
  packetLoss: number
  messageCount: number
  bytesReceived: number
  bytesSent: number
}

export interface ParticipantBond {
  participantId: string
  roomId: string
  paths: Map<string, BondedPath>
  primaryPathId: string | null
  createdAt: Date
}

// =============================================================================
// Bonding Service
// =============================================================================

class BondingService extends EventEmitter {
  private namespace: Namespace | null = null
  private bonds: Map<string, ParticipantBond> = new Map()
  private pathsBySocketId: Map<string, BondedPath> = new Map()
  private heartbeatCleanupInterval: ReturnType<typeof setInterval> | null = null

  /**
   * Initialize the bonding namespace on Socket.IO
   */
  initialize(io: Server): void {
    if (this.namespace) {
      console.warn('[Bonding] Service already initialized')
      return
    }

    this.namespace = io.of('/bonding')

    // Authentication middleware
    this.namespace.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.query.token
        if (!token || typeof token !== 'string') {
          return next(new Error('Authentication required'))
        }
        await verifyToken(token)
        next()
      } catch {
        next(new Error('Invalid token'))
      }
    })

    this.namespace.on('connection', (socket) => {
      this.handleConnection(socket)
    })

    // Cleanup stale paths every 10 seconds
    this.heartbeatCleanupInterval = setInterval(() => {
      this.cleanupStalePaths()
    }, 10000)

    console.log('[Bonding] Service initialized on /bonding namespace')
  }

  /**
   * Shutdown the bonding service
   */
  shutdown(): void {
    if (this.heartbeatCleanupInterval) {
      clearInterval(this.heartbeatCleanupInterval)
      this.heartbeatCleanupInterval = null
    }

    if (this.namespace) {
      this.namespace.disconnectSockets(true)
    }

    this.bonds.clear()
    this.pathsBySocketId.clear()

    console.log('[Bonding] Service shutdown')
  }

  /**
   * Get all paths for a participant
   */
  getParticipantPaths(participantId: string): BondedPath[] {
    const bond = this.bonds.get(participantId)
    return bond ? Array.from(bond.paths.values()) : []
  }

  /**
   * Get primary path for a participant
   */
  getPrimaryPath(participantId: string): BondedPath | null {
    const bond = this.bonds.get(participantId)
    if (!bond || !bond.primaryPathId) return null
    return bond.paths.get(bond.primaryPathId) ?? null
  }

  /**
   * Send a message to a participant via their primary path
   */
  sendToParticipant(participantId: string, event: string, data: unknown): boolean {
    if (!this.namespace) return false

    const primaryPath = this.getPrimaryPath(participantId)
    if (primaryPath) {
      this.namespace.to(primaryPath.socketId).emit(event, data)
      return true
    }

    // Try any available path
    const paths = this.getParticipantPaths(participantId)
    const firstPath = paths[0]
    if (firstPath && this.namespace) {
      this.namespace.to(firstPath.socketId).emit(event, data)
      return true
    }

    return false
  }

  /**
   * Broadcast to all paths of a participant (for redundancy)
   */
  broadcastToParticipant(participantId: string, event: string, data: unknown): number {
    if (!this.namespace) return 0

    const paths = this.getParticipantPaths(participantId)
    let sent = 0
    for (const path of paths) {
      this.namespace.to(path.socketId).emit(event, data)
      sent++
    }
    return sent
  }

  /**
   * Get statistics for all participants in a room
   */
  getRoomStats(roomId: string): Array<{
    participantId: string
    pathCount: number
    primaryPathId: string | null
    totalLatency: number
    avgLatency: number
  }> {
    const stats: Array<{
      participantId: string
      pathCount: number
      primaryPathId: string | null
      totalLatency: number
      avgLatency: number
    }> = []

    for (const bond of this.bonds.values()) {
      if (bond.roomId !== roomId) continue

      const paths = Array.from(bond.paths.values())
      const totalLatency = paths.reduce((sum, p) => sum + p.stats.latency, 0)

      stats.push({
        participantId: bond.participantId,
        pathCount: paths.length,
        primaryPathId: bond.primaryPathId,
        totalLatency,
        avgLatency: paths.length > 0 ? totalLatency / paths.length : 0,
      })
    }

    return stats
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private handleConnection(socket: Socket): void {
    const roomId = socket.handshake.query.room as string
    const participantId = socket.handshake.query.participant as string
    const pathId = socket.handshake.query.path as string

    if (!roomId || !participantId || !pathId) {
      socket.disconnect(true)
      return
    }

    // Create or get participant bond
    let bond = this.bonds.get(participantId)
    if (!bond) {
      bond = {
        participantId,
        roomId,
        paths: new Map(),
        primaryPathId: null,
        createdAt: new Date(),
      }
      this.bonds.set(participantId, bond)
    }

    // Create path
    const path: BondedPath = {
      id: pathId,
      participantId,
      roomId,
      socketId: socket.id,
      priority: bond.paths.size,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      stats: {
        latency: 0,
        jitter: 0,
        packetLoss: 0,
        messageCount: 0,
        bytesReceived: 0,
        bytesSent: 0,
      },
    }

    bond.paths.set(pathId, path)
    this.pathsBySocketId.set(socket.id, path)

    // Set as primary if first path
    if (!bond.primaryPathId) {
      bond.primaryPathId = pathId
    }

    // Join room for broadcasts
    socket.join(`room:${roomId}`)
    socket.join(`participant:${participantId}`)

    console.log(`[Bonding] Path ${pathId} connected for participant ${participantId} in room ${roomId}`)
    this.emit('pathConnected', path)

    // Handle heartbeat
    socket.on('heartbeat', (data: { seq: number; timestamp: number }) => {
      this.handleHeartbeat(path, socket, data)
    })

    // Handle disconnect
    socket.on('disconnect', () => {
      this.handleDisconnect(path)
    })
  }

  private handleHeartbeat(
    path: BondedPath,
    socket: Socket,
    data: { seq: number; timestamp: number }
  ): void {
    const now = Date.now()
    const rtt = now - data.timestamp

    // Calculate jitter
    const jitter = Math.abs(rtt - path.stats.latency)

    // Update path stats
    path.stats.latency = rtt
    path.stats.jitter = (path.stats.jitter * 0.9) + (jitter * 0.1) // Smoothed jitter
    path.stats.messageCount++
    path.lastHeartbeat = new Date()

    // Send ack
    socket.emit('heartbeat-ack', {
      seq: data.seq,
      serverTime: now,
      pathLatency: rtt,
    })

    // Check if this path should become primary
    this.checkPrimaryPath(path)
  }

  private checkPrimaryPath(path: BondedPath): void {
    const bond = this.bonds.get(path.participantId)
    if (!bond) return

    const currentPrimary = bond.primaryPathId ? bond.paths.get(bond.primaryPathId) : null

    // Switch to this path if:
    // 1. No current primary
    // 2. This path has significantly better latency
    if (!currentPrimary) {
      bond.primaryPathId = path.id
      this.emit('primaryPathChanged', { bond, newPath: path, oldPath: null })
    } else if (path.stats.latency < currentPrimary.stats.latency * 0.7 && path.stats.latency < 100) {
      // 30% better latency and under 100ms
      bond.primaryPathId = path.id
      this.emit('primaryPathChanged', { bond, newPath: path, oldPath: currentPrimary })
    }
  }

  private handleDisconnect(path: BondedPath): void {
    const bond = this.bonds.get(path.participantId)

    this.pathsBySocketId.delete(path.socketId)

    if (bond) {
      bond.paths.delete(path.id)

      // Select new primary if needed
      if (bond.primaryPathId === path.id) {
        const remainingPaths = Array.from(bond.paths.values())
          .sort((a, b) => a.stats.latency - b.stats.latency)

        bond.primaryPathId = remainingPaths[0]?.id ?? null
      }

      // Remove bond if no paths left
      if (bond.paths.size === 0) {
        this.bonds.delete(path.participantId)
        this.emit('participantDisconnected', { participantId: path.participantId, roomId: path.roomId })
      }
    }

    console.log(`[Bonding] Path ${path.id} disconnected for participant ${path.participantId}`)
    this.emit('pathDisconnected', path)
  }

  private cleanupStalePaths(): void {
    const staleThreshold = Date.now() - 30000 // 30 seconds

    for (const [socketId, path] of this.pathsBySocketId) {
      if (path.lastHeartbeat.getTime() < staleThreshold) {
        console.log(`[Bonding] Cleaning up stale path ${path.id}`)
        this.namespace?.sockets.get(socketId)?.disconnect(true)
      }
    }
  }
}

// Export singleton instance
export const bondingService = new BondingService()
export default bondingService
