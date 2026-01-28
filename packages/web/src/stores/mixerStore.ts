/**
 * Mixer State Persistence Store
 *
 * Persists critical mixer settings (per room) to localStorage so
 * page refresh doesn't lose all the channel configurations.
 *
 * Only persists "stable" settings, not transient things like:
 * - Meter levels
 * - Speaking indicators
 * - Solo state (clears on session end)
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Channel settings that should persist
export interface PersistedChannelSettings {
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

// Room session state
export interface RoomMixerState {
  channels: Record<string, PersistedChannelSettings>
  master: {
    pgmFader: number
    tbFader: number
    pgmMute: boolean
    tbMute: boolean
  }
  lastSaved: number // timestamp
}

interface MixerStoreState {
  // Per-room mixer states (keyed by roomId)
  rooms: Record<string, RoomMixerState>

  // Save mixer state for a room
  saveRoomState: (roomId: string, state: RoomMixerState) => void

  // Get mixer state for a room
  getRoomState: (roomId: string) => RoomMixerState | null

  // Clear a room's saved state
  clearRoomState: (roomId: string) => void

  // Save a single channel's settings
  saveChannelSettings: (roomId: string, channelId: string, settings: PersistedChannelSettings) => void
}

// Default channel settings (matches ProMixer defaults)
export const DEFAULT_PERSISTED_CHANNEL: PersistedChannelSettings = {
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
    attack: 5,
    hold: 100,
    release: 100,
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

export const useMixerStore = create<MixerStoreState>()(
  persist(
    (set, get) => ({
      rooms: {},

      saveRoomState: (roomId, state) =>
        set((prev) => ({
          rooms: {
            ...prev.rooms,
            [roomId]: {
              ...state,
              lastSaved: Date.now(),
            },
          },
        })),

      getRoomState: (roomId) => {
        const state = get().rooms[roomId]
        if (!state) return null

        // Check if state is stale (older than 24 hours)
        const ageMs = Date.now() - state.lastSaved
        const maxAgeMs = 24 * 60 * 60 * 1000 // 24 hours
        if (ageMs > maxAgeMs) {
          // Clear stale state
          get().clearRoomState(roomId)
          return null
        }

        return state
      },

      clearRoomState: (roomId) =>
        set((prev) => {
          const { [roomId]: _, ...rest } = prev.rooms
          return { rooms: rest }
        }),

      saveChannelSettings: (roomId, channelId, settings) =>
        set((prev) => {
          const existingRoom = prev.rooms[roomId] || {
            channels: {},
            master: { pgmFader: 1.0, tbFader: 1.0, pgmMute: false, tbMute: false },
            lastSaved: Date.now(),
          }

          return {
            rooms: {
              ...prev.rooms,
              [roomId]: {
                ...existingRoom,
                channels: {
                  ...existingRoom.channels,
                  [channelId]: settings,
                },
                lastSaved: Date.now(),
              },
            },
          }
        }),
    }),
    {
      name: 'streamvu-mixer',
      // Only persist the rooms data, not the functions
      partialize: (state) => ({
        rooms: state.rooms,
      }),
    }
  )
)
