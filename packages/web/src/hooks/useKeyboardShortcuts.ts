import { useEffect, useCallback, useState, useRef } from 'react'

/**
 * Keyboard Shortcuts for Professional Broadcast Mixer
 *
 * Default shortcuts:
 * - SPACE: Push-to-talk (talkback to all)
 * - F1-F12: Solo channels 1-12
 * - 1-9, 0: Mute/unmute channels 1-10
 * - M: Master mute toggle
 * - T: Talkback to all (toggle)
 * - ESC: Clear all solos
 * - Ctrl+S: Save session settings (placeholder)
 * - Ctrl+R: Start/stop recording
 * - ?: Show shortcuts overlay
 */

export interface KeyboardShortcutHandlers {
  /** Toggle mute for a channel (0-based index) */
  onToggleChannelMute?: (channelIndex: number) => void
  /** Toggle solo for a channel (0-based index) */
  onToggleChannelSolo?: (channelIndex: number) => void
  /** Clear all solos */
  onClearAllSolos?: () => void
  /** Toggle master mute */
  onToggleMasterMute?: () => void
  /** Push-to-talk start (talkback) */
  onTalkbackStart?: () => void
  /** Push-to-talk end (talkback) */
  onTalkbackEnd?: () => void
  /** Toggle talkback mode */
  onToggleTalkback?: () => void
  /** Toggle recording */
  onToggleRecording?: () => void
  /** Save session */
  onSaveSession?: () => void
}

export interface UseKeyboardShortcutsOptions {
  /** Whether shortcuts are enabled */
  enabled?: boolean
  /** Handlers for various shortcut actions */
  handlers: KeyboardShortcutHandlers
  /** Number of channels available */
  channelCount?: number
}

export interface ShortcutInfo {
  key: string
  description: string
  category: 'channel' | 'master' | 'talkback' | 'general'
}

export const DEFAULT_SHORTCUTS: ShortcutInfo[] = [
  { key: 'Space', description: 'Push-to-talk (hold)', category: 'talkback' },
  { key: 'T', description: 'Toggle talkback to all', category: 'talkback' },
  { key: 'F1-F12', description: 'Solo channels 1-12', category: 'channel' },
  { key: '1-9, 0', description: 'Mute/unmute channels 1-10', category: 'channel' },
  { key: 'M', description: 'Master mute toggle', category: 'master' },
  { key: 'Escape', description: 'Clear all solos', category: 'channel' },
  { key: 'Ctrl+R', description: 'Start/stop recording', category: 'general' },
  { key: '?', description: 'Show shortcuts help', category: 'general' },
]

export function useKeyboardShortcuts({
  enabled = true,
  handlers,
  channelCount = 12,
}: UseKeyboardShortcutsOptions) {
  const [showShortcutsOverlay, setShowShortcutsOverlay] = useState(false)
  const [isTalkbackHeld, setIsTalkbackHeld] = useState(false)
  const spaceHeldRef = useRef(false)

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const key = event.key
      const ctrlOrMeta = event.ctrlKey || event.metaKey

      // Push-to-talk (Space - hold)
      if (key === ' ' && !event.repeat) {
        event.preventDefault()
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true
          setIsTalkbackHeld(true)
          handlers.onTalkbackStart?.()
        }
        return
      }

      // Function keys F1-F12 for solo
      if (key.startsWith('F') && key.length <= 3) {
        const fNum = parseInt(key.slice(1))
        if (fNum >= 1 && fNum <= 12 && fNum <= channelCount) {
          event.preventDefault()
          handlers.onToggleChannelSolo?.(fNum - 1)
          return
        }
      }

      // Number keys 1-9, 0 for mute
      if (!ctrlOrMeta && /^[0-9]$/.test(key)) {
        const num = key === '0' ? 10 : parseInt(key)
        if (num <= channelCount) {
          event.preventDefault()
          handlers.onToggleChannelMute?.(num - 1)
          return
        }
      }

      // M for master mute
      if (key.toLowerCase() === 'm' && !ctrlOrMeta) {
        event.preventDefault()
        handlers.onToggleMasterMute?.()
        return
      }

      // T for talkback toggle
      if (key.toLowerCase() === 't' && !ctrlOrMeta) {
        event.preventDefault()
        handlers.onToggleTalkback?.()
        return
      }

      // ESC to clear solos
      if (key === 'Escape') {
        event.preventDefault()
        handlers.onClearAllSolos?.()
        setShowShortcutsOverlay(false)
        return
      }

      // Ctrl+R for recording
      if (key.toLowerCase() === 'r' && ctrlOrMeta) {
        event.preventDefault()
        handlers.onToggleRecording?.()
        return
      }

      // Ctrl+S for save (future)
      if (key.toLowerCase() === 's' && ctrlOrMeta) {
        event.preventDefault()
        handlers.onSaveSession?.()
        return
      }

      // ? for shortcuts overlay
      if (key === '?' || (key === '/' && event.shiftKey)) {
        event.preventDefault()
        setShowShortcutsOverlay((prev) => !prev)
        return
      }
    },
    [enabled, handlers, channelCount]
  )

  const handleKeyUp = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // Push-to-talk release
      if (event.key === ' ') {
        if (spaceHeldRef.current) {
          spaceHeldRef.current = false
          setIsTalkbackHeld(false)
          handlers.onTalkbackEnd?.()
        }
      }
    },
    [enabled, handlers]
  )

  // Handle window blur (release talkback if window loses focus)
  const handleWindowBlur = useCallback(() => {
    if (spaceHeldRef.current) {
      spaceHeldRef.current = false
      setIsTalkbackHeld(false)
      handlers.onTalkbackEnd?.()
    }
  }, [handlers])

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [enabled, handleKeyDown, handleKeyUp, handleWindowBlur])

  return {
    showShortcutsOverlay,
    setShowShortcutsOverlay,
    isTalkbackHeld,
    shortcuts: DEFAULT_SHORTCUTS,
  }
}

export default useKeyboardShortcuts
