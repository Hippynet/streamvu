import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import type { AudioOutput, AudioChannel, BusRoutingConfig } from '@streamvu/shared'

interface OutputsPanelProps {
  roomId: string
  isHost: boolean
  onAddOutput?: () => void
  refreshKey?: number
  /** Hide the header (when parent provides its own) */
  hideHeader?: boolean
}

export function OutputsPanel({ roomId, isHost, onAddOutput, refreshKey, hideHeader = false }: OutputsPanelProps) {
  const [outputs, setOutputs] = useState<AudioOutput[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    loadOutputs()
  }, [roomId, refreshKey])

  const loadOutputs = async () => {
    try {
      const data = await api.audioOutputs.list(roomId)
      setOutputs(data)
    } catch (err) {
      console.error('Failed to load outputs:', err)
      setError('Failed to load outputs')
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async (outputId: string) => {
    try {
      const updated = await api.audioOutputs.start(roomId, outputId)
      setOutputs(prev => prev.map(o => o.id === outputId ? updated : o))
    } catch (err) {
      console.error('Failed to start output:', err)
    }
  }

  const handleStop = async (outputId: string) => {
    try {
      const updated = await api.audioOutputs.stop(roomId, outputId)
      setOutputs(prev => prev.map(o => o.id === outputId ? updated : o))
    } catch (err) {
      console.error('Failed to stop output:', err)
    }
  }

  const handleDelete = async (outputId: string) => {
    if (!confirm('Delete this output?')) return
    try {
      await api.audioOutputs.delete(roomId, outputId)
      setOutputs(prev => prev.filter(o => o.id !== outputId))
    } catch (err) {
      console.error('Failed to delete output:', err)
    }
  }

  const getChannelBadge = (channel: AudioChannel) => {
    switch (channel) {
      case 'PROGRAM':
        return <span className="bg-gray-800 px-0.5 text-[9px] font-mono text-gray-400">PGM</span>
      case 'TALKBACK':
        return <span className="bg-yellow-950/50 px-0.5 text-[9px] font-mono text-yellow-500">TB</span>
      case 'BOTH':
        return <span className="bg-purple-950/50 px-0.5 text-[9px] font-mono text-purple-400">BOTH</span>
      case 'AUX1':
        return <span className="bg-violet-950/50 px-0.5 text-[9px] font-mono text-violet-400">AUX1</span>
      case 'AUX2':
        return <span className="bg-violet-950/50 px-0.5 text-[9px] font-mono text-violet-400">AUX2</span>
      case 'AUX3':
        return <span className="bg-violet-950/50 px-0.5 text-[9px] font-mono text-violet-400">AUX3</span>
      case 'AUX4':
        return <span className="bg-violet-950/50 px-0.5 text-[9px] font-mono text-violet-400">AUX4</span>
      default:
        return <span className="bg-gray-900 px-0.5 text-[9px] font-mono text-gray-500">{channel}</span>
    }
  }

  const getBusRoutingBadges = (busRouting: BusRoutingConfig | null, channel: AudioChannel) => {
    if (!busRouting || Object.keys(busRouting).length === 0) {
      return getChannelBadge(channel)
    }

    // Show multi-bus badges
    const activeBuses = Object.entries(busRouting)
      .filter(([_, level]) => level && level > 0)
      .map(([bus, level]) => ({ bus, level: level as number }))

    if (activeBuses.length === 0) {
      return getChannelBadge(channel)
    }

    const getBusBadge = (bus: string, level: number) => {
      const opacity = level < 1 ? ` ${Math.round(level * 100)}%` : ''
      switch (bus) {
        case 'pgm':
          return <span key={bus} className="bg-gray-800 px-0.5 text-[9px] font-mono text-gray-400">PGM{opacity}</span>
        case 'tb':
          return <span key={bus} className="bg-yellow-950/50 px-0.5 text-[9px] font-mono text-yellow-500">TB{opacity}</span>
        case 'aux1':
          return <span key={bus} className="bg-violet-950/50 px-0.5 text-[9px] font-mono text-violet-400">AUX1{opacity}</span>
        case 'aux2':
          return <span key={bus} className="bg-violet-950/50 px-0.5 text-[9px] font-mono text-violet-400">AUX2{opacity}</span>
        case 'aux3':
          return <span key={bus} className="bg-violet-950/50 px-0.5 text-[9px] font-mono text-violet-400">AUX3{opacity}</span>
        case 'aux4':
          return <span key={bus} className="bg-violet-950/50 px-0.5 text-[9px] font-mono text-violet-400">AUX4{opacity}</span>
        default:
          return <span key={bus} className="bg-gray-900 px-0.5 text-[9px] font-mono text-gray-500">{bus}{opacity}</span>
      }
    }

    return (
      <span className="flex items-center gap-0.5">
        {activeBuses.map(({ bus, level }) => getBusBadge(bus, level))}
      </span>
    )
  }

  // Count active/connected outputs for collapsed view
  const activeCount = outputs.filter(o => o.isActive).length
  const connectedCount = outputs.filter(o => o.isConnected).length

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-2">
        <div className="h-4 w-4 animate-spin border-2 border-gray-600 border-t-gray-400"></div>
      </div>
    )
  }

  // When hideHeader is true, parent handles collapse - always show content
  const showContent = hideHeader || !isCollapsed

  return (
    <div className={`flex flex-col ${isCollapsed && !hideHeader ? '' : 'h-full'}`}>
      {/* Collapsible Header - only when not hidden */}
      {!hideHeader && (
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-between border-b border-gray-800 px-2 py-1.5 text-left hover:bg-gray-900/50 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <svg
              className={`h-3 w-3 text-gray-600 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Outputs</h3>
          </div>
          <div className="flex items-center gap-1">
            {outputs.length > 0 && (
              <span className="bg-gray-800 px-1 py-0.5 text-[9px] font-mono text-gray-500">
                {outputs.length}
              </span>
            )}
            {connectedCount > 0 && (
              <span className="bg-green-950/50 px-1 py-0.5 text-[9px] font-mono text-green-500">
                {connectedCount} LIVE
              </span>
            )}
            {activeCount > 0 && connectedCount === 0 && (
              <span className="bg-yellow-950/50 px-1 py-0.5 text-[9px] font-mono text-yellow-500">
                {activeCount} ACTIVE
              </span>
            )}
          </div>
        </button>
      )}

      {showContent && (
        <>
          <div className="flex-1 overflow-y-auto p-1.5">
            {error && (
              <div className="mb-1 bg-red-950/50 px-2 py-1 text-[10px] font-mono text-red-400">{error}</div>
            )}

            {outputs.length === 0 ? (
              <div className="py-6 text-center text-[10px] font-mono text-gray-600">
                NO OUTPUTS
              </div>
            ) : (
              <div className="space-y-0.5">
                {outputs.map((output) => (
                  <OutputItem
                    key={output.id}
                    output={output}
                    isHost={isHost}
                    channelBadge={getBusRoutingBadges(output.busRouting, output.channel)}
                    onStart={() => handleStart(output.id)}
                    onStop={() => handleStop(output.id)}
                    onDelete={() => handleDelete(output.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {isHost && (
            <div className="border-t border-gray-800 p-1.5">
              <button
                onClick={onAddOutput}
                className="flex w-full items-center justify-center gap-1.5 bg-gray-800 py-1.5 text-[10px] font-mono text-gray-400 hover:bg-gray-700 hover:text-gray-300"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                ADD OUTPUT
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface OutputItemProps {
  output: AudioOutput
  isHost: boolean
  channelBadge: React.ReactNode
  onStart: () => void
  onStop: () => void
  onDelete: () => void
}

function OutputItem({ output, isHost, channelBadge, onStart, onStop, onDelete }: OutputItemProps) {
  const [showMenu, setShowMenu] = useState(false)

  const statusIcon = output.isConnected ? (
    <span className="flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-green-400 opacity-75"></span>
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500"></span>
    </span>
  ) : output.isActive ? (
    <span className="h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
  ) : (
    <span className="h-1.5 w-1.5 rounded-full bg-gray-700"></span>
  )

  return (
    <div
      className={`group flex items-center gap-1.5 px-1.5 py-1 hover:bg-gray-900 ${
        output.isActive ? 'bg-gray-900/50 border-l-2 border-green-500' : 'border-l-2 border-transparent'
      }`}
    >
      <div className="relative flex-shrink-0">{statusIcon}</div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] text-white">{output.name}</div>
        <div className="flex items-center gap-1 text-[9px] font-mono text-gray-600">
          {channelBadge}
          <span>{output.codec.toUpperCase()} {output.bitrate}k</span>
          {output.isConnected && (
            <span className="text-green-500">LIVE</span>
          )}
        </div>
      </div>

      {/* Icecast indicator */}
      {output.type === 'ICECAST' && output.icecastHost && (
        <div className="hidden text-[8px] font-mono text-gray-600 group-hover:block">
          {output.icecastHost}:{output.icecastPort}
        </div>
      )}

      {isHost && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {output.isActive ? (
            <button
              onClick={onStop}
              className="bg-red-900/50 p-0.5 text-red-400 hover:bg-red-900/70"
              title="Stop streaming"
            >
              <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onStart}
              className="bg-green-900/50 p-0.5 text-green-400 hover:bg-green-900/70"
              title="Start streaming"
            >
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
              </svg>
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="bg-gray-800 p-0.5 text-gray-500 hover:bg-gray-700"
            >
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full z-10 mt-0.5 w-24 bg-gray-950 border border-gray-800 py-0.5 shadow-lg">
                <button
                  onClick={() => setShowMenu(false)}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-[10px] text-gray-400 hover:bg-gray-900"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={() => {
                    setShowMenu(false)
                    onDelete()
                  }}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-[10px] text-red-400 hover:bg-gray-900"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
