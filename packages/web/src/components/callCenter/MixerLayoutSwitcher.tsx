/**
 * Mixer Layout Switcher
 *
 * Allows users to switch between different mixer layout presets.
 * Can be placed in a toolbar or settings panel.
 */

import { useState, useRef, useEffect } from 'react'
import {
  useLayoutStore,
  type MixerLayoutType,
  getLayoutDescription,
} from '../../stores/layoutStore'

interface MixerLayoutSwitcherProps {
  roomId?: string
  className?: string
}

const LAYOUT_OPTIONS: { type: MixerLayoutType; label: string; icon: JSX.Element }[] = [
  {
    type: 'compact',
    label: 'Compact',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15M4.5 9h15m-15 6h15" />
      </svg>
    ),
  },
  {
    type: 'standard',
    label: 'Standard',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    type: 'extended',
    label: 'Extended',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5M9 11.25v1.5M12 9v3.75m3-6v6" />
      </svg>
    ),
  },
  {
    type: 'vertical',
    label: 'Vertical',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
  },
]

export function MixerLayoutSwitcher({ roomId, className = '' }: MixerLayoutSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const { currentLayout, setLayoutType, setRoomLayout, getRoomLayout } = useLayoutStore()

  // Get the current layout for this room (or global default)
  const activeLayout = roomId ? getRoomLayout(roomId) : currentLayout

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelectLayout = (type: MixerLayoutType) => {
    if (roomId) {
      setRoomLayout(roomId, type)
    } else {
      setLayoutType(type)
    }
    setIsOpen(false)
  }

  const currentOption = LAYOUT_OPTIONS.find((opt) => opt.type === activeLayout.type) || LAYOUT_OPTIONS[1]

  return (
    <div ref={menuRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded bg-gray-800 px-2 py-1 text-[10px] font-mono text-gray-400 hover:bg-gray-700 hover:text-gray-300"
        title="Change mixer layout"
        aria-label={`Current layout: ${currentOption?.label}. Click to change.`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {currentOption?.icon}
        <span className="hidden sm:inline">{currentOption?.label}</span>
        <svg
          className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute right-0 top-full z-50 mt-1 w-56 rounded border border-gray-700 bg-gray-900 py-1 shadow-lg"
          role="listbox"
          aria-label="Layout options"
        >
          {LAYOUT_OPTIONS.map((option) => (
            <button
              key={option.type}
              onClick={() => handleSelectLayout(option.type)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left transition-colors ${
                activeLayout.type === option.type
                  ? 'bg-primary-900/30 text-primary-400'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
              role="option"
              aria-selected={activeLayout.type === option.type}
            >
              <span className="flex-shrink-0">{option.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium">{option.label}</div>
                <div className="truncate text-[9px] text-gray-500">
                  {getLayoutDescription(option.type)}
                </div>
              </div>
              {activeLayout.type === option.type && (
                <svg className="h-4 w-4 flex-shrink-0 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}

          <div className="my-1 border-t border-gray-800" />

          {/* Quick layout info */}
          <div className="px-3 py-2">
            <div className="text-[9px] font-mono uppercase text-gray-600">Current Settings</div>
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px]">
              <span className="text-gray-500">Channel Width:</span>
              <span className="text-gray-400">{activeLayout.channelWidth}px</span>
              <span className="text-gray-500">Meter Height:</span>
              <span className="text-gray-400">{activeLayout.meterHeight}px</span>
              <span className="text-gray-500">Show EQ:</span>
              <span className="text-gray-400">{activeLayout.showEQ ? 'Yes' : 'No'}</span>
              <span className="text-gray-500">Show Comp:</span>
              <span className="text-gray-400">{activeLayout.showCompressor ? 'Yes' : 'No'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Compact layout switcher with just icons
 */
export function MixerLayoutSwitcherCompact({ roomId, className = '' }: MixerLayoutSwitcherProps) {
  const { currentLayout, setLayoutType, setRoomLayout, getRoomLayout } = useLayoutStore()
  const activeLayout = roomId ? getRoomLayout(roomId) : currentLayout

  const handleSelectLayout = (type: MixerLayoutType) => {
    if (roomId) {
      setRoomLayout(roomId, type)
    } else {
      setLayoutType(type)
    }
  }

  return (
    <div className={`flex items-center gap-0.5 ${className}`} role="radiogroup" aria-label="Mixer layout">
      {LAYOUT_OPTIONS.map((option) => (
        <button
          key={option.type}
          onClick={() => handleSelectLayout(option.type)}
          className={`rounded p-1 transition-colors ${
            activeLayout.type === option.type
              ? 'bg-primary-900/50 text-primary-400'
              : 'text-gray-500 hover:bg-gray-800 hover:text-gray-400'
          }`}
          title={`${option.label}: ${getLayoutDescription(option.type)}`}
          role="radio"
          aria-checked={activeLayout.type === option.type}
          aria-label={option.label}
        >
          {option.icon}
        </button>
      ))}
    </div>
  )
}
