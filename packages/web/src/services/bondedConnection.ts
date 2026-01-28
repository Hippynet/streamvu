/**
 * Bonded Connection Service
 *
 * Aggregates multiple network paths for reliable contribution.
 * Monitors path quality and provides automatic failover.
 *
 * Architecture:
 * Contributor Device
 *     ├── WiFi ────────┐
 *     ├── Cellular ────┼──→ StreamVU Server
 *     └── Ethernet ────┘
 *
 * Features:
 * - Multiple simultaneous Socket.IO connections
 * - Path quality monitoring (latency, jitter, packet loss)
 * - Automatic failover when primary path degrades
 * - Combined bandwidth display
 * - Per-path statistics
 */

import { io, type Socket } from 'socket.io-client'

// =============================================================================
// Types & Interfaces
// =============================================================================

export interface NetworkPath {
  id: string
  name: string
  type: 'wifi' | 'cellular' | 'ethernet' | 'unknown'
  priority: number // Lower = higher priority
  isActive: boolean
  isConnected: boolean
  stats: PathStats
  socket: Socket | null
  lastHeartbeat: number
}

export interface PathStats {
  latency: number // ms (RTT)
  jitter: number // ms
  packetLoss: number // percentage
  bandwidth: number // kbps (estimated)
  lastUpdated: number
  sampleCount: number
  latencyHistory: number[]
}

export interface BondedConnectionConfig {
  serverUrl: string
  roomId: string
  participantId: string
  token: string
  heartbeatInterval?: number // ms, default 1000
  failoverThreshold?: number // latency ms to trigger failover, default 500
  maxLatencyHistory?: number // samples to keep, default 30
}

export interface BondedConnectionStats {
  activePaths: number
  connectedPaths: number
  totalBandwidth: number
  primaryPath: string | null
  primaryLatency: number
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor' | 'disconnected'
  paths: NetworkPath[]
}

type EventCallback = (...args: unknown[]) => void

// =============================================================================
// BondedConnection Class
// =============================================================================

export class BondedConnection {
  private config: Required<BondedConnectionConfig>
  private paths: Map<string, NetworkPath> = new Map()
  private primaryPathId: string | null = null
  private heartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map()
  private isRunning = false
  private messageSequence = 0
  private eventListeners: Map<string, Set<EventCallback>> = new Map()

  constructor(config: BondedConnectionConfig) {
    this.config = {
      ...config,
      heartbeatInterval: config.heartbeatInterval ?? 1000,
      failoverThreshold: config.failoverThreshold ?? 500,
      maxLatencyHistory: config.maxLatencyHistory ?? 30,
    }
  }

  // ===========================================================================
  // Event Emitter Methods
  // ===========================================================================

  on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set())
    }
    this.eventListeners.get(event)!.add(callback)
  }

  off(event: string, callback: EventCallback): void {
    this.eventListeners.get(event)?.delete(callback)
  }

  private emit(event: string, ...args: unknown[]): void {
    this.eventListeners.get(event)?.forEach(cb => cb(...args))
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Add a network path to the bonded connection
   */
  addPath(options: {
    id: string
    name: string
    type: NetworkPath['type']
    priority: number
  }): void {
    if (this.paths.has(options.id)) {
      console.warn(`[BondedConnection] Path ${options.id} already exists`)
      return
    }

    const path: NetworkPath = {
      id: options.id,
      name: options.name,
      type: options.type,
      priority: options.priority,
      isActive: false,
      isConnected: false,
      socket: null,
      lastHeartbeat: 0,
      stats: {
        latency: Infinity,
        jitter: 0,
        packetLoss: 0,
        bandwidth: 0,
        lastUpdated: 0,
        sampleCount: 0,
        latencyHistory: [],
      },
    }

    this.paths.set(options.id, path)

    if (this.isRunning) {
      this.connectPath(path)
    }
  }

  /**
   * Remove a network path
   */
  removePath(pathId: string): void {
    const path = this.paths.get(pathId)
    if (!path) return

    this.disconnectPath(path)
    this.paths.delete(pathId)

    // Update primary if needed
    if (this.primaryPathId === pathId) {
      this.selectNewPrimary()
    }
  }

  /**
   * Start the bonded connection
   */
  start(): void {
    if (this.isRunning) return

    this.isRunning = true
    console.log('[BondedConnection] Starting bonded connection')

    // Connect all paths
    for (const path of this.paths.values()) {
      this.connectPath(path)
    }
  }

  /**
   * Stop the bonded connection
   */
  stop(): void {
    if (!this.isRunning) return

    this.isRunning = false
    console.log('[BondedConnection] Stopping bonded connection')

    // Disconnect all paths
    for (const path of this.paths.values()) {
      this.disconnectPath(path)
    }

    this.primaryPathId = null
    this.emit('disconnected')
  }

  /**
   * Send a message through the primary path (with fallback)
   */
  send(event: string, data: unknown): boolean {
    const primaryPath = this.primaryPathId ? this.paths.get(this.primaryPathId) : null

    if (primaryPath?.isConnected && primaryPath.socket?.connected) {
      primaryPath.socket.emit(event, data)
      return true
    }

    // Fallback to any connected path
    for (const path of this.getSortedPaths()) {
      if (path.isConnected && path.socket?.connected) {
        path.socket.emit(event, data)
        return true
      }
    }

    return false
  }

  /**
   * Get current connection statistics
   */
  getStats(): BondedConnectionStats {
    const paths = Array.from(this.paths.values())
    const connectedPaths = paths.filter(p => p.isConnected)
    const activePaths = paths.filter(p => p.isActive)
    const primaryPath = this.primaryPathId ? this.paths.get(this.primaryPathId) : null

    const totalBandwidth = connectedPaths.reduce((sum, p) => sum + p.stats.bandwidth, 0)

    let overallHealth: BondedConnectionStats['overallHealth'] = 'disconnected'
    if (connectedPaths.length > 0) {
      const avgLatency = connectedPaths.reduce((sum, p) => sum + p.stats.latency, 0) / connectedPaths.length
      const avgPacketLoss = connectedPaths.reduce((sum, p) => sum + p.stats.packetLoss, 0) / connectedPaths.length

      if (avgLatency < 50 && avgPacketLoss < 1) {
        overallHealth = 'excellent'
      } else if (avgLatency < 150 && avgPacketLoss < 3) {
        overallHealth = 'good'
      } else if (avgLatency < 300 && avgPacketLoss < 5) {
        overallHealth = 'fair'
      } else {
        overallHealth = 'poor'
      }
    }

    return {
      activePaths: activePaths.length,
      connectedPaths: connectedPaths.length,
      totalBandwidth,
      primaryPath: this.primaryPathId,
      primaryLatency: primaryPath?.stats.latency ?? Infinity,
      overallHealth,
      paths,
    }
  }

  /**
   * Force failover to next best path
   */
  forceFailover(): void {
    console.log('[BondedConnection] Forcing failover')
    this.selectNewPrimary(this.primaryPathId ?? undefined)
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private connectPath(path: NetworkPath): void {
    if (path.socket) {
      this.disconnectPath(path)
    }

    console.log(`[BondedConnection] Connecting path ${path.name} (${path.id})`)

    try {
      const socket = io(`${this.config.serverUrl}/bonding`, {
        auth: { token: this.config.token },
        query: {
          room: this.config.roomId,
          participant: this.config.participantId,
          path: path.id,
        },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      })

      path.socket = socket
      path.isActive = true

      socket.on('connect', () => {
        console.log(`[BondedConnection] Path ${path.name} connected`)
        path.isConnected = true
        path.lastHeartbeat = Date.now()
        this.emit('pathConnected', path)
        this.startHeartbeat(path)

        // Select as primary if no primary or better priority
        if (!this.primaryPathId || path.priority < (this.paths.get(this.primaryPathId)?.priority ?? Infinity)) {
          this.setPrimaryPath(path)
        }

        // Check if this is the first connection
        const connectedCount = Array.from(this.paths.values()).filter(p => p.isConnected).length
        if (connectedCount === 1) {
          this.emit('connected')
        }
      })

      socket.on('disconnect', () => {
        console.log(`[BondedConnection] Path ${path.name} disconnected`)
        path.isConnected = false
        this.stopHeartbeat(path)
        this.emit('pathDisconnected', path)

        // Failover if this was primary
        if (this.primaryPathId === path.id) {
          this.selectNewPrimary()
        }

        // Check if all paths disconnected
        const connectedCount = Array.from(this.paths.values()).filter(p => p.isConnected).length
        if (connectedCount === 0) {
          this.emit('disconnected')
        }
      })

      socket.on('connect_error', (error) => {
        console.error(`[BondedConnection] Path ${path.name} error:`, error)
        this.emit('error', error)
      })

      socket.on('heartbeat-ack', (data: { seq: number; serverTime: number; pathLatency: number }) => {
        this.handleHeartbeatAck(path, data)
      })

      // Forward other events
      socket.onAny((event, ...args) => {
        if (event !== 'heartbeat-ack') {
          this.emit('message', { event, args, path })
        }
      })

    } catch (error) {
      console.error(`[BondedConnection] Failed to connect path ${path.name}:`, error)
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
    }
  }

  private disconnectPath(path: NetworkPath): void {
    path.isActive = false
    this.stopHeartbeat(path)

    if (path.socket) {
      path.socket.disconnect()
      path.socket = null
    }

    path.isConnected = false
  }

  private startHeartbeat(path: NetworkPath): void {
    this.stopHeartbeat(path)

    const pendingHeartbeats = new Map<number, number>()

    const timer = setInterval(() => {
      if (!path.isConnected || !path.socket?.connected) {
        return
      }

      const seq = ++this.messageSequence
      const sendTime = Date.now()

      // Send heartbeat
      path.socket.emit('heartbeat', {
        seq,
        timestamp: sendTime,
        pathId: path.id,
      })

      // Store pending heartbeat
      pendingHeartbeats.set(seq, sendTime)

      // Cleanup old pending heartbeats (> 5 seconds)
      for (const [oldSeq, oldTime] of pendingHeartbeats) {
        if (Date.now() - oldTime > 5000) {
          pendingHeartbeats.delete(oldSeq)
          this.updatePathStats(path, { packetLoss: path.stats.packetLoss + 1 })
        }
      }

      // Store reference for ack handling
      (path as { pendingHeartbeats?: Map<number, number> }).pendingHeartbeats = pendingHeartbeats

    }, this.config.heartbeatInterval)

    this.heartbeatTimers.set(path.id, timer)
  }

  private stopHeartbeat(path: NetworkPath): void {
    const timer = this.heartbeatTimers.get(path.id)
    if (timer) {
      clearInterval(timer)
      this.heartbeatTimers.delete(path.id)
    }
  }

  private handleHeartbeatAck(path: NetworkPath, data: { seq: number; serverTime: number; pathLatency: number }): void {
    const pending = (path as { pendingHeartbeats?: Map<number, number> }).pendingHeartbeats
    const sendTime = pending?.get(data.seq)

    if (!sendTime) return

    pending?.delete(data.seq)

    const now = Date.now()
    const rtt = now - sendTime

    // Update latency history
    const history = [...path.stats.latencyHistory, rtt]
    if (history.length > this.config.maxLatencyHistory) {
      history.shift()
    }

    // Calculate jitter (variation in latency)
    const jitter = history.length > 1
      ? Math.abs(rtt - history[history.length - 2])
      : 0

    // Estimate bandwidth based on message timing
    const estimatedBandwidth = rtt > 0 ? Math.round(1000 / rtt * 100) : 0

    this.updatePathStats(path, {
      latency: rtt,
      jitter,
      bandwidth: Math.max(path.stats.bandwidth, estimatedBandwidth),
      latencyHistory: history,
      sampleCount: path.stats.sampleCount + 1,
    })

    path.lastHeartbeat = now

    // Check for failover conditions
    this.checkFailover(path)
  }

  private updatePathStats(path: NetworkPath, updates: Partial<PathStats>): void {
    path.stats = {
      ...path.stats,
      ...updates,
      lastUpdated: Date.now(),
    }
    this.emit('pathStatsUpdated', path)
  }

  private checkFailover(path: NetworkPath): void {
    if (this.primaryPathId !== path.id) return

    // Check if primary path has degraded
    if (path.stats.latency > this.config.failoverThreshold || path.stats.packetLoss > 5) {
      // Find a better path
      const sortedPaths = this.getSortedPaths()
      const betterPath = sortedPaths.find(p =>
        p.id !== path.id &&
        p.isConnected &&
        p.stats.latency < path.stats.latency * 0.7 &&
        p.stats.packetLoss < path.stats.packetLoss
      )

      if (betterPath) {
        console.log(`[BondedConnection] Failing over from ${path.name} to ${betterPath.name}`)
        this.setPrimaryPath(betterPath)
      }
    }
  }

  private setPrimaryPath(path: NetworkPath): void {
    const oldPrimary = this.primaryPathId ? this.paths.get(this.primaryPathId) : null

    if (oldPrimary?.id === path.id) return

    console.log(`[BondedConnection] Primary path changed to ${path.name}`)
    this.primaryPathId = path.id
    this.emit('primaryPathChanged', path, oldPrimary ?? null)
  }

  private selectNewPrimary(excludeId?: string): void {
    const candidates = this.getSortedPaths().filter(p =>
      p.isConnected && p.id !== excludeId
    )

    if (candidates.length > 0) {
      this.setPrimaryPath(candidates[0])
    } else {
      this.primaryPathId = null
    }
  }

  private getSortedPaths(): NetworkPath[] {
    return Array.from(this.paths.values())
      .filter(p => p.isConnected)
      .sort((a, b) => {
        // Sort by: priority first, then latency
        if (a.priority !== b.priority) {
          return a.priority - b.priority
        }
        return a.stats.latency - b.stats.latency
      })
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Detect available network interfaces
 * Note: Browser APIs are limited for network detection
 */
export async function detectNetworkPaths(): Promise<Array<{
  id: string
  name: string
  type: NetworkPath['type']
}>> {
  const paths: Array<{ id: string; name: string; type: NetworkPath['type'] }> = []

  // Try to detect connection type using Network Information API
  const connection = (navigator as { connection?: { type?: string; effectiveType?: string } }).connection

  if (connection) {
    const connectionType = connection.type || connection.effectiveType || 'unknown'

    paths.push({
      id: 'primary',
      name: `Primary (${connectionType})`,
      type: connectionType === 'wifi' ? 'wifi'
        : connectionType === 'cellular' ? 'cellular'
        : connectionType === 'ethernet' ? 'ethernet'
        : 'unknown',
    })
  } else {
    // Fallback: assume single unknown connection
    paths.push({
      id: 'primary',
      name: 'Primary Connection',
      type: 'unknown',
    })
  }

  return paths
}

/**
 * Create a bonded connection with automatic path detection
 */
export async function createBondedConnection(
  config: BondedConnectionConfig
): Promise<BondedConnection> {
  const connection = new BondedConnection(config)

  // Detect and add paths
  const paths = await detectNetworkPaths()
  paths.forEach((path, index) => {
    connection.addPath({
      ...path,
      priority: index,
    })
  })

  return connection
}

// =============================================================================
// React Hook
// =============================================================================

import { useState, useEffect, useCallback } from 'react'

export function useBondedConnection(config: BondedConnectionConfig | null) {
  const [connection, setConnection] = useState<BondedConnection | null>(null)
  const [stats, setStats] = useState<BondedConnectionStats | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    if (!config) return

    let conn: BondedConnection | null = null

    const setup = async () => {
      conn = await createBondedConnection(config)

      conn.on('connected', () => setIsConnected(true))
      conn.on('disconnected', () => setIsConnected(false))
      conn.on('pathStatsUpdated', () => setStats(conn!.getStats()))
      conn.on('pathConnected', () => setStats(conn!.getStats()))
      conn.on('pathDisconnected', () => setStats(conn!.getStats()))

      setConnection(conn)
      conn.start()
    }

    setup()

    return () => {
      if (conn) {
        conn.stop()
      }
    }
  }, [config?.serverUrl, config?.roomId, config?.participantId, config?.token])

  const send = useCallback((event: string, data: unknown) => {
    return connection?.send(event, data) ?? false
  }, [connection])

  const forceFailover = useCallback(() => {
    connection?.forceFailover()
  }, [connection])

  const addPath = useCallback((options: Parameters<BondedConnection['addPath']>[0]) => {
    connection?.addPath(options)
  }, [connection])

  const removePath = useCallback((pathId: string) => {
    connection?.removePath(pathId)
  }, [connection])

  return {
    connection,
    stats,
    isConnected,
    send,
    forceFailover,
    addPath,
    removePath,
  }
}

export default BondedConnection
