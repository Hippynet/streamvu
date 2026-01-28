/**
 * useRemoteControl - Hook for remote audio control functionality
 *
 * Allows producers to remotely adjust contributor's audio settings
 * including gain, mute, EQ, compressor, and gate.
 *
 * Features:
 * - Remote input gain adjustment
 * - Remote mute/unmute
 * - Remote EQ control
 * - Remote compressor control
 * - Remote gate control
 * - Visual feedback when remotely adjusted
 * - Undo/reset capability
 */

import { useEffect, useCallback, useRef, useState } from 'react'
import type { Socket } from 'socket.io-client'
import type {
  RemoteControlType,
  RemoteControlState,
  RemoteGainChangedEvent,
  RemoteMuteChangedEvent,
  RemoteEQChangedEvent,
  RemoteCompressorChangedEvent,
  RemoteGateChangedEvent,
  RemoteControlResetEvent,
} from '@streamvu/shared'

// Default values for remote control state
const DEFAULT_REMOTE_STATE: Omit<RemoteControlState, 'participantId'> = {
  gain: 1.0,
  muted: false,
  eq: {
    lowGain: 0,
    midGain: 0,
    highGain: 0,
    lowFreq: 80,
    midFreq: 1000,
    highFreq: 8000,
  },
  compressor: {
    threshold: -24,
    ratio: 4,
    attack: 10,
    release: 100,
    makeupGain: 0,
    enabled: false,
  },
  gate: {
    threshold: -50,
    attack: 1,
    hold: 50,
    release: 100,
    enabled: false,
  },
}

interface RemoteControlChange {
  type: 'gain' | 'mute' | 'eq' | 'compressor' | 'gate' | 'reset'
  changedById: string
  changedByName: string
  timestamp: number
}

interface UseRemoteControlOptions {
  socket: Socket | null
  roomId: string | null
  participantId: string | null
  /** Called when this participant's settings are remotely changed */
  onRemoteGainChange?: (gain: number) => void
  /** Called when this participant is remotely muted/unmuted */
  onRemoteMuteChange?: (muted: boolean) => void
  /** Called when this participant's EQ is remotely changed */
  onRemoteEQChange?: (eq: RemoteControlState['eq']) => void
  /** Called when this participant's compressor is remotely changed */
  onRemoteCompressorChange?: (compressor: RemoteControlState['compressor']) => void
  /** Called when this participant's gate is remotely changed */
  onRemoteGateChange?: (gate: RemoteControlState['gate']) => void
  /** Called when remote control is reset */
  onRemoteReset?: (controlType?: RemoteControlType) => void
}

interface UseRemoteControlReturn {
  /** Current remote control state for this participant */
  state: Omit<RemoteControlState, 'participantId'>
  /** Recent changes (for visual feedback) */
  recentChanges: RemoteControlChange[]
  /** Whether this participant is currently being remotely controlled */
  isRemotelyControlled: boolean
  /** Set remote gain for a target participant (producer only) */
  setRemoteGain: (targetParticipantId: string, gain: number) => Promise<void>
  /** Set remote mute for a target participant (producer only) */
  setRemoteMute: (targetParticipantId: string, muted: boolean) => Promise<void>
  /** Set remote EQ for a target participant (producer only) */
  setRemoteEQ: (targetParticipantId: string, eq: Partial<RemoteControlState['eq']>) => Promise<void>
  /** Set remote compressor for a target participant (producer only) */
  setRemoteCompressor: (targetParticipantId: string, compressor: Partial<RemoteControlState['compressor']>) => Promise<void>
  /** Set remote gate for a target participant (producer only) */
  setRemoteGate: (targetParticipantId: string, gate: Partial<RemoteControlState['gate']>) => Promise<void>
  /** Reset remote control for a target participant (producer only) */
  resetRemoteControl: (targetParticipantId: string, controlType?: RemoteControlType) => Promise<void>
  /** Request current state from a target participant */
  requestState: (targetParticipantId: string) => void
  /** Send current state (response to state request) */
  sendState: () => void
  /** Clear recent change notification */
  clearRecentChange: (timestamp: number) => void
}

export function useRemoteControl({
  socket,
  roomId,
  participantId,
  onRemoteGainChange,
  onRemoteMuteChange,
  onRemoteEQChange,
  onRemoteCompressorChange,
  onRemoteGateChange,
  onRemoteReset,
}: UseRemoteControlOptions): UseRemoteControlReturn {
  const [state, setState] = useState<Omit<RemoteControlState, 'participantId'>>(DEFAULT_REMOTE_STATE)
  const [recentChanges, setRecentChanges] = useState<RemoteControlChange[]>([])
  const [isRemotelyControlled, setIsRemotelyControlled] = useState(false)

  // Track if any remote changes have been made
  const hasRemoteChangesRef = useRef(false)

  // Add a recent change notification
  const addRecentChange = useCallback((change: Omit<RemoteControlChange, 'timestamp'>) => {
    const newChange: RemoteControlChange = {
      ...change,
      timestamp: Date.now(),
    }
    setRecentChanges(prev => [...prev.slice(-9), newChange]) // Keep last 10
    setIsRemotelyControlled(true)
    hasRemoteChangesRef.current = true

    // Auto-clear after 5 seconds
    setTimeout(() => {
      setRecentChanges(prev => prev.filter(c => c.timestamp !== newChange.timestamp))
    }, 5000)
  }, [])

  // Clear a specific change notification
  const clearRecentChange = useCallback((timestamp: number) => {
    setRecentChanges(prev => prev.filter(c => c.timestamp !== timestamp))
  }, [])

  // Listen for remote control events
  useEffect(() => {
    if (!socket || !roomId || !participantId) return

    // Handle remote gain change
    const handleGainChanged = (event: RemoteGainChangedEvent) => {
      if (event.participantId !== participantId) return

      setState(prev => ({ ...prev, gain: event.gain }))
      addRecentChange({
        type: 'gain',
        changedById: event.changedById,
        changedByName: event.changedByName,
      })
      onRemoteGainChange?.(event.gain)
    }

    // Handle remote mute change
    const handleMuteChanged = (event: RemoteMuteChangedEvent) => {
      if (event.participantId !== participantId) return

      setState(prev => ({ ...prev, muted: event.muted }))
      addRecentChange({
        type: 'mute',
        changedById: event.changedById,
        changedByName: event.changedByName,
      })
      onRemoteMuteChange?.(event.muted)
    }

    // Handle remote EQ change
    const handleEQChanged = (event: RemoteEQChangedEvent) => {
      if (event.participantId !== participantId) return

      setState(prev => ({
        ...prev,
        eq: { ...prev.eq, ...event.eq },
      }))
      addRecentChange({
        type: 'eq',
        changedById: event.changedById,
        changedByName: event.changedByName,
      })
      onRemoteEQChange?.({ ...state.eq, ...event.eq })
    }

    // Handle remote compressor change
    const handleCompressorChanged = (event: RemoteCompressorChangedEvent) => {
      if (event.participantId !== participantId) return

      setState(prev => ({
        ...prev,
        compressor: { ...prev.compressor, ...event.compressor },
      }))
      addRecentChange({
        type: 'compressor',
        changedById: event.changedById,
        changedByName: event.changedByName,
      })
      onRemoteCompressorChange?.({ ...state.compressor, ...event.compressor })
    }

    // Handle remote gate change
    const handleGateChanged = (event: RemoteGateChangedEvent) => {
      if (event.participantId !== participantId) return

      setState(prev => ({
        ...prev,
        gate: { ...prev.gate, ...event.gate },
      }))
      addRecentChange({
        type: 'gate',
        changedById: event.changedById,
        changedByName: event.changedByName,
      })
      onRemoteGateChange?.({ ...state.gate, ...event.gate })
    }

    // Handle remote control reset
    const handleReset = (event: RemoteControlResetEvent) => {
      if (event.participantId !== participantId) return

      if (!event.controlType) {
        // Reset all
        setState(DEFAULT_REMOTE_STATE)
        setIsRemotelyControlled(false)
        hasRemoteChangesRef.current = false
      } else {
        // Reset specific control
        switch (event.controlType) {
          case 'GAIN':
            setState(prev => ({ ...prev, gain: DEFAULT_REMOTE_STATE.gain }))
            break
          case 'MUTE':
            setState(prev => ({ ...prev, muted: DEFAULT_REMOTE_STATE.muted }))
            break
          case 'EQ':
            setState(prev => ({ ...prev, eq: DEFAULT_REMOTE_STATE.eq }))
            break
          case 'COMPRESSOR':
            setState(prev => ({ ...prev, compressor: DEFAULT_REMOTE_STATE.compressor }))
            break
          case 'GATE':
            setState(prev => ({ ...prev, gate: DEFAULT_REMOTE_STATE.gate }))
            break
        }
      }

      addRecentChange({
        type: 'reset',
        changedById: event.changedById,
        changedByName: event.changedByName,
      })
      onRemoteReset?.(event.controlType as RemoteControlType | undefined)
    }

    // Handle state request
    const handleStateRequest = (event: { participantId: string; requestedBy: string }) => {
      if (event.participantId !== participantId) return

      // Send our current state back
      socket.emit('remote:state-response', {
        roomId,
        state: { ...state, participantId },
      })
    }

    socket.on('remote:gain-changed', handleGainChanged)
    socket.on('remote:mute-changed', handleMuteChanged)
    socket.on('remote:eq-changed', handleEQChanged)
    socket.on('remote:compressor-changed', handleCompressorChanged)
    socket.on('remote:gate-changed', handleGateChanged)
    socket.on('remote:control-reset', handleReset)
    socket.on('remote:state-request', handleStateRequest)

    return () => {
      socket.off('remote:gain-changed', handleGainChanged)
      socket.off('remote:mute-changed', handleMuteChanged)
      socket.off('remote:eq-changed', handleEQChanged)
      socket.off('remote:compressor-changed', handleCompressorChanged)
      socket.off('remote:gate-changed', handleGateChanged)
      socket.off('remote:control-reset', handleReset)
      socket.off('remote:state-request', handleStateRequest)
    }
  }, [socket, roomId, participantId, state, addRecentChange, onRemoteGainChange, onRemoteMuteChange, onRemoteEQChange, onRemoteCompressorChange, onRemoteGateChange, onRemoteReset])

  // Producer functions to control other participants

  const setRemoteGain = useCallback(async (targetParticipantId: string, gain: number): Promise<void> => {
    if (!socket || !roomId) return

    return new Promise((resolve, reject) => {
      socket.emit('remote:set-gain', { roomId, participantId: targetParticipantId, gain }, (response: { success?: boolean; error?: string }) => {
        if (response.error) {
          reject(new Error(response.error))
        } else {
          resolve()
        }
      })
    })
  }, [socket, roomId])

  const setRemoteMute = useCallback(async (targetParticipantId: string, muted: boolean): Promise<void> => {
    if (!socket || !roomId) return

    return new Promise((resolve, reject) => {
      socket.emit('remote:set-mute', { roomId, participantId: targetParticipantId, muted }, (response: { success?: boolean; error?: string }) => {
        if (response.error) {
          reject(new Error(response.error))
        } else {
          resolve()
        }
      })
    })
  }, [socket, roomId])

  const setRemoteEQ = useCallback(async (targetParticipantId: string, eq: Partial<RemoteControlState['eq']>): Promise<void> => {
    if (!socket || !roomId) return

    return new Promise((resolve, reject) => {
      socket.emit('remote:set-eq', { roomId, participantId: targetParticipantId, ...eq }, (response: { success?: boolean; error?: string }) => {
        if (response.error) {
          reject(new Error(response.error))
        } else {
          resolve()
        }
      })
    })
  }, [socket, roomId])

  const setRemoteCompressor = useCallback(async (targetParticipantId: string, compressor: Partial<RemoteControlState['compressor']>): Promise<void> => {
    if (!socket || !roomId) return

    return new Promise((resolve, reject) => {
      socket.emit('remote:set-compressor', { roomId, participantId: targetParticipantId, ...compressor }, (response: { success?: boolean; error?: string }) => {
        if (response.error) {
          reject(new Error(response.error))
        } else {
          resolve()
        }
      })
    })
  }, [socket, roomId])

  const setRemoteGate = useCallback(async (targetParticipantId: string, gate: Partial<RemoteControlState['gate']>): Promise<void> => {
    if (!socket || !roomId) return

    return new Promise((resolve, reject) => {
      socket.emit('remote:set-gate', { roomId, participantId: targetParticipantId, ...gate }, (response: { success?: boolean; error?: string }) => {
        if (response.error) {
          reject(new Error(response.error))
        } else {
          resolve()
        }
      })
    })
  }, [socket, roomId])

  const resetRemoteControl = useCallback(async (targetParticipantId: string, controlType?: RemoteControlType): Promise<void> => {
    if (!socket || !roomId) return

    return new Promise((resolve, reject) => {
      socket.emit('remote:reset', { roomId, participantId: targetParticipantId, controlType }, (response: { success?: boolean; error?: string }) => {
        if (response.error) {
          reject(new Error(response.error))
        } else {
          resolve()
        }
      })
    })
  }, [socket, roomId])

  const requestState = useCallback((targetParticipantId: string) => {
    if (!socket || !roomId) return

    socket.emit('remote:get-state', { roomId, participantId: targetParticipantId })
  }, [socket, roomId])

  const sendState = useCallback(() => {
    if (!socket || !roomId || !participantId) return

    socket.emit('remote:state-response', {
      roomId,
      state: { ...state, participantId },
    })
  }, [socket, roomId, participantId, state])

  return {
    state,
    recentChanges,
    isRemotelyControlled,
    setRemoteGain,
    setRemoteMute,
    setRemoteEQ,
    setRemoteCompressor,
    setRemoteGate,
    resetRemoteControl,
    requestState,
    sendState,
    clearRecentChange,
  }
}

export default useRemoteControl
