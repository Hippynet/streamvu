/**
 * Timecode Display Component
 *
 * Professional timecode display for broadcast applications.
 * Supports:
 * - Time-of-day (TOD) display
 * - Free-run timecode
 * - External timecode sync (from SRT streams)
 * - Multiple frame rates
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  formatTimecode,
  getTimeOfDayTimecode,
  createFreeRunGenerator,
  framesToTimecode,
  type TimecodeFrameRate,
  type TimecodeValue,
  type TimecodeOptions,
} from '../../utils/timecode'

type TimecodeMode = 'TOD' | 'FREE_RUN' | 'EXTERNAL'

interface TimecodeDisplayProps {
  mode?: TimecodeMode
  frameRate?: TimecodeFrameRate
  dropFrame?: boolean
  externalTimecode?: string // For external sync
  showFrameRate?: boolean
  showMode?: boolean
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  onTimecodeChange?: (tc: TimecodeValue) => void
}

const SIZE_CLASSES = {
  sm: 'text-lg',
  md: 'text-2xl',
  lg: 'text-4xl',
  xl: 'text-6xl',
}

export function TimecodeDisplay({
  mode = 'TOD',
  frameRate = 25,
  dropFrame = false,
  externalTimecode,
  showFrameRate = true,
  showMode = true,
  size = 'lg',
  className = '',
  onTimecodeChange,
}: TimecodeDisplayProps) {
  const [timecode, setTimecode] = useState<TimecodeValue>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    frames: 0,
    totalFrames: 0,
    dropFrame: false,
    frameRate: 25,
  })

  const generatorRef = useRef(createFreeRunGenerator({ frameRate, dropFrame }))
  const animationFrameRef = useRef<number>()
  const lastTotalFramesRef = useRef<number>(-1)
  const onTimecodeChangeRef = useRef(onTimecodeChange)

  // Keep callback ref up to date without triggering effect
  useEffect(() => {
    onTimecodeChangeRef.current = onTimecodeChange
  }, [onTimecodeChange])

  const options: TimecodeOptions = useMemo(() => ({ frameRate, dropFrame }), [frameRate, dropFrame])

  // Update generator when options change
  useEffect(() => {
    generatorRef.current = createFreeRunGenerator({ frameRate, dropFrame })
  }, [frameRate, dropFrame])

  // Main update loop - stable effect that doesn't restart
  useEffect(() => {
    let isActive = true

    const updateTimecode = () => {
      if (!isActive) return

      let newTimecode: TimecodeValue

      switch (mode) {
        case 'TOD':
          newTimecode = getTimeOfDayTimecode(options)
          break

        case 'FREE_RUN':
          newTimecode = generatorRef.current.getCurrentTimecode()
          break

        case 'EXTERNAL':
          // Parse external timecode if available
          if (externalTimecode) {
            // Try to parse common timecode formats
            const match = externalTimecode.match(/(\d{2}):(\d{2}):(\d{2})[;:](\d{2})/)
            if (match) {
              const [, h, m, s, f] = match.map(Number)
              newTimecode = framesToTimecode(
                (h * 3600 + m * 60 + s) * Math.ceil(frameRate) + f,
                options
              )
            } else {
              // Keep zeros if parse fails
              newTimecode = framesToTimecode(0, options)
            }
          } else {
            // No external timecode, show zeros
            newTimecode = framesToTimecode(0, options)
          }
          break

        default:
          newTimecode = framesToTimecode(0, options)
      }

      // Only update state if totalFrames changed (prevents unnecessary re-renders)
      if (newTimecode.totalFrames !== lastTotalFramesRef.current) {
        lastTotalFramesRef.current = newTimecode.totalFrames
        setTimecode(newTimecode)
        onTimecodeChangeRef.current?.(newTimecode)
      }

      animationFrameRef.current = requestAnimationFrame(updateTimecode)
    }

    animationFrameRef.current = requestAnimationFrame(updateTimecode)

    return () => {
      isActive = false
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [mode, externalTimecode, options]) // options already includes frameRate and dropFrame

  // Free-run controls
  const reset = useCallback(() => {
    generatorRef.current.reset()
  }, [])

  const togglePause = useCallback(() => {
    if (generatorRef.current.isPaused()) {
      generatorRef.current.resume()
    } else {
      generatorRef.current.pause()
    }
  }, [])

  const isPaused = mode === 'FREE_RUN' && generatorRef.current.isPaused()

  const getFrameRateLabel = (rate: TimecodeFrameRate): string => {
    switch (rate) {
      case 23.976 as TimecodeFrameRate: return '23.976'
      case 24: return '24'
      case 25: return '25'
      case 29.97: return '29.97'
      case 30: return '30'
      case 50: return '50'
      case 59.94: return '59.94'
      case 60: return '60'
      default: return String(rate)
    }
  }

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      {/* Timecode display */}
      <div className="relative">
        <div
          className={`font-mono tabular-nums tracking-tight ${SIZE_CLASSES[size]} ${
            isPaused ? 'text-yellow-400 animate-pulse' : 'text-white'
          }`}
        >
          {formatTimecode(timecode)}
        </div>

        {/* Drop-frame indicator */}
        {dropFrame && (
          <div className="absolute -right-4 top-0 text-[10px] font-medium text-amber-500">
            DF
          </div>
        )}
      </div>

      {/* Status row */}
      {(showMode || showFrameRate) && (
        <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
          {showMode && (
            <span className={mode === 'EXTERNAL' && !externalTimecode ? 'text-red-400' : ''}>
              {mode === 'TOD' && 'TIME OF DAY'}
              {mode === 'FREE_RUN' && (isPaused ? 'PAUSED' : 'FREE RUN')}
              {mode === 'EXTERNAL' && (externalTimecode ? 'EXT SYNC' : 'NO SYNC')}
            </span>
          )}
          {showFrameRate && (
            <span>
              {getFrameRateLabel(frameRate)}fps
              {dropFrame && ' DF'}
            </span>
          )}
        </div>
      )}

      {/* Free-run controls */}
      {mode === 'FREE_RUN' && (
        <div className="mt-2 flex gap-2">
          <button
            onClick={togglePause}
            className="rounded bg-zinc-700 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-600"
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={reset}
            className="rounded bg-zinc-700 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-600"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  )
}

// Compact version for status bars
export function CompactTimecodeDisplay({
  mode = 'TOD',
  frameRate = 25,
  dropFrame = false,
  externalTimecode,
  className = '',
}: Omit<TimecodeDisplayProps, 'size' | 'showFrameRate' | 'showMode'>) {
  const [timecode, setTimecode] = useState<TimecodeValue>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    frames: 0,
    totalFrames: 0,
    dropFrame: false,
    frameRate: 25,
  })

  const generatorRef = useRef(createFreeRunGenerator({ frameRate, dropFrame }))
  const animationFrameRef = useRef<number>()
  const lastTotalFramesRef = useRef<number>(-1)

  const options: TimecodeOptions = useMemo(() => ({ frameRate, dropFrame }), [frameRate, dropFrame])

  useEffect(() => {
    generatorRef.current = createFreeRunGenerator({ frameRate, dropFrame })
  }, [frameRate, dropFrame])

  useEffect(() => {
    let isActive = true

    const updateTimecode = () => {
      if (!isActive) return

      let newTimecode: TimecodeValue

      switch (mode) {
        case 'TOD':
          newTimecode = getTimeOfDayTimecode(options)
          break
        case 'FREE_RUN':
          newTimecode = generatorRef.current.getCurrentTimecode()
          break
        case 'EXTERNAL':
          if (externalTimecode) {
            const match = externalTimecode.match(/(\d{2}):(\d{2}):(\d{2})[;:](\d{2})/)
            if (match) {
              const [, h, m, s, f] = match.map(Number)
              newTimecode = framesToTimecode(
                (h * 3600 + m * 60 + s) * Math.ceil(frameRate) + f,
                options
              )
            } else {
              newTimecode = framesToTimecode(0, options)
            }
          } else {
            newTimecode = framesToTimecode(0, options)
          }
          break
        default:
          newTimecode = framesToTimecode(0, options)
      }

      // Only update if changed
      if (newTimecode.totalFrames !== lastTotalFramesRef.current) {
        lastTotalFramesRef.current = newTimecode.totalFrames
        setTimecode(newTimecode)
      }

      animationFrameRef.current = requestAnimationFrame(updateTimecode)
    }

    animationFrameRef.current = requestAnimationFrame(updateTimecode)

    return () => {
      isActive = false
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [mode, externalTimecode, options]) // options already includes frameRate and dropFrame

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-[10px] font-mono uppercase text-zinc-500">TC</span>
      <span className="font-mono text-sm tabular-nums text-white">
        {formatTimecode(timecode)}
      </span>
    </div>
  )
}

// Timer component (counts up or down)
interface TimecodeTimerProps {
  duration?: number // In seconds, for countdown
  countDown?: boolean
  autoStart?: boolean
  frameRate?: TimecodeFrameRate
  onComplete?: () => void
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function TimecodeTimer({
  duration,
  countDown = false,
  autoStart = false,
  frameRate = 25,
  onComplete,
  size = 'md',
  className = '',
}: TimecodeTimerProps) {
  const [isRunning, setIsRunning] = useState(autoStart)
  const [elapsed, setElapsed] = useState(0)

  const startTimeRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number>()

  const options: TimecodeOptions = { frameRate, dropFrame: false }

  useEffect(() => {
    if (!isRunning) return

    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now()
    }

    const update = () => {
      const now = Date.now()
      const newElapsed = (now - startTimeRef.current!) / 1000

      if (countDown && duration && newElapsed >= duration) {
        setElapsed(duration)
        setIsRunning(false)
        onComplete?.()
        return
      }

      setElapsed(newElapsed)
      animationFrameRef.current = requestAnimationFrame(update)
    }

    animationFrameRef.current = requestAnimationFrame(update)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isRunning, countDown, duration, onComplete])

  const displaySeconds = countDown && duration
    ? Math.max(0, duration - elapsed)
    : elapsed

  const totalFrames = Math.floor(displaySeconds * frameRate)
  const timecode = framesToTimecode(totalFrames, options)

  const start = () => {
    startTimeRef.current = null
    setIsRunning(true)
  }

  const pause = () => {
    setIsRunning(false)
  }

  const reset = () => {
    startTimeRef.current = null
    setElapsed(0)
    setIsRunning(false)
  }

  const isComplete = countDown && duration && elapsed >= duration

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <div
        className={`font-mono tabular-nums ${SIZE_CLASSES[size]} ${
          isComplete
            ? 'text-red-400 animate-pulse'
            : isRunning
              ? 'text-white'
              : 'text-zinc-400'
        }`}
      >
        {formatTimecode(timecode)}
      </div>

      <div className="mt-2 flex gap-2">
        {!isRunning ? (
          <button
            onClick={start}
            className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-500"
          >
            Start
          </button>
        ) : (
          <button
            onClick={pause}
            className="rounded bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-500"
          >
            Pause
          </button>
        )}
        <button
          onClick={reset}
          className="rounded bg-zinc-700 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-600"
        >
          Reset
        </button>
      </div>
    </div>
  )
}

// Hook for using timecode in other components
export function useTimecode(options: {
  mode: TimecodeMode
  frameRate: TimecodeFrameRate
  dropFrame?: boolean
  externalTimecode?: string
}) {
  const { mode, frameRate, dropFrame = false, externalTimecode } = options
  const [timecode, setTimecode] = useState<TimecodeValue>({
    hours: 0,
    minutes: 0,
    seconds: 0,
    frames: 0,
    totalFrames: 0,
    dropFrame: false,
    frameRate: 25,
  })

  const generatorRef = useRef(createFreeRunGenerator({ frameRate, dropFrame }))
  const lastTotalFramesRef = useRef<number>(-1)
  const animationFrameRef = useRef<number>()

  const opts: TimecodeOptions = useMemo(() => ({ frameRate, dropFrame }), [frameRate, dropFrame])

  useEffect(() => {
    generatorRef.current = createFreeRunGenerator({ frameRate, dropFrame })
  }, [frameRate, dropFrame])

  useEffect(() => {
    let isActive = true

    const update = () => {
      if (!isActive) return

      let newTimecode: TimecodeValue

      switch (mode) {
        case 'TOD':
          newTimecode = getTimeOfDayTimecode(opts)
          break
        case 'FREE_RUN':
          newTimecode = generatorRef.current.getCurrentTimecode()
          break
        case 'EXTERNAL':
          if (externalTimecode) {
            const match = externalTimecode.match(/(\d{2}):(\d{2}):(\d{2})[;:](\d{2})/)
            if (match) {
              const [, h, m, s, f] = match.map(Number)
              newTimecode = framesToTimecode(
                (h * 3600 + m * 60 + s) * Math.ceil(frameRate) + f,
                opts
              )
            } else {
              newTimecode = framesToTimecode(0, opts)
            }
          } else {
            newTimecode = framesToTimecode(0, opts)
          }
          break
        default:
          newTimecode = framesToTimecode(0, opts)
      }

      // Only update if changed
      if (newTimecode.totalFrames !== lastTotalFramesRef.current) {
        lastTotalFramesRef.current = newTimecode.totalFrames
        setTimecode(newTimecode)
      }

      animationFrameRef.current = requestAnimationFrame(update)
    }

    animationFrameRef.current = requestAnimationFrame(update)

    return () => {
      isActive = false
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [mode, frameRate, dropFrame, externalTimecode, opts])

  return {
    timecode,
    formatted: formatTimecode(timecode),
    reset: () => generatorRef.current.reset(),
    pause: () => generatorRef.current.pause(),
    resume: () => generatorRef.current.resume(),
    isPaused: () => generatorRef.current.isPaused(),
  }
}

export default TimecodeDisplay
