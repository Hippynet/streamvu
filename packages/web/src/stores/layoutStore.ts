/**
 * Mixer Layout Store
 *
 * Manages user's preferred mixer layout including:
 * - Layout type (compact, standard, extended, vertical)
 * - Panel visibility preferences
 * - Per-room layout overrides
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Available layout types
export type MixerLayoutType = 'compact' | 'standard' | 'extended' | 'vertical'

// Layout configuration
export interface MixerLayoutConfig {
  type: MixerLayoutType
  // Channel strip settings
  channelWidth: number // px
  showEQ: boolean
  showCompressor: boolean
  showGate: boolean
  showAuxSends: boolean
  showPan: boolean
  meterHeight: number // px
  // Panel visibility
  showMasterSection: boolean
  showBusMeters: boolean
  showTimecode: boolean
  showLoudness: boolean
}

// Preset layouts
export const LAYOUT_PRESETS: Record<MixerLayoutType, MixerLayoutConfig> = {
  compact: {
    type: 'compact',
    channelWidth: 48,
    showEQ: false,
    showCompressor: false,
    showGate: false,
    showAuxSends: false,
    showPan: false,
    meterHeight: 80,
    showMasterSection: true,
    showBusMeters: false,
    showTimecode: false,
    showLoudness: false,
  },
  standard: {
    type: 'standard',
    channelWidth: 64,
    showEQ: true,
    showCompressor: true,
    showGate: false,
    showAuxSends: false,
    showPan: true,
    meterHeight: 120,
    showMasterSection: true,
    showBusMeters: true,
    showTimecode: false,
    showLoudness: true,
  },
  extended: {
    type: 'extended',
    channelWidth: 80,
    showEQ: true,
    showCompressor: true,
    showGate: true,
    showAuxSends: true,
    showPan: true,
    meterHeight: 160,
    showMasterSection: true,
    showBusMeters: true,
    showTimecode: true,
    showLoudness: true,
  },
  vertical: {
    type: 'vertical',
    channelWidth: 120,
    showEQ: true,
    showCompressor: true,
    showGate: true,
    showAuxSends: true,
    showPan: true,
    meterHeight: 200,
    showMasterSection: true,
    showBusMeters: true,
    showTimecode: true,
    showLoudness: true,
  },
}

interface LayoutState {
  // Current layout
  currentLayout: MixerLayoutConfig
  // Per-room layout overrides (roomId -> layout type)
  roomLayouts: Record<string, MixerLayoutType>

  // Actions
  setLayoutType: (type: MixerLayoutType) => void
  setRoomLayout: (roomId: string, type: MixerLayoutType) => void
  getRoomLayout: (roomId: string) => MixerLayoutConfig
  updateLayoutSetting: <K extends keyof MixerLayoutConfig>(key: K, value: MixerLayoutConfig[K]) => void
  resetToPreset: (type: MixerLayoutType) => void
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set, get) => ({
      currentLayout: LAYOUT_PRESETS.standard,
      roomLayouts: {},

      setLayoutType: (type) => {
        set({ currentLayout: { ...LAYOUT_PRESETS[type] } })
      },

      setRoomLayout: (roomId, type) => {
        set((state) => ({
          roomLayouts: {
            ...state.roomLayouts,
            [roomId]: type,
          },
        }))
      },

      getRoomLayout: (roomId) => {
        const state = get()
        const roomLayoutType = state.roomLayouts[roomId]
        if (roomLayoutType) {
          return LAYOUT_PRESETS[roomLayoutType]
        }
        return state.currentLayout
      },

      updateLayoutSetting: (key, value) => {
        set((state) => ({
          currentLayout: {
            ...state.currentLayout,
            [key]: value,
          },
        }))
      },

      resetToPreset: (type) => {
        set({ currentLayout: { ...LAYOUT_PRESETS[type] } })
      },
    }),
    {
      name: 'streamvu-layout',
      partialize: (state) => ({
        currentLayout: state.currentLayout,
        roomLayouts: state.roomLayouts,
      }),
    }
  )
)

/**
 * Get layout description for display
 */
export function getLayoutDescription(type: MixerLayoutType): string {
  switch (type) {
    case 'compact':
      return 'Minimal controls, more channels visible'
    case 'standard':
      return 'Balanced view with essential controls'
    case 'extended':
      return 'Full DSP controls always visible'
    case 'vertical':
      return 'Optimized for portrait displays'
    default:
      return ''
  }
}

/**
 * Get layout icon name
 */
export function getLayoutIcon(type: MixerLayoutType): string {
  switch (type) {
    case 'compact':
      return 'view-columns'
    case 'standard':
      return 'view-grid'
    case 'extended':
      return 'view-boards'
    case 'vertical':
      return 'view-list'
    default:
      return 'view-grid'
  }
}
