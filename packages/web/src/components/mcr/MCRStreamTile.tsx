import { memo, useEffect, useState, useRef } from 'react'
import type { StreamHealthCheck } from '@streamvu/shared'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface MCRStreamTileProps {
  id: string
  name: string
  isOnline: boolean
  isMonitoring: boolean
  leftLevel: number
  rightLevel: number
  isMuted: boolean
  onToggleMute: () => void
  health: StreamHealthCheck | null
  isRecording?: boolean
  onStartRecording?: () => void
  onStopRecording?: () => void
}

const MCRStreamTile = memo(function MCRStreamTile({
  id,
  name,
  isOnline,
  isMonitoring,
  leftLevel,
  rightLevel,
  isMuted,
  onToggleMute,
  health,
  isRecording = false,
  onStartRecording,
  onStopRecording,
}: MCRStreamTileProps) {
  const [silenceSeconds, setSilenceSeconds] = useState(0)
  const peakLeftRef = useRef(0)
  const peakRightRef = useRef(0)
  const lastSoundTimeRef = useRef<number>(Date.now())
  const [, forceUpdate] = useState({})
  const [recordingDuration, setRecordingDuration] = useState(0)
  const recordingStartRef = useRef<number | null>(null)

  // Peak indicator hold - stays lit for minimum duration
  const [peakIndicatorLit, setPeakIndicatorLit] = useState(false)
  const peakHoldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const PEAK_HOLD_MS = 800 // How long peak indicator stays lit

  // Sortable hook
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  // Track when we last had audio
  useEffect(() => {
    if (leftLevel >= 0.01 || rightLevel >= 0.01) {
      lastSoundTimeRef.current = Date.now()
    }
  }, [leftLevel, rightLevel])

  // Silence detection - runs on a fixed interval
  useEffect(() => {
    if (!isMonitoring || !isOnline) {
      setSilenceSeconds(0)
      return
    }

    const interval = setInterval(() => {
      const secondsSinceSound = Math.floor((Date.now() - lastSoundTimeRef.current) / 1000)
      setSilenceSeconds(secondsSinceSound)
    }, 500)

    return () => clearInterval(interval)
  }, [isMonitoring, isOnline])

  // Peak hold with decay - runs on a fixed interval
  useEffect(() => {
    // Update peaks immediately when levels change
    if (leftLevel > peakLeftRef.current) {
      peakLeftRef.current = leftLevel
    }
    if (rightLevel > peakRightRef.current) {
      peakRightRef.current = rightLevel
    }
  }, [leftLevel, rightLevel])

  // Decay interval - separate from level updates
  useEffect(() => {
    const decay = setInterval(() => {
      peakLeftRef.current *= 0.95
      peakRightRef.current *= 0.95
      forceUpdate({})
    }, 100)

    return () => clearInterval(decay)
  }, [])

  // Recording duration tracker
  useEffect(() => {
    if (isRecording) {
      recordingStartRef.current = Date.now()
      const interval = setInterval(() => {
        if (recordingStartRef.current) {
          setRecordingDuration(Math.floor((Date.now() - recordingStartRef.current) / 1000))
        }
      }, 1000)
      return () => clearInterval(interval)
    } else {
      recordingStartRef.current = null
      setRecordingDuration(0)
    }
  }, [isRecording])

  const isSilenceAlarm = silenceSeconds >= 5
  const isPeaking = leftLevel > 1.0 || rightLevel > 1.0
  const isOver = leftLevel > 2.0 || rightLevel > 2.0 // +6 dB threshold

  // Peak indicator hold effect - keeps indicator lit for minimum duration
  useEffect(() => {
    if (isPeaking || isOver) {
      // Trigger peak indicator
      setPeakIndicatorLit(true)

      // Clear existing timeout
      if (peakHoldTimeoutRef.current) {
        clearTimeout(peakHoldTimeoutRef.current)
      }

      // Set new timeout to turn off after hold period
      peakHoldTimeoutRef.current = setTimeout(() => {
        setPeakIndicatorLit(false)
      }, PEAK_HOLD_MS)
    }

    return () => {
      if (peakHoldTimeoutRef.current) {
        clearTimeout(peakHoldTimeoutRef.current)
      }
    }
  }, [isPeaking, isOver, PEAK_HOLD_MS])

  // Get status color
  const getStatusClass = () => {
    if (!isOnline) return 'bg-red-600'
    if (isSilenceAlarm) return 'bg-yellow-500 animate-pulse'
    if (isOver) return 'bg-red-600 animate-pulse'
    if (isPeaking) return 'bg-red-500'
    return 'bg-green-500'
  }

  const getStatusText = () => {
    if (!isOnline) return 'OFFLINE'
    if (isSilenceAlarm) return `SILENCE ${silenceSeconds}s`
    if (isOver) return 'OVER'
    if (isPeaking) return 'PEAK'
    return 'ON AIR'
  }

  // VU Meter with extended range (+12 dB)
  // Scale: -48 to +12 dB (60 dB range)
  // 0 dB = level of 1.0
  // +6 dB = level of ~2.0
  // +12 dB = level of ~4.0
  const renderMeter = (level: number, peakLevel: number, channel: string) => {
    const segments = 30

    // Convert linear level to segment position
    // Level 1.0 = 0 dB = segment 24 (out of 30)
    // Level 2.0 = +6 dB = segment 27
    // Level 4.0 = +12 dB = segment 30
    // Level 0.0 = -inf = segment 0
    const levelToSegment = (lvl: number) => {
      if (lvl <= 0) return 0
      // dB = 20 * log10(level)
      // Map -48 dB to +12 dB across 30 segments
      const db = 20 * Math.log10(lvl)
      const clampedDb = Math.max(-48, Math.min(12, db))
      // -48 dB = 0, +12 dB = 30
      return Math.round(((clampedDb + 48) / 60) * segments)
    }

    const activeSegment = levelToSegment(level)
    const peakSegment = levelToSegment(peakLevel)

    return (
      <div className="flex-1">
        <div className="mb-1 text-center font-mono text-[10px] text-gray-500">{channel}</div>
        <div className="relative h-48 overflow-hidden rounded border border-gray-800 bg-gray-950">
          <div className="absolute inset-0 flex flex-col-reverse p-0.5">
            {Array.from({ length: segments }).map((_, i) => {
              const isActive = i < activeSegment
              const isPeakHold = i === peakSegment - 1 && peakSegment > activeSegment

              let color = 'bg-gray-900/50'

              if (isActive || isPeakHold) {
                // Segments 27-30 = +6 to +12 dB (EXTREME OVER - bright red with glow)
                if (i >= 27)
                  color = isPeakHold
                    ? 'bg-red-300'
                    : 'bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.9)]'
                // Segments 24-26 = 0 to +6 dB (PEAK/OVER - red)
                else if (i >= 24)
                  color = isPeakHold
                    ? 'bg-red-400'
                    : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]'
                // Segments 18-23 = -6 to 0 dB (HIGH - yellow)
                else if (i >= 18) color = isPeakHold ? 'bg-yellow-300' : 'bg-yellow-500'
                // Segments 0-17 = -48 to -6 dB (NORMAL - green)
                else color = isPeakHold ? 'bg-green-300' : 'bg-green-500'
              }

              return (
                <div
                  key={i}
                  className={`duration-50 mx-0.5 my-px flex-1 rounded-sm transition-colors ${color}`}
                />
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative overflow-hidden rounded-lg border-2 bg-black transition-colors ${
        !isOnline ? 'border-red-900' : isSilenceAlarm ? 'border-yellow-600' : 'border-gray-800'
      }`}
    >
      {/* Drag handle - Status tally light bar */}
      <div
        {...attributes}
        {...listeners}
        className={`h-2 ${getStatusClass()} cursor-grab active:cursor-grabbing`}
        title="Drag to reorder"
      />

      {/* Recording indicator */}
      {isRecording && (
        <div className="absolute right-3 top-3 flex items-center gap-1 rounded bg-red-900/80 px-2 py-0.5 text-xs">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-red-400">{formatDuration(recordingDuration)}</span>
        </div>
      )}

      {/* Main content */}
      <div className="p-3">
        {/* Stream name */}
        <h2 className="truncate text-lg font-bold text-white">{name}</h2>

        {/* Status text */}
        <div
          className={`mb-3 text-xs font-bold tracking-wider ${
            !isOnline
              ? 'text-red-500'
              : isSilenceAlarm
                ? 'text-yellow-400'
                : isOver
                  ? 'animate-pulse text-red-400'
                  : isPeaking
                    ? 'text-red-400'
                    : 'text-green-400'
          }`}
        >
          {getStatusText()}
        </div>

        {/* VU Meters */}
        <div className="mb-3 flex gap-2">
          {renderMeter(isMonitoring ? leftLevel : 0, isMonitoring ? peakLeftRef.current : 0, 'L')}
          {renderMeter(isMonitoring ? rightLevel : 0, isMonitoring ? peakRightRef.current : 0, 'R')}

          {/* dB scale and indicators */}
          <div className="flex w-8 flex-col justify-between py-1 font-mono text-[8px]">
            <div className="flex flex-col items-end gap-0">
              <span className="text-gray-600">+12</span>
              <span className="text-gray-600">+6</span>
              <span className={`font-bold ${peakIndicatorLit ? 'text-red-500' : 'text-gray-700'}`}>
                PEAK
              </span>
              <span className="text-gray-600">0</span>
            </div>
            <span className="text-right text-yellow-600">-6</span>
            <span className="text-right text-gray-600">-12</span>
            <span className="text-right text-gray-600">-18</span>
            <span className="text-right text-gray-600">-24</span>
            <span className="text-right text-gray-600">-36</span>
            <span className="text-right text-gray-600">-48</span>
          </div>
        </div>

        {/* Diagnostic Info Grid */}
        <div className="grid grid-cols-3 gap-x-2 gap-y-1 border-t border-gray-800 pt-2 font-mono text-[10px]">
          {/* Row 1: Format info */}
          <div className="text-gray-500">
            <span className="text-gray-600">CODEC</span>
            <div className={health?.codec ? 'text-cyan-400' : 'text-gray-700'}>
              {health?.codec || '---'}
            </div>
          </div>
          <div className="text-gray-500">
            <span className="text-gray-600">RATE</span>
            <div className={health?.bitrate ? 'text-cyan-400' : 'text-gray-700'}>
              {health?.bitrate ? `${health.bitrate}k` : '---'}
            </div>
          </div>
          <div className="text-gray-500">
            <span className="text-gray-600">SR</span>
            <div className={health?.sampleRate ? 'text-cyan-400' : 'text-gray-700'}>
              {health?.sampleRate ? `${(health.sampleRate / 1000).toFixed(1)}k` : '---'}
            </div>
          </div>

          {/* Row 2: Channel & Response */}
          <div className="text-gray-500">
            <span className="text-gray-600">CH</span>
            <div className={health?.channels ? 'text-cyan-400' : 'text-gray-700'}>
              {health?.channels === 2 ? 'ST' : health?.channels === 1 ? 'MO' : '---'}
            </div>
          </div>
          <div className="text-gray-500">
            <span className="text-gray-600">PING</span>
            <div
              className={
                health?.responseMs
                  ? health.responseMs < 200
                    ? 'text-green-400'
                    : health.responseMs < 500
                      ? 'text-yellow-400'
                      : 'text-red-400'
                  : 'text-gray-700'
              }
            >
              {health?.responseMs ? `${health.responseMs}ms` : '---'}
            </div>
          </div>
          <div className="text-gray-500">
            <span className="text-gray-600">SRV</span>
            <div
              className={health?.serverType ? 'text-cyan-400' : 'text-gray-700'}
              title={health?.serverType || ''}
            >
              {health?.serverType?.split('/')[0]?.slice(0, 6) || '---'}
            </div>
          </div>
        </div>

        {/* Station name if available */}
        {health?.stationName && (
          <div
            className="mt-1 truncate border-t border-gray-800/50 pt-1 font-mono text-[9px] text-gray-600"
            title={health.stationName}
          >
            {health.stationName}
          </div>
        )}

        {/* Current title if available */}
        {health?.currentTitle && (
          <div
            className="truncate font-mono text-[9px] text-amber-500/80"
            title={health.currentTitle}
          >
            {health.currentTitle}
          </div>
        )}

        {/* Control buttons */}
        {isMonitoring && isOnline && (
          <div className="mt-2 flex items-center justify-between border-t border-gray-800/50 pt-2">
            {/* Recording controls */}
            <div className="flex gap-1">
              {!isRecording ? (
                <button
                  onClick={onStartRecording}
                  className="flex items-center gap-1 rounded bg-gray-800 px-2 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-red-900 hover:text-red-400"
                  title="Start recording"
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  REC
                </button>
              ) : (
                <button
                  onClick={onStopRecording}
                  className="flex animate-pulse items-center gap-1 rounded bg-red-900 px-2 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-800"
                  title="Stop recording"
                >
                  <span className="h-2 w-2 bg-current" />
                  STOP
                </button>
              )}
            </div>

            {/* Mute button */}
            <button
              onClick={onToggleMute}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                isMuted
                  ? 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  : 'bg-green-600 text-white hover:bg-green-500'
              }`}
            >
              {isMuted ? 'MUTED' : 'AUDIO'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
})

export default MCRStreamTile
