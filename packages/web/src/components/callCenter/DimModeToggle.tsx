/**
 * DimModeToggle - Toggle for broadcast control room dim mode
 *
 * Reduces overall UI brightness for very dark control rooms
 * to minimize eye strain during extended monitoring sessions.
 */

import { useEffect, useState, useCallback } from 'react'

interface DimModeToggleProps {
  /** Additional className for styling */
  className?: string
  /** Compact mode shows just an icon */
  compact?: boolean
}

const DIM_MODE_STORAGE_KEY = 'streamvu-dim-mode'

export function DimModeToggle({ className = '', compact = false }: DimModeToggleProps) {
  const [isDimMode, setIsDimMode] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(DIM_MODE_STORAGE_KEY) === 'true'
  })

  // Apply dim mode class to document
  useEffect(() => {
    if (isDimMode) {
      document.documentElement.classList.add('dim-mode')
    } else {
      document.documentElement.classList.remove('dim-mode')
    }
    localStorage.setItem(DIM_MODE_STORAGE_KEY, String(isDimMode))
  }, [isDimMode])

  const toggle = useCallback(() => {
    setIsDimMode(prev => !prev)
  }, [])

  if (compact) {
    return (
      <button
        onClick={toggle}
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
          isDimMode
            ? 'bg-yellow-900/50 text-yellow-500'
            : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
        } ${className}`}
        title={isDimMode ? 'Disable dim mode' : 'Enable dim mode (reduce brightness)'}
      >
        {isDimMode ? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
          </svg>
        ) : (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
          </svg>
        )}
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      className={`flex items-center gap-2 rounded border px-3 py-1.5 text-sm transition-colors ${
        isDimMode
          ? 'border-yellow-700 bg-yellow-900/50 text-yellow-500'
          : 'border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
      } ${className}`}
      title={isDimMode ? 'Disable dim mode' : 'Enable dim mode (reduce brightness)'}
    >
      {isDimMode ? (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" />
        </svg>
      )}
      <span className="text-xs font-medium">{isDimMode ? 'DIM' : 'NORMAL'}</span>
    </button>
  )
}

export default DimModeToggle
