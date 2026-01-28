/**
 * Bus Routing Matrix
 *
 * Visual routing matrix showing which buses feed which outputs.
 * Allows configuring per-bus levels for multi-bus output routing.
 */

import { useState, useCallback } from 'react'
import { api } from '../../services/api'
import type { AudioOutput, BusRoutingConfig } from '@streamvu/shared'

interface BusRoutingMatrixProps {
  roomId: string
  outputs: AudioOutput[]
  isHost: boolean
  onOutputUpdated: (output: AudioOutput) => void
  onStart?: (outputId: string) => void
  onStop?: (outputId: string) => void
  onDelete?: (outputId: string) => void
}

// Available buses in the system
const BUSES = [
  { id: 'pgm', label: 'PGM', color: 'bg-gray-700', textColor: 'text-gray-300' },
  { id: 'tb', label: 'TB', color: 'bg-yellow-900/50', textColor: 'text-yellow-400' },
  { id: 'aux1', label: 'AUX1', color: 'bg-violet-900/50', textColor: 'text-violet-400' },
  { id: 'aux2', label: 'AUX2', color: 'bg-violet-900/50', textColor: 'text-violet-400' },
  { id: 'aux3', label: 'AUX3', color: 'bg-violet-900/50', textColor: 'text-violet-400' },
  { id: 'aux4', label: 'AUX4', color: 'bg-violet-900/50', textColor: 'text-violet-400' },
] as const

type BusId = typeof BUSES[number]['id']

export function BusRoutingMatrix({
  roomId,
  outputs,
  isHost,
  onOutputUpdated,
  onStart,
  onStop,
  onDelete,
}: BusRoutingMatrixProps) {
  const [saving, setSaving] = useState<string | null>(null)
  const [editingLevel, setEditingLevel] = useState<{ outputId: string; bus: BusId } | null>(null)

  // Get bus level for an output
  const getBusLevel = useCallback((output: AudioOutput, busId: BusId): number => {
    if (output.busRouting) {
      return output.busRouting[busId] ?? 0
    }
    // Fall back to legacy channel field
    const channelToBus: Record<string, BusId> = {
      'PROGRAM': 'pgm',
      'TALKBACK': 'tb',
      'AUX1': 'aux1',
      'AUX2': 'aux2',
      'AUX3': 'aux3',
      'AUX4': 'aux4',
    }
    return channelToBus[output.channel] === busId ? 1 : 0
  }, [])

  // Toggle bus routing (on/off at full level)
  const toggleBusRouting = useCallback(async (output: AudioOutput, busId: BusId) => {
    if (!isHost) return

    const currentLevel = getBusLevel(output, busId)
    const newLevel = currentLevel > 0 ? 0 : 1

    // Build new routing config
    const newRouting: BusRoutingConfig = { ...output.busRouting }
    if (newLevel > 0) {
      newRouting[busId] = newLevel
    } else {
      delete newRouting[busId]
    }

    setSaving(output.id)
    try {
      // If output is streaming, use real-time levels API (broadcasts change + restarts encoder)
      // Otherwise, use regular routing API (just updates DB)
      const isStreaming = output.isActive || output.isConnected
      if (isStreaming) {
        await api.audioOutputs.updateLevels(roomId, output.id, newRouting)
        // Optimistically update local state
        onOutputUpdated({ ...output, busRouting: newRouting })
      } else {
        const updated = await api.audioOutputs.updateRouting(roomId, output.id, newRouting)
        onOutputUpdated(updated)
      }
    } catch (err) {
      console.error('Failed to update bus routing:', err)
    } finally {
      setSaving(null)
    }
  }, [roomId, isHost, getBusLevel, onOutputUpdated])

  // Update bus level
  const updateBusLevel = useCallback(async (output: AudioOutput, busId: BusId, level: number) => {
    if (!isHost) return

    const newRouting: BusRoutingConfig = { ...output.busRouting }
    if (level > 0) {
      newRouting[busId] = level
    } else {
      delete newRouting[busId]
    }

    setSaving(output.id)
    try {
      // If output is streaming, use real-time levels API (broadcasts change + restarts encoder)
      // Otherwise, use regular routing API (just updates DB)
      const isStreaming = output.isActive || output.isConnected
      if (isStreaming) {
        await api.audioOutputs.updateLevels(roomId, output.id, newRouting)
        // Optimistically update local state
        onOutputUpdated({ ...output, busRouting: newRouting })
      } else {
        const updated = await api.audioOutputs.updateRouting(roomId, output.id, newRouting)
        onOutputUpdated(updated)
      }
    } catch (err) {
      console.error('Failed to update bus level:', err)
    } finally {
      setSaving(null)
      setEditingLevel(null)
    }
  }, [roomId, isHost, onOutputUpdated])

  if (outputs.length === 0) {
    return (
      <div className="py-8 text-center text-[10px] font-mono text-gray-600">
        NO OUTPUTS CONFIGURED
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Header Row - Bus Labels */}
      <div className="flex border-b border-gray-800">
        <div className="w-24 flex-shrink-0 px-2 py-1.5 text-[9px] font-mono uppercase text-gray-500">
          Output
        </div>
        {BUSES.map((bus) => (
          <div
            key={bus.id}
            className={`w-12 flex-shrink-0 px-1 py-1.5 text-center text-[9px] font-mono uppercase ${bus.textColor}`}
          >
            {bus.label}
          </div>
        ))}
        <div className="w-20 flex-shrink-0 px-2 py-1.5 text-[9px] font-mono uppercase text-gray-500">
          Status
        </div>
        {isHost && (
          <div className="w-20 flex-shrink-0 px-2 py-1.5 text-center text-[9px] font-mono uppercase text-gray-500">
            Actions
          </div>
        )}
      </div>

      {/* Output Rows */}
      {outputs.map((output) => (
        <div
          key={output.id}
          className={`flex items-center border-b border-gray-800/50 hover:bg-gray-900/30 ${
            saving === output.id ? 'opacity-50' : ''
          }`}
        >
          {/* Output Name */}
          <div className="w-24 flex-shrink-0 px-2 py-2">
            <div className="truncate text-[10px] text-white">{output.name}</div>
            <div className="text-[8px] font-mono text-gray-600">
              {output.codec.toUpperCase()} {output.bitrate}k
            </div>
          </div>

          {/* Bus Routing Buttons */}
          {BUSES.map((bus) => {
            const level = getBusLevel(output, bus.id)
            const isActive = level > 0
            const isEditing = editingLevel?.outputId === output.id && editingLevel?.bus === bus.id

            return (
              <div key={bus.id} className="w-12 flex-shrink-0 px-1 py-1.5">
                {isEditing ? (
                  // Level editor
                  <div className="relative">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round(level * 100)}
                      onChange={(e) => {
                        const newLevel = parseInt(e.target.value) / 100
                        // Immediate visual feedback
                        const newRouting = { ...output.busRouting, [bus.id]: newLevel }
                        onOutputUpdated({ ...output, busRouting: newRouting })
                      }}
                      onMouseUp={(e) => {
                        const newLevel = parseInt((e.target as HTMLInputElement).value) / 100
                        updateBusLevel(output, bus.id, newLevel)
                      }}
                      onBlur={() => setEditingLevel(null)}
                      autoFocus
                      className="h-6 w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded [&::-webkit-slider-runnable-track]:bg-gray-700"
                    />
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 text-[8px] font-mono text-gray-400">
                      {Math.round(level * 100)}%
                    </div>
                  </div>
                ) : (
                  // Toggle button
                  <button
                    onClick={() => isHost && toggleBusRouting(output, bus.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      if (isHost && isActive) {
                        setEditingLevel({ outputId: output.id, bus: bus.id })
                      }
                    }}
                    disabled={!isHost || saving === output.id}
                    className={`
                      flex h-6 w-full items-center justify-center text-[9px] font-mono transition-colors
                      ${isActive
                        ? `${bus.color} ${bus.textColor} border border-current`
                        : 'border border-gray-800 bg-gray-900 text-gray-700 hover:border-gray-700 hover:text-gray-500'
                      }
                      ${!isHost ? 'cursor-not-allowed' : 'cursor-pointer'}
                    `}
                    title={isActive ? `${bus.label} @ ${Math.round(level * 100)}% (right-click to adjust)` : `Route to ${bus.label}`}
                  >
                    {isActive ? (level < 1 ? `${Math.round(level * 100)}` : 'ON') : '-'}
                  </button>
                )}
              </div>
            )
          })}

          {/* Status */}
          <div className="flex w-20 flex-shrink-0 items-center gap-1 px-2 py-1.5">
            {output.isConnected ? (
              <span className="flex items-center gap-1 text-[9px] font-mono text-green-500">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-green-500"></span>
                </span>
                LIVE
              </span>
            ) : output.isActive ? (
              <span className="flex items-center gap-1 text-[9px] font-mono text-yellow-500">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500"></span>
                STARTING
              </span>
            ) : output.errorMessage ? (
              <span className="text-[9px] font-mono text-red-400" title={output.errorMessage}>
                ERROR
              </span>
            ) : (
              <span className="text-[9px] font-mono text-gray-600">OFFLINE</span>
            )}
          </div>

          {/* Actions */}
          {isHost && (
            <div className="flex w-20 flex-shrink-0 items-center justify-center gap-1 px-2 py-1.5">
              {output.isActive ? (
                <button
                  onClick={() => onStop?.(output.id)}
                  className="rounded bg-red-900/50 p-1.5 text-red-400 hover:bg-red-900/70"
                  title="Stop streaming"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={() => onStart?.(output.id)}
                  className="rounded bg-green-900/50 p-1.5 text-green-400 hover:bg-green-900/70"
                  title="Start streaming"
                >
                  <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5.14v14l11-7-11-7z" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => onDelete?.(output.id)}
                className="rounded bg-gray-800 p-1.5 text-gray-500 hover:bg-gray-700 hover:text-gray-400"
                title="Delete output"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Legend */}
      <div className="border-t border-gray-800 px-2 py-1.5">
        <div className="text-[8px] font-mono text-gray-600">
          Click to toggle routing | Right-click to adjust level
        </div>
      </div>
    </div>
  )
}
