import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../../services/api'
import type { AudioSource } from '@streamvu/shared'

interface FilePlayerProps {
  source: AudioSource
  roomId: string
  isHost: boolean
  onUpdate?: (source: AudioSource) => void
}

export function FilePlayer({ source, roomId, isHost, onUpdate }: FilePlayerProps) {
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [duration, setDuration] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()

  // Load waveform data
  useEffect(() => {
    if (!source.fileId) return

    const loadWaveform = async () => {
      try {
        const data = await api.files.getWaveform(source.fileId!)
        setWaveformPeaks(data.peaks)
      } catch (err) {
        console.error('Failed to load waveform:', err)
        // Generate placeholder peaks
        setWaveformPeaks(Array(100).fill(0).map(() => Math.random() * 0.5 + 0.1))
      } finally {
        setLoading(false)
      }
    }

    loadWaveform()

    // Get file info for duration
    api.files.get(source.fileId!).then(file => {
      if (file.duration) setDuration(file.duration)
    }).catch(() => {})
  }, [source.fileId])

  // Draw waveform
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || waveformPeaks.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height
    const barWidth = width / waveformPeaks.length
    const playedRatio = duration > 0 ? source.playbackPosition / duration : 0

    ctx.clearRect(0, 0, width, height)

    // Draw waveform bars
    waveformPeaks.forEach((peak, i) => {
      const x = i * barWidth
      const barHeight = peak * height * 0.8
      const y = (height - barHeight) / 2

      const ratio = i / waveformPeaks.length
      if (ratio <= playedRatio) {
        ctx.fillStyle = '#22c55e' // green for played
      } else {
        ctx.fillStyle = '#4b5563' // gray for unplayed
      }

      ctx.fillRect(x, y, barWidth - 1, barHeight)
    })

    // Draw playhead
    if (duration > 0) {
      const playheadX = playedRatio * width
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, height)
      ctx.stroke()
    }
  }, [waveformPeaks, source.playbackPosition, duration])

  useEffect(() => {
    drawWaveform()
  }, [drawWaveform])

  // Animation loop for smooth playhead movement during playback
  useEffect(() => {
    if (source.playbackState === 'PLAYING') {
      const animate = () => {
        drawWaveform()
        animationRef.current = requestAnimationFrame(animate)
      }
      animationRef.current = requestAnimationFrame(animate)
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [source.playbackState, drawWaveform])

  const handlePlay = async () => {
    try {
      const updated = await api.audioSources.play(roomId, source.id)
      onUpdate?.(updated)
    } catch (err) {
      console.error('Failed to play:', err)
    }
  }

  const handlePause = async () => {
    try {
      const updated = await api.audioSources.pause(roomId, source.id)
      onUpdate?.(updated)
    } catch (err) {
      console.error('Failed to pause:', err)
    }
  }

  const handleStop = async () => {
    try {
      const updated = await api.audioSources.stop(roomId, source.id)
      onUpdate?.(updated)
    } catch (err) {
      console.error('Failed to stop:', err)
    }
  }

  const handleSeek = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isHost || duration === 0) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const ratio = x / rect.width
    const position = ratio * duration

    try {
      const updated = await api.audioSources.seek(roomId, source.id, position)
      onUpdate?.(updated)
    } catch (err) {
      console.error('Failed to seek:', err)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStateIcon = () => {
    switch (source.playbackState) {
      case 'PLAYING':
        return (
          <span className="flex h-2 w-2">
            <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
          </span>
        )
      case 'PAUSED':
        return <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
      case 'LOADING':
        return <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500"></span>
      case 'ERROR':
        return <span className="h-2 w-2 rounded-full bg-red-500"></span>
      default:
        return <span className="h-2 w-2 rounded-full bg-gray-600"></span>
    }
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-3">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <div className="relative">{getStateIcon()}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-white">{source.name}</div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className={`rounded px-1 ${
              source.channel === 'PROGRAM'
                ? 'bg-primary-900/50 text-primary-400'
                : source.channel === 'TALKBACK'
                ? 'bg-yellow-900/50 text-yellow-400'
                : 'bg-purple-900/50 text-purple-400'
            }`}>
              {source.channel === 'PROGRAM' ? 'PGM' : source.channel === 'TALKBACK' ? 'TB' : 'BOTH'}
            </span>
            {source.playbackState === 'PLAYING' && (
              <span className="text-green-400">PLAYING</span>
            )}
            {source.playbackState === 'PAUSED' && (
              <span className="text-yellow-400">PAUSED</span>
            )}
          </div>
        </div>
      </div>

      {/* Waveform */}
      <div className="relative mb-2">
        {loading ? (
          <div className="flex h-16 items-center justify-center rounded bg-gray-900">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"></div>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className={`h-16 w-full rounded bg-gray-900 ${isHost ? 'cursor-pointer' : ''}`}
            onClick={handleSeek}
          />
        )}
      </div>

      {/* Time display */}
      <div className="mb-2 flex justify-between text-xs text-gray-400">
        <span>{formatTime(source.playbackPosition)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Controls */}
      {isHost && (
        <div className="flex items-center justify-center gap-2">
          {/* Stop button */}
          <button
            onClick={handleStop}
            className="rounded bg-gray-700 p-2 text-gray-300 hover:bg-gray-600"
            title="Stop"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>

          {/* Play/Pause button */}
          {source.playbackState === 'PLAYING' ? (
            <button
              onClick={handlePause}
              className="rounded bg-primary-600 p-2 text-white hover:bg-primary-500"
              title="Pause"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handlePlay}
              className="rounded bg-green-600 p-2 text-white hover:bg-green-500"
              title="Play"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}

          {/* Loop toggle */}
          <button
            className={`rounded p-2 ${
              source.loopEnabled
                ? 'bg-primary-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:text-white'
            }`}
            title="Loop"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
            </svg>
          </button>
        </div>
      )}

      {/* Error message */}
      {source.errorMessage && (
        <div className="mt-2 rounded bg-red-900/50 px-2 py-1 text-xs text-red-300">
          {source.errorMessage}
        </div>
      )}
    </div>
  )
}
