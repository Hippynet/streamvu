/**
 * Multiviewer Component
 *
 * Professional multiviewer display showing:
 * - Grid of all participant video feeds
 * - Audio level meters under each tile
 * - Tally lights (on-air indication)
 * - Clock and timecode display
 * - Custom layout configurations
 */

import { useState, useMemo } from 'react'
import { formatTimecode, getTimeOfDayTimecode } from '../../utils/timecode'
import { useEffect, useRef } from 'react'

// Types
interface ParticipantFeed {
  id: string
  name: string
  videoTrack?: MediaStreamTrack
  audioLevel: number
  isOnAir: boolean
  isMuted: boolean
  isSpeaking: boolean
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor'
}

type LayoutKey = 'grid-2x2' | 'grid-3x3' | 'grid-4x4' | 'focus-pip' | 'focus-side'

interface MultiviewerProps {
  participants: ParticipantFeed[]
  layout?: LayoutKey
  showClock?: boolean
  showTimecode?: boolean
  showAudioMeters?: boolean
  showLabels?: boolean
  programFeedId?: string
  onTileClick?: (participantId: string) => void
  className?: string
}

interface LayoutConfig {
  cols: number
  rows: number
  focusIndex?: number
}

const LAYOUTS: Record<LayoutKey, LayoutConfig> = {
  'grid-2x2': { cols: 2, rows: 2 },
  'grid-3x3': { cols: 3, rows: 3 },
  'grid-4x4': { cols: 4, rows: 4 },
  'focus-pip': { cols: 2, rows: 2, focusIndex: 0 },
  'focus-side': { cols: 4, rows: 3, focusIndex: 0 },
}

// Video tile component
function VideoTile({
  feed,
  isProgram,
  showAudioMeter,
  showLabel,
  onClick,
  isFocused,
}: {
  feed: ParticipantFeed
  isProgram: boolean
  showAudioMeter: boolean
  showLabel: boolean
  onClick?: () => void
  isFocused?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && feed.videoTrack) {
      const stream = new MediaStream([feed.videoTrack])
      videoRef.current.srcObject = stream
    }
  }, [feed.videoTrack])

  const qualityColors = {
    excellent: 'bg-green-500',
    good: 'bg-green-400',
    fair: 'bg-yellow-500',
    poor: 'bg-red-500',
  }

  return (
    <div
      className={`relative overflow-hidden rounded-lg bg-zinc-900 ${
        isFocused ? 'col-span-2 row-span-2' : ''
      } ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      {/* Video or placeholder */}
      {feed.videoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-800">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-700 text-2xl font-semibold text-zinc-400">
            {feed.name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Tally light border */}
      {feed.isOnAir && (
        <div className="absolute inset-0 border-4 border-red-500 pointer-events-none" />
      )}

      {/* On-air badge */}
      {feed.isOnAir && (
        <div className="absolute left-2 top-2 rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-lg animate-pulse">
          ON AIR
        </div>
      )}

      {/* Program badge */}
      {isProgram && !feed.isOnAir && (
        <div className="absolute left-2 top-2 rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          PGM
        </div>
      )}

      {/* Mute indicator */}
      {feed.isMuted && (
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600/80">
          <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
          </svg>
        </div>
      )}

      {/* Speaking indicator */}
      {feed.isSpeaking && !feed.isMuted && (
        <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-green-500/80 animate-pulse">
          <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z" />
          </svg>
        </div>
      )}

      {/* Connection quality indicator */}
      <div className="absolute bottom-2 right-2">
        <div className={`h-2 w-2 rounded-full ${qualityColors[feed.connectionQuality]}`} />
      </div>

      {/* Audio meter */}
      {showAudioMeter && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-zinc-800">
          <div
            className={`h-full transition-all duration-75 ${
              feed.audioLevel > 0.9
                ? 'bg-red-500'
                : feed.audioLevel > 0.7
                ? 'bg-yellow-500'
                : 'bg-green-500'
            }`}
            style={{ width: `${feed.audioLevel * 100}%` }}
          />
        </div>
      )}

      {/* Label */}
      {showLabel && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-3 pt-6">
          <span className="text-sm font-medium text-white drop-shadow-lg">{feed.name}</span>
        </div>
      )}
    </div>
  )
}

// Clock display component
function ClockDisplay({ showTimecode }: { showTimecode: boolean }) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 100)
    return () => clearInterval(interval)
  }, [])

  const timecode = showTimecode
    ? formatTimecode(getTimeOfDayTimecode({ frameRate: 25, dropFrame: false }))
    : null

  return (
    <div className="flex flex-col items-end">
      <div className="font-mono text-2xl font-bold tabular-nums text-white">
        {time.toLocaleTimeString('en-GB', { hour12: false })}
      </div>
      {timecode && (
        <div className="font-mono text-sm tabular-nums text-zinc-400">{timecode}</div>
      )}
    </div>
  )
}

export function Multiviewer({
  participants,
  layout = 'grid-3x3',
  showClock = true,
  showTimecode = true,
  showAudioMeters = true,
  showLabels = true,
  programFeedId,
  onTileClick,
  className = '',
}: MultiviewerProps) {
  const [selectedLayout, setSelectedLayout] = useState(layout)
  const layoutConfig = LAYOUTS[selectedLayout]

  // Calculate grid style
  const gridStyle = useMemo(() => {
    const { cols, rows } = layoutConfig
    return {
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
    }
  }, [layoutConfig])

  // Fill empty slots with placeholders
  const displayItems = useMemo(() => {
    const totalSlots = layoutConfig.cols * layoutConfig.rows
    const items = [...participants]

    while (items.length < totalSlots) {
      items.push({
        id: `empty-${items.length}`,
        name: 'No Signal',
        audioLevel: 0,
        isOnAir: false,
        isMuted: true,
        isSpeaking: false,
        connectionQuality: 'poor',
      })
    }

    return items.slice(0, totalSlots)
  }, [participants, layoutConfig])

  return (
    <div className={`flex h-full flex-col bg-black ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2">
        <div className="flex items-center gap-4">
          <h2 className="font-semibold text-white">Multiviewer</h2>

          {/* Layout selector */}
          <div className="flex gap-1">
            {(Object.keys(LAYOUTS) as LayoutKey[]).map((layoutKey) => (
              <button
                key={layoutKey}
                onClick={() => setSelectedLayout(layoutKey)}
                className={`rounded px-2 py-1 text-xs font-medium ${
                  selectedLayout === layoutKey
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600'
                }`}
              >
                {layoutKey.replace('-', ' ')}
              </button>
            ))}
          </div>
        </div>

        {showClock && <ClockDisplay showTimecode={showTimecode} />}
      </div>

      {/* Video grid */}
      <div className="flex-1 p-2">
        <div className="grid h-full gap-2" style={gridStyle}>
          {displayItems.map((feed, index) => (
            <VideoTile
              key={feed.id}
              feed={feed}
              isProgram={feed.id === programFeedId}
              showAudioMeter={showAudioMeters}
              showLabel={showLabels}
              onClick={onTileClick ? () => onTileClick(feed.id) : undefined}
              isFocused={layoutConfig.focusIndex === index}
            />
          ))}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900 px-4 py-1.5 text-xs text-zinc-500">
        <div className="flex items-center gap-4">
          <span>
            {participants.filter((p) => !p.id.startsWith('empty-')).length} sources
          </span>
          <span>{participants.filter((p) => p.isOnAir).length} on air</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span>Excellent</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-yellow-500" />
            <span>Fair</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-red-500" />
            <span>Poor</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Compact single-feed preview component
export function FeedPreview({
  feed,
  showAudioMeter = true,
  showLabel = true,
  onClick,
  className = '',
}: {
  feed: ParticipantFeed
  showAudioMeter?: boolean
  showLabel?: boolean
  onClick?: () => void
  className?: string
}) {
  return (
    <div className={`aspect-video overflow-hidden rounded-lg ${className}`}>
      <VideoTile
        feed={feed}
        isProgram={false}
        showAudioMeter={showAudioMeter}
        showLabel={showLabel}
        onClick={onClick}
      />
    </div>
  )
}

// Multi-output status panel
interface OutputStatus {
  id: string
  name: string
  type: 'icecast' | 'srt' | 'recording'
  status: 'idle' | 'connecting' | 'streaming' | 'error' | 'reconnecting'
  duration?: number
  bitrate?: number
  error?: string
}

export function MultiOutputPanel({
  outputs,
  onStart,
  onStop,
  onRemove,
  className = '',
}: {
  outputs: OutputStatus[]
  onStart?: (id: string) => void
  onStop?: (id: string) => void
  onRemove?: (id: string) => void
  className?: string
}) {
  const statusColors = {
    idle: 'bg-zinc-500',
    connecting: 'bg-yellow-500 animate-pulse',
    streaming: 'bg-green-500',
    error: 'bg-red-500',
    reconnecting: 'bg-yellow-500 animate-pulse',
  }

  const typeIcons = {
    icecast: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
      </svg>
    ),
    srt: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 10H3V8h18v8zM6 15h2v-2h2v-2H8V9H6v2H4v2h2z" />
      </svg>
    ),
    recording: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="8" />
      </svg>
    ),
  }

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s
      .toString()
      .padStart(2, '0')}`
  }

  return (
    <div className={`rounded-lg bg-zinc-900 ${className}`}>
      <div className="border-b border-zinc-800 px-4 py-2">
        <h3 className="text-sm font-medium text-white">Outputs</h3>
      </div>

      <div className="divide-y divide-zinc-800">
        {outputs.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-zinc-500">
            No outputs configured
          </div>
        ) : (
          outputs.map((output) => (
            <div key={output.id} className="flex items-center gap-3 px-4 py-3">
              {/* Status indicator */}
              <div className={`h-2 w-2 rounded-full ${statusColors[output.status]}`} />

              {/* Type icon */}
              <div className="text-zinc-400">{typeIcons[output.type]}</div>

              {/* Name and info */}
              <div className="flex-1 min-w-0">
                <div className="truncate text-sm font-medium text-white">{output.name}</div>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="capitalize">{output.status}</span>
                  {output.duration !== undefined && output.status === 'streaming' && (
                    <span>{formatDuration(output.duration)}</span>
                  )}
                  {output.bitrate !== undefined && output.status === 'streaming' && (
                    <span>{output.bitrate} kbps</span>
                  )}
                  {output.error && <span className="text-red-400">{output.error}</span>}
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-1">
                {output.status === 'idle' && onStart && (
                  <button
                    onClick={() => onStart(output.id)}
                    className="rounded bg-green-600 px-2 py-1 text-xs font-medium text-white hover:bg-green-500"
                  >
                    Start
                  </button>
                )}
                {(output.status === 'streaming' || output.status === 'connecting') && onStop && (
                  <button
                    onClick={() => onStop(output.id)}
                    className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-500"
                  >
                    Stop
                  </button>
                )}
                {onRemove && (
                  <button
                    onClick={() => onRemove(output.id)}
                    className="rounded p-1 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                    title="Remove output"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Multiviewer
