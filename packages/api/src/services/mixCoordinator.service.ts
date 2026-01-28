/**
 * Mix Coordinator Service
 *
 * Provides server-side mix state tracking and failover capabilities.
 * The browser does all actual audio mixing via Web Audio, but the server:
 * 1. Tracks the current mix state (faders, routing, EQ, etc.)
 * 2. Provides hot-standby: if browser disconnects, server can take over with FFmpeg
 * 3. Enables multi-device access to the same mix session
 * 4. Persists mix state for session recovery
 */

import { prisma } from '../lib/prisma.js'

// Channel mix state (mirrors client-side ChannelState)
export interface ChannelMixState {
  channelId: string
  participantId?: string
  sourceType: 'participant' | 'srt' | 'rist' | 'local'
  inputGain: number
  eq: {
    lowGain: number
    midGain: number
    highGain: number
    lowFreq: number
    midFreq: number
    highFreq: number
    midQ: number
    hpfEnabled: boolean
    hpfFreq: number
  }
  gate?: {
    enabled: boolean
    threshold: number
    attack: number
    hold: number
    release: number
    range: number
  }
  compressor: {
    threshold: number
    ratio: number
    attack: number
    release: number
    makeupGain: number
    enabled: boolean
  }
  pan: number
  fader: number
  mute: boolean
  solo: boolean
  pfl: boolean
  busRouting: {
    pgm: boolean
    tb: boolean
    aux1: boolean
    aux2: boolean
    aux3: boolean
    aux4: boolean
  }
  auxSends: [number, number, number, number]
}

// Master bus state
export interface MasterMixState {
  pgmFader: number
  tbFader: number
  pgmMute: boolean
  tbMute: boolean
  aux1Fader?: number
  aux2Fader?: number
  aux3Fader?: number
  aux4Fader?: number
}

// Complete room mix state
export interface RoomMixState {
  roomId: string
  channels: Record<string, ChannelMixState>
  master: MasterMixState
  soloMode: 'PFL' | 'AFL' | 'SIP'
  lastUpdated: number
  primaryClientId: string | null // Socket ID of the primary mixer client
  isServerFallback: boolean // True if server is actively mixing (fallback mode)
}

// Mix state change event
export interface MixStateChange {
  type: 'channel' | 'master' | 'routing' | 'full'
  channelId?: string
  changes: Partial<ChannelMixState | MasterMixState>
  timestamp: number
  clientId: string
}

class MixCoordinatorService {
  // In-memory mix state per room
  private roomMixStates: Map<string, RoomMixState> = new Map()

  // Client tracking (which socket is the primary mixer)
  private primaryClients: Map<string, string> = new Map() // roomId -> socketId

  // Heartbeat tracking for failover detection
  private lastHeartbeats: Map<string, number> = new Map() // roomId -> timestamp

  // Failover timeout (ms) - if no heartbeat, server takes over
  private readonly FAILOVER_TIMEOUT = 5000

  /**
   * Initialize or get mix state for a room
   */
  initRoom(roomId: string): RoomMixState {
    let state = this.roomMixStates.get(roomId)
    if (!state) {
      state = {
        roomId,
        channels: {},
        master: {
          pgmFader: 1.0,
          tbFader: 1.0,
          pgmMute: false,
          tbMute: false,
          aux1Fader: 1.0,
          aux2Fader: 1.0,
          aux3Fader: 1.0,
          aux4Fader: 1.0,
        },
        soloMode: 'PFL',
        lastUpdated: Date.now(),
        primaryClientId: null,
        isServerFallback: false,
      }
      this.roomMixStates.set(roomId, state)
    }
    return state
  }

  /**
   * Get current mix state for a room
   */
  getRoomState(roomId: string): RoomMixState | null {
    return this.roomMixStates.get(roomId) || null
  }

  /**
   * Register a client as the primary mixer for a room
   */
  registerPrimaryClient(roomId: string, socketId: string): boolean {
    const state = this.initRoom(roomId)
    const currentPrimary = this.primaryClients.get(roomId)

    // If no current primary or current primary is disconnected, allow registration
    if (!currentPrimary || !this.isClientAlive(roomId)) {
      this.primaryClients.set(roomId, socketId)
      state.primaryClientId = socketId
      state.isServerFallback = false
      this.lastHeartbeats.set(roomId, Date.now())
      console.log(`[MixCoordinator] Primary client registered for room ${roomId}: ${socketId}`)
      return true
    }

    // Another client is already primary
    if (currentPrimary !== socketId) {
      console.log(`[MixCoordinator] Room ${roomId} already has primary client: ${currentPrimary}`)
      return false
    }

    return true
  }

  /**
   * Unregister a client (on disconnect)
   */
  unregisterClient(roomId: string, socketId: string): void {
    const currentPrimary = this.primaryClients.get(roomId)
    if (currentPrimary === socketId) {
      this.primaryClients.delete(roomId)
      const state = this.roomMixStates.get(roomId)
      if (state) {
        state.primaryClientId = null
        // Don't immediately enable fallback - wait for another client or timeout
      }
      console.log(`[MixCoordinator] Primary client unregistered from room ${roomId}`)
    }
  }

  /**
   * Update heartbeat from primary client
   */
  heartbeat(roomId: string, socketId: string): void {
    const currentPrimary = this.primaryClients.get(roomId)
    if (currentPrimary === socketId) {
      this.lastHeartbeats.set(roomId, Date.now())
      const state = this.roomMixStates.get(roomId)
      if (state && state.isServerFallback) {
        state.isServerFallback = false
        console.log(`[MixCoordinator] Client resumed control for room ${roomId}`)
      }
    }
  }

  /**
   * Check if primary client is alive (has sent heartbeat recently)
   */
  isClientAlive(roomId: string): boolean {
    const lastHeartbeat = this.lastHeartbeats.get(roomId)
    if (!lastHeartbeat) return false
    return Date.now() - lastHeartbeat < this.FAILOVER_TIMEOUT
  }

  /**
   * Apply a mix state change from the primary client
   */
  applyStateChange(roomId: string, socketId: string, change: MixStateChange): boolean {
    const state = this.roomMixStates.get(roomId)
    if (!state) return false

    // Only accept changes from primary client
    const currentPrimary = this.primaryClients.get(roomId)
    if (currentPrimary !== socketId) {
      console.warn(`[MixCoordinator] Rejected state change from non-primary client`)
      return false
    }

    // Update heartbeat
    this.heartbeat(roomId, socketId)

    // Apply the change
    switch (change.type) {
      case 'channel':
        if (change.channelId) {
          const existing = state.channels[change.channelId] || this.createDefaultChannel(change.channelId)
          state.channels[change.channelId] = {
            ...existing,
            ...change.changes,
          } as ChannelMixState
        }
        break

      case 'master':
        state.master = {
          ...state.master,
          ...change.changes,
        } as MasterMixState
        break

      case 'routing':
        // Routing changes update channel's busRouting
        if (change.channelId && change.changes) {
          const channel = state.channels[change.channelId]
          if (channel && 'busRouting' in change.changes) {
            channel.busRouting = {
              ...channel.busRouting,
              ...(change.changes as ChannelMixState).busRouting,
            }
          }
        }
        break

      case 'full':
        // Full state sync - replace entire state
        if ('channels' in change.changes) {
          state.channels = (change.changes as unknown as RoomMixState).channels
        }
        if ('master' in change.changes) {
          state.master = (change.changes as unknown as RoomMixState).master
        }
        break
    }

    state.lastUpdated = Date.now()
    return true
  }

  /**
   * Sync full mix state from client
   */
  syncFullState(roomId: string, socketId: string, fullState: Partial<RoomMixState>): boolean {
    const state = this.roomMixStates.get(roomId)
    if (!state) return false

    const currentPrimary = this.primaryClients.get(roomId)
    if (currentPrimary !== socketId) {
      console.warn(`[MixCoordinator] Rejected full sync from non-primary client`)
      return false
    }

    // Update heartbeat
    this.heartbeat(roomId, socketId)

    // Merge the full state
    if (fullState.channels) {
      state.channels = fullState.channels
    }
    if (fullState.master) {
      state.master = fullState.master
    }
    if (fullState.soloMode) {
      state.soloMode = fullState.soloMode
    }

    state.lastUpdated = Date.now()
    console.log(`[MixCoordinator] Full state sync for room ${roomId}: ${Object.keys(state.channels).length} channels`)
    return true
  }

  /**
   * Add or update a channel in the mix state
   */
  addChannel(roomId: string, channelId: string, participantId?: string, sourceType: ChannelMixState['sourceType'] = 'participant'): ChannelMixState {
    const state = this.initRoom(roomId)
    const existing = state.channels[channelId]

    if (existing) {
      // Update existing channel
      existing.participantId = participantId
      existing.sourceType = sourceType
      return existing
    }

    // Create new channel
    const channel = this.createDefaultChannel(channelId, participantId, sourceType)
    state.channels[channelId] = channel
    state.lastUpdated = Date.now()
    return channel
  }

  /**
   * Remove a channel from the mix state
   */
  removeChannel(roomId: string, channelId: string): void {
    const state = this.roomMixStates.get(roomId)
    if (state && state.channels[channelId]) {
      delete state.channels[channelId]
      state.lastUpdated = Date.now()
    }
  }

  /**
   * Get list of channels for a room
   */
  getChannels(roomId: string): ChannelMixState[] {
    const state = this.roomMixStates.get(roomId)
    return state ? Object.values(state.channels) : []
  }

  /**
   * Persist mix state to database (for session recovery)
   */
  async persistState(roomId: string): Promise<void> {
    const state = this.roomMixStates.get(roomId)
    if (!state) return

    try {
      // Store as JSON in room metadata (convert to plain JSON object)
      const mixStateJson = JSON.parse(JSON.stringify({
        channels: state.channels,
        master: state.master,
        soloMode: state.soloMode,
        lastUpdated: state.lastUpdated,
      }))

      await prisma.callRoom.update({
        where: { id: roomId },
        data: {
          mixState: mixStateJson,
        },
      })
      console.log(`[MixCoordinator] Persisted mix state for room ${roomId}`)
    } catch (error) {
      console.error(`[MixCoordinator] Failed to persist mix state:`, error)
    }
  }

  /**
   * Restore mix state from database
   */
  async restoreState(roomId: string): Promise<RoomMixState | null> {
    try {
      const room = await prisma.callRoom.findUnique({
        where: { id: roomId },
        select: { mixState: true },
      })

      if (room?.mixState) {
        const saved = room.mixState as unknown as Partial<RoomMixState>
        const state = this.initRoom(roomId)
        if (saved.channels) state.channels = saved.channels
        if (saved.master) state.master = saved.master
        if (saved.soloMode) state.soloMode = saved.soloMode
        state.lastUpdated = saved.lastUpdated || Date.now()
        console.log(`[MixCoordinator] Restored mix state for room ${roomId}`)
        return state
      }
    } catch (error) {
      console.error(`[MixCoordinator] Failed to restore mix state:`, error)
    }
    return null
  }

  /**
   * Clean up room state (on room close)
   */
  cleanupRoom(roomId: string): void {
    this.roomMixStates.delete(roomId)
    this.primaryClients.delete(roomId)
    this.lastHeartbeats.delete(roomId)
    console.log(`[MixCoordinator] Cleaned up state for room ${roomId}`)
  }

  /**
   * Get failover status for a room
   */
  getFailoverStatus(roomId: string): { needsFailover: boolean; primaryClientId: string | null; lastHeartbeat: number | null } {
    const state = this.roomMixStates.get(roomId)
    const lastHeartbeat = this.lastHeartbeats.get(roomId) || null

    return {
      needsFailover: !this.isClientAlive(roomId) && !!state?.channels && Object.keys(state.channels).length > 0,
      primaryClientId: state?.primaryClientId || null,
      lastHeartbeat,
    }
  }

  /**
   * Create default channel state
   */
  private createDefaultChannel(channelId: string, participantId?: string, sourceType: ChannelMixState['sourceType'] = 'participant'): ChannelMixState {
    return {
      channelId,
      participantId,
      sourceType,
      inputGain: 0,
      eq: {
        lowGain: 0,
        midGain: 0,
        highGain: 0,
        lowFreq: 100,
        midFreq: 1000,
        highFreq: 8000,
        midQ: 1.0,
        hpfEnabled: false,
        hpfFreq: 80,
      },
      gate: {
        enabled: false,
        threshold: -40,
        attack: 0.005,
        hold: 100,
        release: 0.1,
        range: -60,
      },
      compressor: {
        threshold: -24,
        ratio: 4,
        attack: 10,
        release: 100,
        makeupGain: 0,
        enabled: false,
      },
      pan: 0,
      fader: 1.0,
      mute: false,
      solo: false,
      pfl: false,
      busRouting: {
        pgm: true,
        tb: false,
        aux1: false,
        aux2: false,
        aux3: false,
        aux4: false,
      },
      auxSends: [0, 0, 0, 0],
    }
  }
}

export const mixCoordinatorService = new MixCoordinatorService()
