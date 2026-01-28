import { useState, useEffect } from 'react'

type GridColumns = 'auto' | 1 | 2 | 3 | 4 | 5 | 6

interface MCRHeaderProps {
  onlineCount: number
  offlineCount: number
  silenceCount: number
  isMonitoring: boolean
  onStartMonitoring: () => void
  onStopMonitoring: () => void
  onToggleSidebar: () => void
  sidebarVisible: boolean
  gridColumns: GridColumns
  onGridColumnsChange: (columns: GridColumns) => void
  recordingsCount?: number
}

export default function MCRHeader({
  onlineCount,
  offlineCount,
  silenceCount,
  isMonitoring,
  onStartMonitoring,
  onStopMonitoring,
  onToggleSidebar,
  sidebarVisible,
  gridColumns,
  onGridColumnsChange,
  recordingsCount = 0,
}: MCRHeaderProps) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  return (
    <header className="border-b border-gray-800 bg-black px-4 py-2">
      <div className="flex items-center justify-between">
        {/* Left: Toggle & Title */}
        <div className="flex items-center gap-4">
          <button
            onClick={onToggleSidebar}
            className="rounded p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              {sidebarVisible ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              )}
            </svg>
          </button>

          <div>
            <h1 className="text-lg font-bold tracking-wide text-white">STREAM MONITOR</h1>
            <p className="text-[10px] tracking-widest text-gray-500">MASTER CONTROL</p>
          </div>
        </div>

        {/* Center: Status indicators */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <span className="text-sm text-gray-300">
              <span className="font-bold text-white">{onlineCount}</span> Online
            </span>
          </div>

          {offlineCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm text-red-400">
                <span className="font-bold">{offlineCount}</span> Offline
              </span>
            </div>
          )}

          {silenceCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-pulse rounded-full bg-yellow-500" />
              <span className="text-sm text-yellow-400">
                <span className="font-bold">{silenceCount}</span> Silence
              </span>
            </div>
          )}

          {recordingsCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span className="text-sm text-gray-300">
                <span className="font-bold text-white">{recordingsCount}</span> Recordings
              </span>
            </div>
          )}
        </div>

        {/* Right: Clock & Controls */}
        <div className="flex items-center gap-6">
          {/* Grid layout selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Grid</span>
            <div className="flex items-center rounded border border-gray-700 bg-gray-900">
              {(['auto', 1, 2, 3, 4, 5, 6] as GridColumns[]).map((cols) => (
                <button
                  key={cols}
                  onClick={() => onGridColumnsChange(cols)}
                  className={`px-2 py-1 font-mono text-xs transition-colors ${
                    gridColumns === cols
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                  title={cols === 'auto' ? 'Auto-fit columns' : `${cols} columns`}
                >
                  {cols === 'auto' ? 'A' : cols}
                </button>
              ))}
            </div>
          </div>

          {/* Monitor control */}
          {isMonitoring ? (
            <button
              onClick={onStopMonitoring}
              className="flex items-center gap-2 rounded border border-red-700 bg-red-900/50 px-4 py-2 text-red-400 transition-colors hover:bg-red-900"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-medium">STOP</span>
            </button>
          ) : (
            <button
              onClick={onStartMonitoring}
              className="flex items-center gap-2 rounded border border-green-700 bg-green-900/50 px-4 py-2 text-green-400 transition-colors hover:bg-green-900"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="text-sm font-medium">MONITOR</span>
            </button>
          )}

          {/* Clock */}
          <div className="text-right">
            <div className="font-mono text-2xl font-bold tracking-wider text-white">
              {formatTime(time)}
            </div>
            <div className="text-[10px] tracking-wider text-gray-500">{formatDate(time)}</div>
          </div>
        </div>
      </div>
    </header>
  )
}
