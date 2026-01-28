/**
 * Mix Coordinator Hook
 *
 * Integrates with server-side mix state tracking for:
 * 1. State synchronization across multiple devices
 * 2. Session persistence and recovery
 * 3. Failover detection and takeover
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import type { Socket } from 'socket.io-client'

// Types matching server-side definitions
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

export interface RoomMixState {
  roomId: string
  channels: Record<string, ChannelMixState>
  master: MasterMixState
  soloMode: 'PFL' | 'AFL' | 'SIP'
  lastUpdated: number
  primaryClientId: string | null
  isServerFallback: boolean
}

export interface MixStateChange {
  type: 'channel' | 'master' | 'routing' | 'full'
  channelId?: string
  changes: Partial<ChannelMixState | MasterMixState>
  timestamp: number
  clientId: string
}

interface UseMixCoordinatorOptions {
  socket: Socket | null
  roomId: string | null
  isHost: boolean
  onStateRestored?: (state: RoomMixState) => void
  onRemoteChange?: (change: MixStateChange) => void
  onTakeover?: (newClientId: string) => void
}

interface UseMixCoordinatorReturn {
  isPrimaryMixer: boolean
  isConnected: boolean
  serverState: RoomMixState | null
  registerAsPrimary: () => Promise<RoomMixState | null>
  sendStateChange: (change: Omit<MixStateChange, 'timestamp' | 'clientId'>) => void
  syncFullState: (state: Partial<RoomMixState>) => void
  persistState: () => void
  requestTakeover: () => Promise<boolean>
}

export function useMixCoordinator({
  socket,
  roomId,
  isHost,
  onStateRestored,
  onRemoteChange,
  onTakeover,
}: UseMixCoordinatorOptions): UseMixCoordinatorReturn {
  const [isPrimaryMixer, setIsPrimaryMixer] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [serverState, setServerState] = useState<RoomMixState | null>(null)

  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingChangesRef = useRef<MixStateChange[]>([])

  // Heartbeat interval (ms)
  const HEARTBEAT_INTERVAL = 2000

  // Register as the primary mixer for this room
  const registerAsPrimary = useCallback(async (): Promise<RoomMixState | null> => {
    if (!socket || !roomId || !isHost) return null

    return new Promise((resolve) => {
      socket.emit('mix:register', { roomId }, (response: {
        success: boolean
        error?: string
        state?: RoomMixState
        currentState?: RoomMixState
      }) => {
        if (response.success && response.state) {
          setIsPrimaryMixer(true)
          setIsConnected(true)
          setServerState(response.state)
          onStateRestored?.(response.state)
          resolve(response.state)
        } else if (response.currentState) {
          // Another client is primary, but we got the current state
          setServerState(response.currentState)
          resolve(response.currentState)
        } else {
          console.warn('[MixCoordinator] Failed to register:', response.error)
          resolve(null)
        }
      })
    })
  }, [socket, roomId, isHost, onStateRestored])

  // Send a state change to the server
  const sendStateChange = useCallback((change: Omit<MixStateChange, 'timestamp' | 'clientId'>) => {
    if (!socket || !roomId || !isPrimaryMixer) {
      // Queue the change if not connected
      pendingChangesRef.current.push({
        ...change,
        timestamp: Date.now(),
        clientId: socket?.id || 'unknown',
      })
      return
    }

    const fullChange: MixStateChange = {
      ...change,
      timestamp: Date.now(),
      clientId: socket.id || 'unknown',
    }

    socket.emit('mix:state-change', { roomId, change: fullChange }, (response: { success: boolean; error?: string }) => {
      if (!response.success) {
        console.warn('[MixCoordinator] Failed to apply state change:', response.error)
      }
    })
  }, [socket, roomId, isPrimaryMixer])

  // Sync full state to the server
  const syncFullState = useCallback((state: Partial<RoomMixState>) => {
    if (!socket || !roomId || !isPrimaryMixer) return

    socket.emit('mix:full-sync', { roomId, state }, (response: { success: boolean; error?: string }) => {
      if (!response.success) {
        console.warn('[MixCoordinator] Failed to sync full state:', response.error)
      }
    })
  }, [socket, roomId, isPrimaryMixer])

  // Persist state to database
  const persistState = useCallback(() => {
    if (!socket || !roomId) return

    socket.emit('mix:persist', { roomId }, (response: { success: boolean; error?: string }) => {
      if (!response.success) {
        console.warn('[MixCoordinator] Failed to persist state:', response.error)
      }
    })
  }, [socket, roomId])

  // Request takeover of primary mixer role
  const requestTakeover = useCallback(async (): Promise<boolean> => {
    if (!socket || !roomId || !isHost) return false

    return new Promise((resolve) => {
      socket.emit('mix:takeover', { roomId }, (response: {
        success: boolean
        error?: string
        state?: RoomMixState
      }) => {
        if (response.success) {
          setIsPrimaryMixer(true)
          if (response.state) {
            setServerState(response.state)
            onStateRestored?.(response.state)
          }
          resolve(true)
        } else {
          console.warn('[MixCoordinator] Takeover failed:', response.error)
          resolve(false)
        }
      })
    })
  }, [socket, roomId, isHost, onStateRestored])

  // Set up heartbeat interval
  useEffect(() => {
    if (!socket || !roomId || !isPrimaryMixer) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
      return
    }

    heartbeatIntervalRef.current = setInterval(() => {
      socket.emit('mix:heartbeat', { roomId }, () => {
        // Heartbeat acknowledged
      })
    }, HEARTBEAT_INTERVAL)

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
    }
  }, [socket, roomId, isPrimaryMixer])

  // Set up periodic full sync
  useEffect(() => {
    if (!socket || !roomId || !isPrimaryMixer) {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }
      return
    }

    // Note: Actual full sync should be triggered from the component that owns the state
    // This just sets up the interval timer

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current)
        syncIntervalRef.current = null
      }
    }
  }, [socket, roomId, isPrimaryMixer])

  // Listen for remote state changes
  useEffect(() => {
    if (!socket || !roomId) return

    const handleStateChanged = (data: {
      change: MixStateChange
      sourceClientId: string
    }) => {
      // Ignore changes from ourselves
      if (data.sourceClientId === socket.id) return

      // Apply the change
      setServerState((prev) => {
        if (!prev) return prev

        const newState = { ...prev }

        switch (data.change.type) {
          case 'channel':
            if (data.change.channelId) {
              newState.channels = {
                ...newState.channels,
                [data.change.channelId]: {
                  ...newState.channels[data.change.channelId],
                  ...data.change.changes,
                } as ChannelMixState,
              }
            }
            break

          case 'master':
            newState.master = {
              ...newState.master,
              ...data.change.changes,
            } as MasterMixState
            break
        }

        newState.lastUpdated = data.change.timestamp
        return newState
      })

      onRemoteChange?.(data.change)
    }

    const handleFullSynced = (data: {
      state: RoomMixState
      sourceClientId: string
    }) => {
      // Ignore syncs from ourselves
      if (data.sourceClientId === socket.id) return

      setServerState(data.state)
      onStateRestored?.(data.state)
    }

    const handleTakeover = (data: {
      newPrimaryClientId: string
      previousClientId: string | null
    }) => {
      if (data.newPrimaryClientId !== socket.id) {
        // Someone else took over
        setIsPrimaryMixer(false)
      }
      onTakeover?.(data.newPrimaryClientId)
    }

    const handleChannelAdded = (data: {
      channel: ChannelMixState
      sourceClientId: string
    }) => {
      setServerState((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          channels: {
            ...prev.channels,
            [data.channel.channelId]: data.channel,
          },
          lastUpdated: Date.now(),
        }
      })
    }

    const handleChannelRemoved = (data: {
      channelId: string
      sourceClientId: string
    }) => {
      setServerState((prev) => {
        if (!prev) return prev
        const { [data.channelId]: _, ...rest } = prev.channels
        return {
          ...prev,
          channels: rest,
          lastUpdated: Date.now(),
        }
      })
    }

    socket.on('mix:state-changed', handleStateChanged)
    socket.on('mix:full-synced', handleFullSynced)
    socket.on('mix:takeover', handleTakeover)
    socket.on('mix:channel-added', handleChannelAdded)
    socket.on('mix:channel-removed', handleChannelRemoved)

    return () => {
      socket.off('mix:state-changed', handleStateChanged)
      socket.off('mix:full-synced', handleFullSynced)
      socket.off('mix:takeover', handleTakeover)
      socket.off('mix:channel-added', handleChannelAdded)
      socket.off('mix:channel-removed', handleChannelRemoved)
    }
  }, [socket, roomId, onRemoteChange, onStateRestored, onTakeover])

  // Clean up on unmount
  useEffect(() => {
    return () => {
      setIsPrimaryMixer(false)
      setIsConnected(false)
    }
  }, [])

  return {
    isPrimaryMixer,
    isConnected,
    serverState,
    registerAsPrimary,
    sendStateChange,
    syncFullState,
    persistState,
    requestTakeover,
  }
}
