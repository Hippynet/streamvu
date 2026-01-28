/**
 * RemoteControlIndicator - Visual feedback for remote control changes
 *
 * Displays a notification when a producer remotely adjusts a contributor's
 * audio settings, providing visual feedback so the contributor knows
 * their settings are being changed.
 */

import { useEffect, useState } from 'react'

interface RemoteControlChange {
  type: 'gain' | 'mute' | 'eq' | 'compressor' | 'gate' | 'reset'
  changedById: string
  changedByName: string
  timestamp: number
}

interface RemoteControlIndicatorProps {
  /** Recent changes to display */
  changes: RemoteControlChange[]
  /** Whether currently being remotely controlled */
  isRemotelyControlled: boolean
  /** Callback to dismiss a change notification */
  onDismiss?: (timestamp: number) => void
  /** Position of the indicator */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  /** Compact mode (smaller indicator) */
  compact?: boolean
}

const changeTypeLabels: Record<RemoteControlChange['type'], string> = {
  gain: 'Input Gain',
  mute: 'Mute State',
  eq: 'EQ Settings',
  compressor: 'Compressor',
  gate: 'Noise Gate',
  reset: 'Settings Reset',
}

const changeTypeIcons: Record<RemoteControlChange['type'], string> = {
  gain: '🎚️',
  mute: '🔇',
  eq: '📊',
  compressor: '🎛️',
  gate: '🚪',
  reset: '🔄',
}

export function RemoteControlIndicator({
  changes,
  isRemotelyControlled,
  onDismiss,
  position = 'top-right',
  compact = false,
}: RemoteControlIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Auto-collapse after inactivity
  useEffect(() => {
    if (changes.length === 0) {
      setIsExpanded(false)
    }
  }, [changes.length])

  if (!isRemotelyControlled && changes.length === 0) {
    return null
  }

  const positionClasses = {
    'top-right': 'top-2 right-2',
    'top-left': 'top-2 left-2',
    'bottom-right': 'bottom-2 right-2',
    'bottom-left': 'bottom-2 left-2',
  }

  // Get the most recent change for display
  const latestChange = changes[changes.length - 1]

  if (compact) {
    return (
      <div
        className={`absolute ${positionClasses[position]} z-50`}
        title={latestChange ? `${changeTypeLabels[latestChange.type]} adjusted by ${latestChange.changedByName}` : 'Remotely controlled'}
      >
        <div className="flex items-center gap-1 rounded bg-amber-600/90 px-1.5 py-0.5 text-[9px] font-medium text-white shadow-lg animate-pulse">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          RC
        </div>
      </div>
    )
  }

  return (
    <div className={`absolute ${positionClasses[position]} z-50`}>
      <div className="flex flex-col gap-1 max-w-xs">
        {/* Header indicator */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white shadow-lg transition-all hover:bg-amber-500"
        >
          <svg className="h-4 w-4 animate-pulse" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          <span>Remote Control Active</span>
          {changes.length > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              {changes.length}
            </span>
          )}
          <svg
            className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {/* Change notifications */}
        {isExpanded && changes.length > 0 && (
          <div className="flex flex-col gap-1 rounded bg-gray-900/95 border border-gray-700 p-2 shadow-xl backdrop-blur-sm">
            <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500 mb-1">
              Recent Changes
            </div>
            {changes.slice(-5).reverse().map((change) => (
              <div
                key={change.timestamp}
                className="flex items-center justify-between gap-2 rounded bg-gray-800/50 px-2 py-1 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span>{changeTypeIcons[change.type]}</span>
                  <div>
                    <div className="font-medium text-white">
                      {changeTypeLabels[change.type]}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      by {change.changedByName}
                    </div>
                  </div>
                </div>
                {onDismiss && (
                  <button
                    onClick={() => onDismiss(change.timestamp)}
                    className="p-0.5 text-gray-500 hover:text-white"
                    title="Dismiss"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Latest change toast (shows when collapsed) */}
        {!isExpanded && latestChange && (
          <div className="animate-slide-in rounded bg-gray-900/95 border border-amber-600/50 px-3 py-2 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg">{changeTypeIcons[latestChange.type]}</span>
              <div>
                <div className="text-xs font-medium text-white">
                  {changeTypeLabels[latestChange.type]} adjusted
                </div>
                <div className="text-[10px] text-gray-400">
                  by {latestChange.changedByName}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default RemoteControlIndicator
