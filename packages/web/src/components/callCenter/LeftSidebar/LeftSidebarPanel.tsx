import { useCallback, useEffect, useRef, useState } from 'react'

const MIN_WIDTH = 200
const MAX_WIDTH = 400

interface LeftSidebarPanelProps {
  title: string
  isOpen: boolean
  width: number
  onWidthChange: (width: number) => void
  children: React.ReactNode
}

export function LeftSidebarPanel({
  title,
  isOpen,
  width,
  onWidthChange,
  children,
}: LeftSidebarPanelProps) {
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing || !panelRef.current) return
      const panelRect = panelRef.current.getBoundingClientRect()
      const newWidth = e.clientX - panelRect.left
      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth))
      onWidthChange(clampedWidth)
    },
    [isResizing, onWidthChange]
  )

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

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

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      className={`relative flex h-full flex-col border-r border-gray-800 bg-gray-950 ${
        isResizing ? '' : 'transition-all duration-200'
      }`}
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`
          absolute right-0 top-0 h-full w-1 cursor-ew-resize z-10
          hover:bg-blue-500/50 active:bg-blue-500/70
          ${isResizing ? 'bg-blue-500/70' : 'bg-transparent'}
        `}
        title="Drag to resize"
      />

      {/* Header */}
      <div className="flex h-10 items-center border-b border-gray-800 px-3">
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
          {title}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">{children}</div>
    </div>
  )
}
