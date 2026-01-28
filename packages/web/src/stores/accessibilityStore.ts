/**
 * Accessibility Preferences Store
 *
 * Manages user accessibility preferences including:
 * - Reduced motion
 * - High contrast mode
 * - Keyboard focus indicators
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AccessibilityState {
  // Preferences
  reducedMotion: boolean
  highContrast: boolean
  enhancedFocusIndicators: boolean
  announceUpdates: boolean
  largeText: boolean

  // Actions
  setReducedMotion: (enabled: boolean) => void
  setHighContrast: (enabled: boolean) => void
  setEnhancedFocusIndicators: (enabled: boolean) => void
  setAnnounceUpdates: (enabled: boolean) => void
  setLargeText: (enabled: boolean) => void
  resetToDefaults: () => void
}

// Detect system preferences
const prefersReducedMotion = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false

const prefersHighContrast = typeof window !== 'undefined'
  ? window.matchMedia('(prefers-contrast: more)').matches
  : false

const DEFAULT_STATE = {
  reducedMotion: prefersReducedMotion,
  highContrast: prefersHighContrast,
  enhancedFocusIndicators: false,
  announceUpdates: true,
  largeText: false,
}

export const useAccessibilityStore = create<AccessibilityState>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setReducedMotion: (enabled) => {
        set({ reducedMotion: enabled })
        // Apply to document
        if (enabled) {
          document.documentElement.classList.add('reduce-motion')
        } else {
          document.documentElement.classList.remove('reduce-motion')
        }
      },

      setHighContrast: (enabled) => {
        set({ highContrast: enabled })
        // Apply to document
        if (enabled) {
          document.documentElement.classList.add('high-contrast')
        } else {
          document.documentElement.classList.remove('high-contrast')
        }
      },

      setEnhancedFocusIndicators: (enabled) => {
        set({ enhancedFocusIndicators: enabled })
        // Apply to document
        if (enabled) {
          document.documentElement.classList.add('enhanced-focus')
        } else {
          document.documentElement.classList.remove('enhanced-focus')
        }
      },

      setAnnounceUpdates: (enabled) => set({ announceUpdates: enabled }),

      setLargeText: (enabled) => {
        set({ largeText: enabled })
        // Apply to document
        if (enabled) {
          document.documentElement.classList.add('large-text')
        } else {
          document.documentElement.classList.remove('large-text')
        }
      },

      resetToDefaults: () => {
        set(DEFAULT_STATE)
        // Remove all accessibility classes
        document.documentElement.classList.remove(
          'reduce-motion',
          'high-contrast',
          'enhanced-focus',
          'large-text'
        )
      },
    }),
    {
      name: 'streamvu-accessibility',
      partialize: (state) => ({
        reducedMotion: state.reducedMotion,
        highContrast: state.highContrast,
        enhancedFocusIndicators: state.enhancedFocusIndicators,
        announceUpdates: state.announceUpdates,
        largeText: state.largeText,
      }),
      onRehydrateStorage: () => (state) => {
        // Apply stored preferences to document on load
        if (state) {
          if (state.reducedMotion) document.documentElement.classList.add('reduce-motion')
          if (state.highContrast) document.documentElement.classList.add('high-contrast')
          if (state.enhancedFocusIndicators) document.documentElement.classList.add('enhanced-focus')
          if (state.largeText) document.documentElement.classList.add('large-text')
        }
      },
    }
  )
)

// Listen for system preference changes
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    // Only update if user hasn't explicitly set a preference
    const stored = localStorage.getItem('streamvu-accessibility')
    if (!stored) {
      useAccessibilityStore.getState().setReducedMotion(e.matches)
    }
  })

  window.matchMedia('(prefers-contrast: more)').addEventListener('change', (e) => {
    // Only update if user hasn't explicitly set a preference
    const stored = localStorage.getItem('streamvu-accessibility')
    if (!stored) {
      useAccessibilityStore.getState().setHighContrast(e.matches)
    }
  })
}
