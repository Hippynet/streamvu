/**
 * Accessibility Announcements Hook
 *
 * Provides screen reader announcements for state changes.
 * Uses an ARIA live region to communicate updates to assistive technology.
 */

import { useCallback, useEffect, useRef } from 'react'

type Politeness = 'polite' | 'assertive' | 'off'

interface UseA11yAnnounceOptions {
  /**
   * Politeness level for announcements.
   * - 'polite': Announcement will be made when the user is idle
   * - 'assertive': Announcement will interrupt the user immediately
   * - 'off': No announcements (disabled)
   */
  defaultPoliteness?: Politeness
  /**
   * Delay in ms before clearing the announcement (allows time for AT to read)
   */
  clearDelay?: number
}

interface UseA11yAnnounceReturn {
  /**
   * Announce a message to screen readers
   */
  announce: (message: string, politeness?: Politeness) => void
  /**
   * Announce an error message (uses assertive politeness)
   */
  announceError: (message: string) => void
  /**
   * Announce a success message
   */
  announceSuccess: (message: string) => void
  /**
   * Announce a status change
   */
  announceStatus: (entity: string, newStatus: string) => void
}

// Global live region element (shared across all hook instances)
let liveRegionPolite: HTMLDivElement | null = null
let liveRegionAssertive: HTMLDivElement | null = null

/**
 * Create or get the live region element
 */
function ensureLiveRegion(politeness: 'polite' | 'assertive'): HTMLDivElement {
  const existingRegion = politeness === 'polite' ? liveRegionPolite : liveRegionAssertive

  if (existingRegion && document.body.contains(existingRegion)) {
    return existingRegion
  }

  // Create the live region
  const region = document.createElement('div')
  region.setAttribute('role', 'status')
  region.setAttribute('aria-live', politeness)
  region.setAttribute('aria-atomic', 'true')
  region.className = 'sr-only' // Screen reader only

  // Style it to be visually hidden but accessible
  Object.assign(region.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: '0',
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: '0',
  })

  document.body.appendChild(region)

  if (politeness === 'polite') {
    liveRegionPolite = region
  } else {
    liveRegionAssertive = region
  }

  return region
}

/**
 * Hook for announcing messages to screen readers
 */
export function useA11yAnnounce(options: UseA11yAnnounceOptions = {}): UseA11yAnnounceReturn {
  const { defaultPoliteness = 'polite', clearDelay = 1000 } = options
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current)
      }
    }
  }, [])

  const announce = useCallback((message: string, politeness: Politeness = defaultPoliteness) => {
    if (politeness === 'off' || !message) return

    const region = ensureLiveRegion(politeness)

    // Clear any pending timeout
    if (clearTimeoutRef.current) {
      clearTimeout(clearTimeoutRef.current)
    }

    // Clear and set the message (this triggers the announcement)
    region.textContent = ''
    // Use requestAnimationFrame to ensure the DOM has updated
    requestAnimationFrame(() => {
      region.textContent = message
    })

    // Clear after delay to allow for repeated announcements of same message
    clearTimeoutRef.current = setTimeout(() => {
      region.textContent = ''
    }, clearDelay)
  }, [defaultPoliteness, clearDelay])

  const announceError = useCallback((message: string) => {
    announce(`Error: ${message}`, 'assertive')
  }, [announce])

  const announceSuccess = useCallback((message: string) => {
    announce(message, 'polite')
  }, [announce])

  const announceStatus = useCallback((entity: string, newStatus: string) => {
    announce(`${entity} is now ${newStatus}`, 'polite')
  }, [announce])

  return {
    announce,
    announceError,
    announceSuccess,
    announceStatus,
  }
}

/**
 * Standalone function for one-off announcements
 */
export function announceToScreenReader(message: string, politeness: 'polite' | 'assertive' = 'polite'): void {
  const region = ensureLiveRegion(politeness)
  region.textContent = ''
  requestAnimationFrame(() => {
    region.textContent = message
    setTimeout(() => {
      region.textContent = ''
    }, 1000)
  })
}

/**
 * Common announcement helpers
 */
export const a11yAnnouncements = {
  participantJoined: (name: string) => announceToScreenReader(`${name} has joined the room`),
  participantLeft: (name: string) => announceToScreenReader(`${name} has left the room`),
  muted: (target?: string) => announceToScreenReader(target ? `${target} muted` : 'Muted'),
  unmuted: (target?: string) => announceToScreenReader(target ? `${target} unmuted` : 'Unmuted'),
  recordingStarted: () => announceToScreenReader('Recording started', 'assertive'),
  recordingStopped: () => announceToScreenReader('Recording stopped'),
  streamLive: (name: string) => announceToScreenReader(`${name} is now live`, 'assertive'),
  streamOffline: (name: string) => announceToScreenReader(`${name} is offline`),
  connectionQualityChanged: (quality: string) => announceToScreenReader(`Connection quality: ${quality}`),
  errorOccurred: (error: string) => announceToScreenReader(`Error: ${error}`, 'assertive'),
}
