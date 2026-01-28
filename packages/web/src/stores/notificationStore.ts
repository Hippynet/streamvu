/**
 * Notification Store
 *
 * Manages in-app toast notifications for important events.
 * Supports different notification types, auto-dismiss, and sound alerts.
 */

import { create } from 'zustand'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number // ms, 0 = persistent
  timestamp: number
  sound?: boolean
  action?: {
    label: string
    onClick: () => void
  }
}

interface NotificationState {
  notifications: Notification[]
  maxNotifications: number
  soundEnabled: boolean

  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp'>) => string
  removeNotification: (id: string) => void
  clearAll: () => void
  setSoundEnabled: (enabled: boolean) => void

  // Convenience methods
  info: (title: string, message?: string, options?: Partial<Notification>) => string
  success: (title: string, message?: string, options?: Partial<Notification>) => string
  warning: (title: string, message?: string, options?: Partial<Notification>) => string
  error: (title: string, message?: string, options?: Partial<Notification>) => string
}

const DEFAULT_DURATION = 5000 // 5 seconds
const MAX_NOTIFICATIONS = 5

// Generate unique ID
const generateId = () => `notif-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  maxNotifications: MAX_NOTIFICATIONS,
  soundEnabled: true,

  addNotification: (notification) => {
    const id = generateId()
    const newNotification: Notification = {
      ...notification,
      id,
      timestamp: Date.now(),
      duration: notification.duration ?? DEFAULT_DURATION,
    }

    set((state) => {
      // Remove oldest if at max capacity
      let notifications = [...state.notifications, newNotification]
      if (notifications.length > state.maxNotifications) {
        notifications = notifications.slice(-state.maxNotifications)
      }
      return { notifications }
    })

    // Play sound if enabled
    if (get().soundEnabled && notification.sound !== false) {
      playNotificationSound(notification.type)
    }

    // Auto-dismiss if duration is set
    if (newNotification.duration && newNotification.duration > 0) {
      setTimeout(() => {
        get().removeNotification(id)
      }, newNotification.duration)
    }

    return id
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }))
  },

  clearAll: () => {
    set({ notifications: [] })
  },

  setSoundEnabled: (enabled) => {
    set({ soundEnabled: enabled })
  },

  // Convenience methods
  info: (title, message, options) => {
    return get().addNotification({ type: 'info', title, message, ...options })
  },

  success: (title, message, options) => {
    return get().addNotification({ type: 'success', title, message, ...options })
  },

  warning: (title, message, options) => {
    return get().addNotification({ type: 'warning', title, message, ...options })
  },

  error: (title, message, options) => {
    return get().addNotification({
      type: 'error',
      title,
      message,
      duration: 0, // Errors persist by default
      ...options,
    })
  },
}))

// Simple notification sounds using Web Audio API
function playNotificationSound(type: NotificationType) {
  try {
    const audioContext = new AudioContext()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Different frequencies for different types
    const frequencies: Record<NotificationType, number> = {
      info: 440, // A4
      success: 523, // C5
      warning: 349, // F4
      error: 262, // C4
    }

    oscillator.frequency.value = frequencies[type]
    oscillator.type = type === 'error' ? 'square' : 'sine'

    gainNode.gain.value = 0.1
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.2)

    // Clean up
    setTimeout(() => {
      audioContext.close()
    }, 300)
  } catch {
    // Ignore audio errors (e.g., autoplay policy)
  }
}
