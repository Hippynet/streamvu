import { type ReactNode, useState, useRef, useCallback, useEffect } from 'react'

interface SidebarPanelProps {
  title: string
  isOpen: boolean
  children: ReactNode
  width?: number
  onWidthChange?: (width: number) => void
  minWidth?: number
  maxWidth?: number
}

const DEFAULT_WIDTH = 288 // w-72
const MIN_WIDTH = 200
const MAX_WIDTH = 600

export function SidebarPanel({
  title,
  isOpen,
  children,
  width = DEFAULT_WIDTH,
  onWidthChange,
  minWidth = MIN_WIDTH,
  maxWidth = MAX_WIDTH,
}: SidebarPanelProps) {
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !panelRef.current || !onWidthChange) return

    // Calculate new width based on mouse position relative to the right edge
    const panelRect = panelRef.current.getBoundingClientRect()
    const newWidth = panelRect.right - e.clientX

    // Clamp to min/max
    const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth))
    onWidthChange(clampedWidth)
  }, [isResizing, onWidthChange, minWidth, maxWidth])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  // Global mouse listeners for drag
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return (
    <div
      ref={panelRef}
      className={`
        relative flex h-full flex-col overflow-hidden border-l border-gray-800 bg-gray-950
        ${isResizing ? '' : 'transition-all duration-200 ease-in-out'}
        ${!isOpen ? 'w-0' : ''}
      `}
      style={{ width: isOpen ? width : 0 }}
    >
      {isOpen && (
        <>
          {/* Resize Handle */}
          <div
            onMouseDown={handleMouseDown}
            className={`
              absolute left-0 top-0 h-full w-1 cursor-ew-resize
              hover:bg-blue-500/50 active:bg-blue-500/70
              ${isResizing ? 'bg-blue-500/70' : 'bg-transparent'}
              z-10
            `}
            title="Drag to resize"
          />

          {/* Panel Header */}
          <div className="flex-shrink-0 border-b border-gray-800 px-3 py-2">
            <h2 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              {title}
            </h2>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </div>
        </>
      )}
    </div>
  )
}
