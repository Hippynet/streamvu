/**
 * Unified Outputs Panel
 *
 * Complete output management with bus routing matrix.
 * Provides a central point for managing:
 * - Output configuration (Icecast, SRT)
 * - Bus-to-output routing
 * - Stream start/stop controls
 */

import { useState, useEffect, useCallback } from 'react'
import { api } from '../../services/api'
import { BusRoutingMatrix } from './BusRoutingMatrix'
import type { AudioOutput, BusRoutingConfig } from '@streamvu/shared'

interface UnifiedOutputsPanelProps {
  roomId: string
  isHost: boolean
  onAddOutput?: () => void
  refreshKey?: number
}

type ViewMode = 'list' | 'matrix'

export function UnifiedOutputsPanel({
  roomId,
  isHost,
  onAddOutput,
  refreshKey,
}: UnifiedOutputsPanelProps) {
  const [outputs, setOutputs] = useState<AudioOutput[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('matrix')
  const [expandedOutput, setExpandedOutput] = useState<string | null>(null)

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

  const handleOutputUpdated = useCallback((updated: AudioOutput) => {
    setOutputs(prev => prev.map(o => o.id === updated.id ? updated : o))
  }, [])

  const handleStart = async (outputId: string) => {
    try {
      const updated = await api.audioOutputs.start(roomId, outputId)
      handleOutputUpdated(updated)
    } catch (err) {
      console.error('Failed to start output:', err)
    }
  }

  const handleStop = async (outputId: string) => {
    try {
      const updated = await api.audioOutputs.stop(roomId, outputId)
      handleOutputUpdated(updated)
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

  // Count active/connected outputs
  const activeCount = outputs.filter(o => o.isActive).length
  const connectedCount = outputs.filter(o => o.isConnected).length

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-gray-400"></div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header with view toggle */}
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
            Outputs
          </h3>
          {outputs.length > 0 && (
            <span className="bg-gray-800 px-1.5 py-0.5 text-[9px] font-mono text-gray-500">
              {outputs.length}
            </span>
          )}
          {connectedCount > 0 && (
            <span className="bg-green-950/50 px-1.5 py-0.5 text-[9px] font-mono text-green-500">
              {connectedCount} LIVE
            </span>
          )}
          {activeCount > 0 && connectedCount === 0 && (
            <span className="bg-yellow-950/50 px-1.5 py-0.5 text-[9px] font-mono text-yellow-500">
              {activeCount} ACTIVE
            </span>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('matrix')}
            className={`p-1 ${viewMode === 'matrix' ? 'text-primary-400' : 'text-gray-600 hover:text-gray-400'}`}
            title="Matrix View"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
            </svg>
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1 ${viewMode === 'list' ? 'text-primary-400' : 'text-gray-600 hover:text-gray-400'}`}
            title="List View"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mx-3 mt-2 bg-red-950/50 px-2 py-1 text-[10px] font-mono text-red-400">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {viewMode === 'matrix' ? (
          <BusRoutingMatrix
            roomId={roomId}
            outputs={outputs}
            isHost={isHost}
            onOutputUpdated={handleOutputUpdated}
            onStart={handleStart}
            onStop={handleStop}
            onDelete={handleDelete}
          />
        ) : (
          <OutputsList
            outputs={outputs}
            isHost={isHost}
            expandedOutput={expandedOutput}
            onToggleExpand={(id) => setExpandedOutput(expandedOutput === id ? null : id)}
            onStart={handleStart}
            onStop={handleStop}
            onDelete={handleDelete}
            onOutputUpdated={handleOutputUpdated}
            roomId={roomId}
          />
        )}
      </div>

      {/* Add Output Button */}
      {isHost && (
        <div className="border-t border-gray-800 p-2">
          <button
            onClick={onAddOutput}
            className="flex w-full items-center justify-center gap-1.5 bg-gray-800 py-2 text-[10px] font-mono text-gray-400 hover:bg-gray-700 hover:text-gray-300"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            ADD OUTPUT
          </button>
        </div>
      )}
    </div>
  )
}

// List view component
interface OutputsListProps {
  outputs: AudioOutput[]
  isHost: boolean
  expandedOutput: string | null
  onToggleExpand: (id: string) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
  onDelete: (id: string) => void
  onOutputUpdated: (output: AudioOutput) => void
  roomId: string
}

function OutputsList({
  outputs,
  isHost,
  expandedOutput,
  onToggleExpand,
  onStart,
  onStop,
  onDelete,
  onOutputUpdated,
  roomId,
}: OutputsListProps) {
  if (outputs.length === 0) {
    return (
      <div className="py-8 text-center text-[10px] font-mono text-gray-600">
        NO OUTPUTS CONFIGURED
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-800/50">
      {outputs.map((output) => (
        <OutputListItem
          key={output.id}
          output={output}
          isHost={isHost}
          isExpanded={expandedOutput === output.id}
          onToggleExpand={() => onToggleExpand(output.id)}
          onStart={() => onStart(output.id)}
          onStop={() => onStop(output.id)}
          onDelete={() => onDelete(output.id)}
          onOutputUpdated={onOutputUpdated}
          roomId={roomId}
        />
      ))}
    </div>
  )
}

interface OutputListItemProps {
  output: AudioOutput
  isHost: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onStart: () => void
  onStop: () => void
  onDelete: () => void
  onOutputUpdated: (output: AudioOutput) => void
  roomId: string
}

function OutputListItem({
  output,
  isHost,
  isExpanded,
  onToggleExpand,
  onStart,
  onStop,
  onDelete,
  onOutputUpdated,
  roomId,
}: OutputListItemProps) {
  const [savingRouting, setSavingRouting] = useState(false)

  // Get active buses
  const getActiveBuses = (): { bus: string; level: number }[] => {
    if (output.busRouting) {
      return Object.entries(output.busRouting)
        .filter(([_, level]) => level && level > 0)
        .map(([bus, level]) => ({ bus, level: level as number }))
    }
    // Legacy fallback
    const channelToBus: Record<string, string> = {
      'PROGRAM': 'pgm',
      'TALKBACK': 'tb',
      'AUX1': 'aux1',
      'AUX2': 'aux2',
      'AUX3': 'aux3',
      'AUX4': 'aux4',
    }
    const bus = channelToBus[output.channel]
    return bus ? [{ bus, level: 1 }] : []
  }

  const activeBuses = getActiveBuses()

  const getBusBadge = (bus: string, level: number) => {
    const opacity = level < 1 ? ` ${Math.round(level * 100)}%` : ''
    const styles: Record<string, string> = {
      pgm: 'bg-gray-700 text-gray-300',
      tb: 'bg-yellow-900/50 text-yellow-400',
      aux1: 'bg-violet-900/50 text-violet-400',
      aux2: 'bg-violet-900/50 text-violet-400',
      aux3: 'bg-violet-900/50 text-violet-400',
      aux4: 'bg-violet-900/50 text-violet-400',
    }
    return (
      <span key={bus} className={`px-1 py-0.5 text-[8px] font-mono uppercase ${styles[bus] || 'bg-gray-800 text-gray-500'}`}>
        {bus}{opacity}
      </span>
    )
  }

  const updateBusRouting = async (newRouting: BusRoutingConfig) => {
    setSavingRouting(true)
    try {
      const updated = await api.audioOutputs.updateRouting(roomId, output.id, newRouting)
      onOutputUpdated(updated)
    } catch (err) {
      console.error('Failed to update routing:', err)
    } finally {
      setSavingRouting(false)
    }
  }

  const toggleBus = (busId: string) => {
    const newRouting: BusRoutingConfig = { ...output.busRouting }
    const currentLevel = newRouting[busId as keyof BusRoutingConfig] ?? 0
    if (currentLevel > 0) {
      delete newRouting[busId as keyof BusRoutingConfig]
    } else {
      ;(newRouting as Record<string, number>)[busId] = 1
    }
    updateBusRouting(newRouting)
  }

  return (
    <div className={`${output.isActive ? 'bg-gray-900/30' : ''}`}>
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Status indicator */}
        <div className="relative flex-shrink-0">
          {output.isConnected ? (
            <span className="flex h-2 w-2">
              <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
            </span>
          ) : output.isActive ? (
            <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
          ) : (
            <span className="h-2 w-2 rounded-full bg-gray-700"></span>
          )}
        </div>

        {/* Output info */}
        <button
          onClick={onToggleExpand}
          className="min-w-0 flex-1 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="truncate text-[11px] text-white">{output.name}</span>
            {output.isConnected && (
              <span className="text-[9px] font-mono text-green-500">LIVE</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono text-gray-600">
              {output.type} {output.codec.toUpperCase()} {output.bitrate}k
            </span>
            <span className="flex items-center gap-0.5">
              {activeBuses.map(({ bus, level }) => getBusBadge(bus, level))}
            </span>
          </div>
        </button>

        {/* Actions */}
        {isHost && (
          <div className="flex items-center gap-1">
            {output.isActive ? (
              <button
                onClick={onStop}
                className="rounded bg-red-900/50 p-1.5 text-red-400 hover:bg-red-900/70"
                title="Stop"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" />
                </svg>
              </button>
            ) : (
              <button
                onClick={onStart}
                className="rounded bg-green-900/50 p-1.5 text-green-400 hover:bg-green-900/70"
                title="Start"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5.14v14l11-7-11-7z" />
                </svg>
              </button>
            )}
            <button
              onClick={onDelete}
              className="rounded bg-gray-800 p-1.5 text-gray-500 hover:bg-gray-700 hover:text-gray-400"
              title="Delete"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t border-gray-800/50 bg-gray-950/50 px-3 py-3">
          {/* Bus Routing */}
          <div className="mb-3">
            <div className="mb-1.5 text-[9px] font-mono uppercase text-gray-500">Bus Routing</div>
            <div className={`flex flex-wrap gap-1 ${savingRouting ? 'opacity-50' : ''}`}>
              {['pgm', 'tb', 'aux1', 'aux2', 'aux3', 'aux4'].map((busId) => {
                const level = output.busRouting?.[busId as keyof BusRoutingConfig] ?? 0
                const isActive = level > 0
                const styles: Record<string, { active: string; inactive: string }> = {
                  pgm: { active: 'bg-gray-700 text-gray-200 border-gray-600', inactive: 'text-gray-600' },
                  tb: { active: 'bg-yellow-900/50 text-yellow-400 border-yellow-700', inactive: 'text-gray-600' },
                  aux1: { active: 'bg-violet-900/50 text-violet-400 border-violet-700', inactive: 'text-gray-600' },
                  aux2: { active: 'bg-violet-900/50 text-violet-400 border-violet-700', inactive: 'text-gray-600' },
                  aux3: { active: 'bg-violet-900/50 text-violet-400 border-violet-700', inactive: 'text-gray-600' },
                  aux4: { active: 'bg-violet-900/50 text-violet-400 border-violet-700', inactive: 'text-gray-600' },
                }
                return (
                  <button
                    key={busId}
                    onClick={() => isHost && toggleBus(busId)}
                    disabled={!isHost || savingRouting}
                    className={`
                      px-2 py-1 text-[9px] font-mono uppercase transition-colors border
                      ${isActive ? styles[busId]?.active : `border-gray-800 bg-gray-900 ${styles[busId]?.inactive} hover:border-gray-700`}
                      ${!isHost ? 'cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    {busId.toUpperCase()}
                    {isActive && level < 1 && ` ${Math.round(level * 100)}%`}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Output details */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px]">
            <div>
              <span className="text-gray-600">Type:</span>
              <span className="ml-1 text-gray-400">{output.type}</span>
            </div>
            <div>
              <span className="text-gray-600">Codec:</span>
              <span className="ml-1 text-gray-400">{output.codec} @ {output.bitrate}kbps</span>
            </div>
            {output.type === 'ICECAST' && output.icecastHost && (
              <>
                <div>
                  <span className="text-gray-600">Server:</span>
                  <span className="ml-1 text-gray-400">{output.icecastHost}:{output.icecastPort}</span>
                </div>
                <div>
                  <span className="text-gray-600">Mount:</span>
                  <span className="ml-1 text-gray-400">{output.icecastMount}</span>
                </div>
              </>
            )}
            {output.type === 'SRT' && output.srtHost && (
              <>
                <div>
                  <span className="text-gray-600">Host:</span>
                  <span className="ml-1 text-gray-400">{output.srtHost}:{output.srtPort}</span>
                </div>
                <div>
                  <span className="text-gray-600">Mode:</span>
                  <span className="ml-1 text-gray-400">{output.srtMode}</span>
                </div>
              </>
            )}
          </div>

          {/* Error message */}
          {output.errorMessage && (
            <div className="mt-2 bg-red-950/30 px-2 py-1 text-[9px] text-red-400">
              {output.errorMessage}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
