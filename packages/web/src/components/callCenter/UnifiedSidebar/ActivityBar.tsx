import { useState } from 'react'

export type SidebarPanelId =
  | 'io'
  | 'routing'
  | 'recording'
  | 'ifb'
  | 'srt'
  | 'greenroom'
  | 'roomswitcher'
  | 'remotecontrol'
  | 'whip'
  | 'multiviewer'

interface ActivityBarProps {
  activePanel: SidebarPanelId | null
  isHost: boolean
  onPanelClick: (panelId: SidebarPanelId) => void
  // Status indicators
  hasActiveSources?: boolean
  isRecording?: boolean
}

interface ActivityBarItem {
  id: SidebarPanelId
  label: string
  icon: React.ReactNode
  hostOnly: boolean
}

const ACTIVITY_ITEMS: ActivityBarItem[] = [
  {
    id: 'io',
    label: 'Sources & Outputs',
    hostOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.807-3.808-3.807-9.98 0-13.788m13.788 0c3.807 3.807 3.807 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    id: 'routing',
    label: 'Audio Routing',
    hostOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    id: 'recording',
    label: 'Recording',
    hostOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <circle cx="12" cy="12" r="8" stroke="currentColor" fill="none" />
        <circle cx="12" cy="12" r="4" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'ifb',
    label: 'IFB',
    hostOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
      </svg>
    ),
  },
  {
    id: 'srt',
    label: 'SRT Sources',
    hostOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    id: 'greenroom',
    label: 'Green Room',
    hostOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
  },
  {
    id: 'roomswitcher',
    label: 'Room Switcher',
    hostOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
      </svg>
    ),
  },
  {
    id: 'remotecontrol',
    label: 'Remote Control',
    hostOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
  {
    id: 'whip',
    label: 'WHIP Ingest',
    hostOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
  },
  {
    id: 'multiviewer',
    label: 'Multiviewer',
    hostOnly: true,
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
  },
]

/** VS Code-style tooltip component */
function SidebarTooltip({ label, visible }: { label: string; visible: boolean }) {
  if (!visible) return null

  return (
    <div
      className="pointer-events-none absolute right-full top-1/2 z-50 mr-2 -translate-y-1/2 whitespace-nowrap"
      role="tooltip"
    >
      <div className="relative rounded bg-gray-800 px-2 py-1 text-xs text-white shadow-lg">
        {label}
        {/* Arrow pointing right */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
          <div className="border-4 border-transparent border-l-gray-800" />
        </div>
      </div>
    </div>
  )
}

export function ActivityBar({
  activePanel,
  isHost,
  onPanelClick,
  hasActiveSources,
  isRecording,
}: ActivityBarProps) {
  const [hoveredItem, setHoveredItem] = useState<SidebarPanelId | null>(null)

  const visibleItems = ACTIVITY_ITEMS.filter(item => !item.hostOnly || isHost)

  // Group items: first group is IO & routing, second is tools
  const ioItems = visibleItems.filter(i => ['io', 'routing'].includes(i.id))
  const toolItems = visibleItems.filter(i => ['recording', 'ifb', 'srt', 'greenroom', 'roomswitcher', 'remotecontrol', 'whip', 'multiviewer'].includes(i.id))

  const renderItem = (item: ActivityBarItem) => {
    const isActive = activePanel === item.id
    const isHovered = hoveredItem === item.id

    // Status indicator
    let statusDot = null
    if (item.id === 'io' && hasActiveSources) {
      statusDot = <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-green-500" />
    } else if (item.id === 'recording' && isRecording) {
      statusDot = <span className="absolute right-1 top-1 h-2 w-2 animate-pulse rounded-full bg-red-500" />
    }

    return (
      <div
        key={item.id}
        className="relative"
        onMouseEnter={() => setHoveredItem(item.id)}
        onMouseLeave={() => setHoveredItem(null)}
      >
        <button
          onClick={() => onPanelClick(item.id)}
          aria-label={item.label}
          className={`
            relative flex h-12 w-12 items-center justify-center transition-colors
            ${isActive
              ? 'border-l-2 border-primary-500 bg-gray-900/50 text-white'
              : 'border-l-2 border-transparent text-gray-500 hover:bg-gray-900/30 hover:text-gray-300'
            }
          `}
        >
          {item.icon}
          {statusDot}
        </button>
        <SidebarTooltip label={item.label} visible={isHovered} />
      </div>
    )
  }

  return (
    <div className="flex h-full w-12 flex-col border-l border-gray-800 bg-gray-950">
      {/* I/O Section (host only) */}
      {ioItems.length > 0 && (
        <>
          {ioItems.map(renderItem)}
          <div className="mx-3 my-1 border-t border-gray-800" />
        </>
      )}

      {/* Host-only Tools */}
      {toolItems.map(renderItem)}

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  )
}
