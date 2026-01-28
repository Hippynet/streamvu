import { useState } from 'react'

export type LeftPanelId = 'participants' | 'settings'

interface LeftActivityBarProps {
  activePanel: LeftPanelId | null
  onPanelClick: (panelId: LeftPanelId) => void
  // Status indicators
  participantCount?: number
}

interface ActivityBarItem {
  id: LeftPanelId
  label: string
  icon: React.ReactNode
}

const ACTIVITY_ITEMS: ActivityBarItem[] = [
  {
    id: 'participants',
    label: 'Participants',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
      </svg>
    ),
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
  },
]

/** VS Code-style tooltip component */
function SidebarTooltip({ label, visible }: { label: string; visible: boolean }) {
  if (!visible) return null

  return (
    <div
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap"
      role="tooltip"
    >
      <div className="relative rounded bg-gray-800 px-2 py-1 text-xs text-white shadow-lg">
        {label}
        {/* Arrow pointing left */}
        <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2">
          <div className="border-4 border-transparent border-r-gray-800" />
        </div>
      </div>
    </div>
  )
}

export function LeftActivityBar({
  activePanel,
  onPanelClick,
  participantCount = 0,
}: LeftActivityBarProps) {
  const [hoveredItem, setHoveredItem] = useState<LeftPanelId | null>(null)

  const renderItem = (item: ActivityBarItem) => {
    const isActive = activePanel === item.id
    const isHovered = hoveredItem === item.id

    // Status indicator
    let statusBadge = null
    if (item.id === 'participants' && participantCount > 0) {
      statusBadge = (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-medium text-white">
          {participantCount}
        </span>
      )
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
              ? 'border-r-2 border-primary-500 bg-gray-900/50 text-white'
              : 'border-r-2 border-transparent text-gray-500 hover:bg-gray-900/30 hover:text-gray-300'
            }
          `}
        >
          {item.icon}
          {statusBadge}
        </button>
        <SidebarTooltip label={item.label} visible={isHovered} />
      </div>
    )
  }

  return (
    <div className="flex h-full w-12 flex-col border-r border-gray-800 bg-gray-950">
      {/* Main items */}
      {ACTIVITY_ITEMS.map(renderItem)}

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  )
}
