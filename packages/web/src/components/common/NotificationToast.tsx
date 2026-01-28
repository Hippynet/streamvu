/**
 * Notification Toast Component
 *
 * Displays toast notifications in the corner of the screen.
 * Supports different types, actions, and auto-dismiss.
 */

import { useEffect, useState } from 'react'
import { useNotificationStore, type Notification, type NotificationType } from '../../stores/notificationStore'

// Icons for different notification types
const icons: Record<NotificationType, JSX.Element> = {
  info: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  ),
  success: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  error: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
}

// Styles for different notification types
const typeStyles: Record<NotificationType, string> = {
  info: 'bg-blue-900/90 border-blue-500 text-blue-100',
  success: 'bg-green-900/90 border-green-500 text-green-100',
  warning: 'bg-amber-900/90 border-amber-500 text-amber-100',
  error: 'bg-red-900/90 border-red-500 text-red-100',
}

const iconStyles: Record<NotificationType, string> = {
  info: 'text-blue-400',
  success: 'text-green-400',
  warning: 'text-amber-400',
  error: 'text-red-400',
}

interface ToastItemProps {
  notification: Notification
  onDismiss: () => void
}

function ToastItem({ notification, onDismiss }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false)
  const [progress, setProgress] = useState(100)

  // Animate progress bar for auto-dismiss
  useEffect(() => {
    if (!notification.duration || notification.duration === 0) return

    const startTime = Date.now()
    const duration = notification.duration

    const updateProgress = () => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)

      if (remaining > 0) {
        requestAnimationFrame(updateProgress)
      }
    }

    requestAnimationFrame(updateProgress)
  }, [notification.duration])

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(onDismiss, 200) // Match animation duration
  }

  return (
    <div
      className={`
        relative overflow-hidden rounded-lg border shadow-lg backdrop-blur-sm
        transition-all duration-200 ease-out
        ${typeStyles[notification.type]}
        ${isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 p-3">
        {/* Icon */}
        <div className={`flex-shrink-0 ${iconStyles[notification.type]}`}>
          {icons[notification.type]}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{notification.title}</p>
          {notification.message && (
            <p className="mt-1 text-xs opacity-80">{notification.message}</p>
          )}
          {notification.action && (
            <button
              onClick={notification.action.onClick}
              className="mt-2 text-xs font-medium underline hover:no-underline"
            >
              {notification.action.label}
            </button>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 rounded p-1 opacity-60 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white/50"
          aria-label="Dismiss notification"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Progress bar for auto-dismiss */}
      {notification.duration && notification.duration > 0 && (
        <div className="absolute bottom-0 left-0 h-0.5 w-full bg-black/20">
          <div
            className="h-full bg-white/40 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

interface NotificationContainerProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}

export function NotificationContainer({ position = 'top-right' }: NotificationContainerProps) {
  const { notifications, removeNotification } = useNotificationStore()

  const positionStyles: Record<string, string> = {
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4',
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
  }

  if (notifications.length === 0) return null

  return (
    <div
      className={`fixed z-50 flex w-80 flex-col gap-2 ${positionStyles[position]}`}
      aria-label="Notifications"
    >
      {notifications.map((notification) => (
        <ToastItem
          key={notification.id}
          notification={notification}
          onDismiss={() => removeNotification(notification.id)}
        />
      ))}
    </div>
  )
}

// Hook for easy notification access
export function useNotifications() {
  const { info, success, warning, error, clearAll, setSoundEnabled, soundEnabled } =
    useNotificationStore()

  return {
    info,
    success,
    warning,
    error,
    clearAll,
    setSoundEnabled,
    soundEnabled,
  }
}
