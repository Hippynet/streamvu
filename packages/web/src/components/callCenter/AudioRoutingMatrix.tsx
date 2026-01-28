/**
 * AudioRoutingMatrix - Crosspoint Routing Matrix for Audio Buses
 *
 * A professional broadcast-style routing panel that shows:
 * 1. Source → Bus routing matrix (crosspoint grid)
 * 2. Per-source aux send levels to each bus
 * 3. Bus output destinations (Icecast, SRT, Recording, etc.)
 *
 * Modeled after broadcast routing matrices like Calrec, Lawo, and Studer.
 */

import { useState, useCallback, useMemo } from 'react'
import type { BusType } from '../../hooks/useAudioEngine'

// ============================================================================
// TYPES
// ============================================================================

export interface RoutingSource {
  id: string
  label: string
  type: 'webrtc' | 'srt' | 'rist' | 'http' | 'file' | 'local'
  color?: string
}

export interface BusRouting {
  pgm: boolean
  tb: boolean
  aux1: boolean
  aux2: boolean
  aux3: boolean
  aux4: boolean
}

export interface AuxSendLevels {
  pgm: number // 0-1
  tb: number
  aux1: number
  aux2: number
  aux3: number
  aux4: number
}

export interface SourceRouting {
  buses: BusRouting
  auxLevels: AuxSendLevels
  preFader: { [K in BusType]?: boolean }
}

export interface OutputDestination {
  id: string
  label: string
  type: 'icecast' | 'srt' | 'rist' | 'recording' | 'ndi' | 'monitor'
  url?: string
  status: 'idle' | 'connecting' | 'connected' | 'error'
  busSource: BusType
}

interface AudioRoutingMatrixProps {
  sources: RoutingSource[]
  routing: Record<string, SourceRouting>
  outputs: OutputDestination[]
  onRoutingChange: (sourceId: string, busType: BusType, enabled: boolean) => void
  onAuxLevelChange: (sourceId: string, busType: BusType, level: number) => void
  onPreFaderToggle: (sourceId: string, busType: BusType, preFader: boolean) => void
  onOutputChange?: (outputId: string, busSource: BusType) => void
  embedded?: boolean
}

// Bus display names and colors
const BUS_CONFIG: Record<BusType, { label: string; shortLabel: string; color: string }> = {
  PGM: { label: 'Program', shortLabel: 'PGM', color: 'bg-red-500' },
  TB: { label: 'Talkback', shortLabel: 'TB', color: 'bg-amber-500' },
  AUX1: { label: 'Aux 1', shortLabel: 'AX1', color: 'bg-blue-500' },
  AUX2: { label: 'Aux 2', shortLabel: 'AX2', color: 'bg-green-500' },
  AUX3: { label: 'Aux 3', shortLabel: 'AX3', color: 'bg-purple-500' },
  AUX4: { label: 'Aux 4', shortLabel: 'AX4', color: 'bg-cyan-500' },
}

const ALL_BUSES: BusType[] = ['PGM', 'TB', 'AUX1', 'AUX2', 'AUX3', 'AUX4']

// ============================================================================
// CROSSPOINT CELL
// ============================================================================

interface CrosspointCellProps {
  sourceId: string
  busType: BusType
  enabled: boolean
  level: number
  preFader: boolean
  onToggle: () => void
  onLevelChange: (level: number) => void
  onPreFaderToggle: () => void
  showLevel?: boolean
}

function CrosspointCell({
  enabled,
  level,
  preFader,
  onToggle,
  onLevelChange,
  onPreFaderToggle,
  showLevel = false,
}: CrosspointCellProps) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div className="relative">
      {/* Main crosspoint button */}
      <button
        onClick={onToggle}
        onContextMenu={(e) => {
          e.preventDefault()
          setShowDetails(!showDetails)
        }}
        className={`
          w-10 h-10 rounded-sm border-2 transition-all duration-150
          flex items-center justify-center text-xs font-bold
          ${enabled
            ? 'bg-green-600 border-green-400 text-white shadow-[0_0_8px_rgba(34,197,94,0.5)]'
            : 'bg-zinc-800 border-zinc-600 text-zinc-500 hover:border-zinc-500'
          }
        `}
        title="Click to toggle, right-click for details"
      >
        {enabled ? 'ON' : ''}
      </button>

      {/* Level indicator (if aux send has level) */}
      {showLevel && level > 0 && (
        <div
          className="absolute bottom-0 left-0 right-0 h-1 bg-blue-500 rounded-b"
          style={{ width: `${level * 100}%` }}
        />
      )}

      {/* Details popup (on right-click) */}
      {showDetails && (
        <div className="absolute z-50 top-full left-0 mt-1 p-2 bg-zinc-900 border border-zinc-700 rounded shadow-lg min-w-[120px]">
          <div className="text-xs text-zinc-400 mb-2">Aux Level</div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={level}
            onChange={(e) => onLevelChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-zinc-700 rounded appearance-none cursor-pointer"
          />
          <div className="text-xs text-center text-zinc-500 mt-1">
            {(level * 100).toFixed(0)}%
          </div>
          <button
            onClick={onPreFaderToggle}
            className={`
              mt-2 w-full px-2 py-1 text-xs rounded
              ${preFader ? 'bg-amber-600 text-white' : 'bg-zinc-700 text-zinc-400'}
            `}
          >
            {preFader ? 'Pre-Fader' : 'Post-Fader'}
          </button>
          <button
            onClick={() => setShowDetails(false)}
            className="mt-2 w-full px-2 py-1 text-xs bg-zinc-700 text-zinc-300 rounded hover:bg-zinc-600"
          >
            Close
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// OUTPUT ROW
// ============================================================================

interface OutputRowProps {
  output: OutputDestination
  onBusChange?: (busType: BusType) => void
}

function OutputRow({ output, onBusChange }: OutputRowProps) {
  const statusColors = {
    idle: 'bg-zinc-600',
    connecting: 'bg-amber-500 animate-pulse',
    connected: 'bg-green-500',
    error: 'bg-red-500',
  }

  return (
    <div className="flex items-center gap-2 py-2 px-3 bg-zinc-800/50 rounded">
      {/* Status indicator */}
      <div className={`w-2 h-2 rounded-full ${statusColors[output.status]}`} />

      {/* Output info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-zinc-200 truncate">{output.label}</div>
        <div className="text-xs text-zinc-500 truncate">{output.url || output.type}</div>
      </div>

      {/* Bus source selector */}
      <select
        value={output.busSource}
        onChange={(e) => onBusChange?.(e.target.value as BusType)}
        className="bg-zinc-700 border border-zinc-600 text-zinc-300 text-xs rounded px-2 py-1"
      >
        {ALL_BUSES.map((bus) => (
          <option key={bus} value={bus}>
            {BUS_CONFIG[bus].shortLabel}
          </option>
        ))}
      </select>
    </div>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function AudioRoutingMatrix({
  sources,
  routing,
  outputs,
  onRoutingChange,
  onAuxLevelChange,
  onPreFaderToggle,
  onOutputChange,
  embedded = false,
}: AudioRoutingMatrixProps) {
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix')
  const [selectedBus, setSelectedBus] = useState<BusType | null>(null)

  // Get routing for a source
  const getSourceRouting = useCallback((sourceId: string): SourceRouting => {
    return routing[sourceId] || {
      buses: { pgm: true, tb: false, aux1: false, aux2: false, aux3: false, aux4: false },
      auxLevels: { pgm: 1, tb: 0, aux1: 0, aux2: 0, aux3: 0, aux4: 0 },
      preFader: {},
    }
  }, [routing])

  // Check if bus is enabled for source
  const isBusEnabled = useCallback((sourceId: string, busType: BusType): boolean => {
    const r = getSourceRouting(sourceId)
    const key = busType.toLowerCase() as keyof BusRouting
    return r.buses[key]
  }, [getSourceRouting])

  // Get aux level for source → bus
  const getAuxLevel = useCallback((sourceId: string, busType: BusType): number => {
    const r = getSourceRouting(sourceId)
    const key = busType.toLowerCase() as keyof AuxSendLevels
    return r.auxLevels[key]
  }, [getSourceRouting])

  // Check if pre-fader
  const isPreFader = useCallback((sourceId: string, busType: BusType): boolean => {
    const r = getSourceRouting(sourceId)
    return r.preFader[busType] ?? false
  }, [getSourceRouting])

  // Count active routings per bus
  const busSourceCounts = useMemo(() => {
    const counts: Record<BusType, number> = { PGM: 0, TB: 0, AUX1: 0, AUX2: 0, AUX3: 0, AUX4: 0 }
    sources.forEach((source) => {
      ALL_BUSES.forEach((bus) => {
        if (isBusEnabled(source.id, bus)) {
          counts[bus]++
        }
      })
    })
    return counts
  }, [sources, isBusEnabled])

  return (
    <div className={`flex flex-col h-full ${embedded ? '' : 'bg-zinc-900'}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
        <h3 className="text-sm font-semibold text-zinc-200">Audio Routing</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('matrix')}
            className={`px-2 py-1 text-xs rounded ${
              viewMode === 'matrix' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400'
            }`}
          >
            Matrix
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-2 py-1 text-xs rounded ${
              viewMode === 'list' ? 'bg-blue-600 text-white' : 'bg-zinc-700 text-zinc-400'
            }`}
          >
            List
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {viewMode === 'matrix' ? (
          <>
            {/* Crosspoint Matrix */}
            <div className="mb-6">
              <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
                Source → Bus Matrix
              </h4>

              {/* Matrix grid */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left text-xs text-zinc-500 font-normal p-2 w-32">Source</th>
                      {ALL_BUSES.map((bus) => (
                        <th
                          key={bus}
                          className="p-2 text-center"
                          onClick={() => setSelectedBus(selectedBus === bus ? null : bus)}
                        >
                          <div
                            className={`
                              inline-flex flex-col items-center px-2 py-1 rounded cursor-pointer
                              ${selectedBus === bus ? 'bg-zinc-700' : 'hover:bg-zinc-800'}
                            `}
                          >
                            <span className={`w-2 h-2 rounded-full ${BUS_CONFIG[bus].color} mb-1`} />
                            <span className="text-xs font-medium text-zinc-300">
                              {BUS_CONFIG[bus].shortLabel}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {busSourceCounts[bus]} src
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sources.map((source) => (
                      <tr key={source.id} className="border-t border-zinc-800">
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: source.color || '#6b7280' }}
                            />
                            <div>
                              <div className="text-sm text-zinc-300 truncate max-w-[100px]">
                                {source.label}
                              </div>
                              <div className="text-[10px] text-zinc-500 uppercase">
                                {source.type}
                              </div>
                            </div>
                          </div>
                        </td>
                        {ALL_BUSES.map((bus) => (
                          <td key={bus} className="p-2 text-center">
                            <CrosspointCell
                              sourceId={source.id}
                              busType={bus}
                              enabled={isBusEnabled(source.id, bus)}
                              level={getAuxLevel(source.id, bus)}
                              preFader={isPreFader(source.id, bus)}
                              onToggle={() => onRoutingChange(source.id, bus, !isBusEnabled(source.id, bus))}
                              onLevelChange={(level) => onAuxLevelChange(source.id, bus, level)}
                              onPreFaderToggle={() => onPreFaderToggle(source.id, bus, !isPreFader(source.id, bus))}
                              showLevel={bus !== 'PGM' && bus !== 'TB'}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                    {sources.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-zinc-500 text-sm">
                          No audio sources connected
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Quick actions for selected bus */}
            {selectedBus && (
              <div className="mb-6 p-3 bg-zinc-800 rounded">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-zinc-300">
                    {BUS_CONFIG[selectedBus].label}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => sources.forEach((s) => onRoutingChange(s.id, selectedBus, true))}
                      className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-500"
                    >
                      Route All
                    </button>
                    <button
                      onClick={() => sources.forEach((s) => onRoutingChange(s.id, selectedBus, false))}
                      className="px-2 py-1 text-xs bg-zinc-600 text-white rounded hover:bg-zinc-500"
                    >
                      Clear All
                    </button>
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  {busSourceCounts[selectedBus]} of {sources.length} sources routed
                </div>
              </div>
            )}
          </>
        ) : (
          /* List view - sources with bus toggles */
          <div className="space-y-3">
            {sources.map((source) => (
              <div key={source.id} className="p-3 bg-zinc-800 rounded">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: source.color || '#6b7280' }}
                  />
                  <span className="text-sm font-medium text-zinc-300">{source.label}</span>
                  <span className="text-xs text-zinc-500 uppercase">{source.type}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ALL_BUSES.map((bus) => (
                    <button
                      key={bus}
                      onClick={() => onRoutingChange(source.id, bus, !isBusEnabled(source.id, bus))}
                      className={`
                        px-2 py-1 text-xs rounded flex items-center gap-1
                        ${isBusEnabled(source.id, bus)
                          ? `${BUS_CONFIG[bus].color} text-white`
                          : 'bg-zinc-700 text-zinc-500'
                        }
                      `}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {BUS_CONFIG[bus].shortLabel}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Output destinations */}
        {outputs.length > 0 && (
          <div className="mt-6">
            <h4 className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
              Output Destinations
            </h4>
            <div className="space-y-2">
              {outputs.map((output) => (
                <OutputRow
                  key={output.id}
                  output={output}
                  onBusChange={(bus) => onOutputChange?.(output.id, bus)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer legend */}
      <div className="px-4 py-2 border-t border-zinc-700 text-xs text-zinc-500">
        <span>Right-click crosspoint for aux levels</span>
      </div>
    </div>
  )
}

export default AudioRoutingMatrix
