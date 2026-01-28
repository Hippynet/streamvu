import { useState, useCallback, useEffect, useMemo } from 'react'
import { TimerType } from '@streamvu/shared'
import type { RoomTimer } from '@streamvu/shared'

interface TimerPanelProps {
  roomId: string
  isHost: boolean
  timers: RoomTimer[]
  onCreateTimer: (name: string, type: TimerType, durationMs?: number) => void
  onStartTimer: (timerId: string) => void
  onPauseTimer: (timerId: string) => void
  onResetTimer: (timerId: string) => void
  onDeleteTimer: (timerId: string) => void
}

function formatTimerDisplay(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function useTimerValue(timer: RoomTimer): number {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!timer.isRunning) return

    const interval = setInterval(() => {
      setNow(Date.now())
    }, 100)

    return () => clearInterval(interval)
  }, [timer.isRunning])

  return useMemo(() => {
    if (timer.type === TimerType.COUNTDOWN) {
      if (!timer.durationMs) return 0

      if (timer.pausedAt) {
        const pausedTime = new Date(timer.pausedAt).getTime()
        const startedAt = new Date(timer.startedAt!).getTime()
        const elapsed = pausedTime - startedAt
        return Math.max(0, timer.durationMs - elapsed)
      }

      if (timer.isRunning && timer.startedAt) {
        const startedAt = new Date(timer.startedAt).getTime()
        const elapsed = now - startedAt
        return Math.max(0, timer.durationMs - elapsed)
      }

      return timer.durationMs
    } else {
      if (timer.pausedAt && timer.startedAt) {
        const startedAt = new Date(timer.startedAt).getTime()
        const pausedAt = new Date(timer.pausedAt).getTime()
        return pausedAt - startedAt
      }

      if (timer.isRunning && timer.startedAt) {
        const startedAt = new Date(timer.startedAt).getTime()
        return now - startedAt
      }

      return 0
    }
  }, [timer, now])
}

function TimerDisplay({
  timer,
  isHost,
  onStart,
  onPause,
  onReset,
  onDelete,
}: {
  timer: RoomTimer
  isHost: boolean
  onStart: () => void
  onPause: () => void
  onReset: () => void
  onDelete: () => void
}) {
  const value = useTimerValue(timer)
  const isCountdown = timer.type === TimerType.COUNTDOWN
  const isExpired = isCountdown && value === 0 && timer.isRunning

  return (
    <div
      className={`
        p-2 border-l-2
        ${isExpired ? 'border-red-500 bg-red-950/30 animate-pulse' : timer.isRunning ? 'border-green-500 bg-gray-900' : 'border-gray-700 bg-gray-900'}
      `}
    >
      {/* Header */}
      <div className="mb-1 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono text-white">{timer.name}</span>
          <span className="ml-1.5 text-[8px] font-mono uppercase text-gray-600">
            {isCountdown ? 'CD' : 'SW'}
          </span>
        </div>
        {isHost && (
          <button
            onClick={onDelete}
            className="text-[10px] text-gray-600 hover:text-red-400"
            title="Delete timer"
          >
            ×
          </button>
        )}
      </div>

      {/* Time Display */}
      <div
        className={`
          text-center font-mono text-2xl font-bold
          ${isExpired ? 'text-red-400' : timer.isRunning ? 'text-green-400' : 'text-white'}
        `}
      >
        {formatTimerDisplay(value)}
      </div>

      {/* Controls (Host Only) */}
      {isHost && (
        <div className="mt-1.5 flex justify-center gap-1">
          {timer.isRunning ? (
            <button
              onClick={onPause}
              className="bg-yellow-900/50 px-2 py-0.5 text-[9px] font-mono text-yellow-400 hover:bg-yellow-900/70"
            >
              PAUSE
            </button>
          ) : (
            <button
              onClick={onStart}
              className="bg-green-900/50 px-2 py-0.5 text-[9px] font-mono text-green-400 hover:bg-green-900/70"
            >
              {timer.pausedAt ? 'RESUME' : 'START'}
            </button>
          )}
          <button
            onClick={onReset}
            className="bg-gray-800 px-2 py-0.5 text-[9px] font-mono text-gray-400 hover:bg-gray-700"
          >
            RESET
          </button>
        </div>
      )}

      {/* Status indicator for non-hosts */}
      {!isHost && (
        <div className="mt-1 text-center text-[9px] font-mono text-gray-600">
          {timer.isRunning ? 'RUNNING' : timer.pausedAt ? 'PAUSED' : 'STOPPED'}
        </div>
      )}
    </div>
  )
}

function CreateTimerForm({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string, type: TimerType, durationMs?: number) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<TimerType>(TimerType.COUNTDOWN)
  const [minutes, setMinutes] = useState('5')
  const [seconds, setSeconds] = useState('0')

  const handleSubmit = () => {
    if (!name.trim()) return

    const durationMs = type === TimerType.COUNTDOWN
      ? (parseInt(minutes) * 60 + parseInt(seconds)) * 1000
      : undefined

    onCreate(name.trim(), type, durationMs)
  }

  return (
    <div className="space-y-1.5 bg-gray-900 p-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Timer name..."
        className="w-full bg-gray-800 px-2 py-1 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-gray-700"
        autoFocus
      />

      <div className="flex items-center gap-1">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TimerType)}
          className="bg-gray-800 px-1.5 py-1 text-[10px] font-mono text-gray-400 focus:outline-none"
        >
          <option value="COUNTDOWN">COUNTDOWN</option>
          <option value="STOPWATCH">STOPWATCH</option>
        </select>

        {type === TimerType.COUNTDOWN && (
          <>
            <input
              type="number"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              min="0"
              max="999"
              className="w-12 bg-gray-800 px-1 py-1 text-center text-[10px] font-mono text-white focus:outline-none"
            />
            <span className="text-[10px] text-gray-600">:</span>
            <input
              type="number"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
              min="0"
              max="59"
              className="w-12 bg-gray-800 px-1 py-1 text-center text-[10px] font-mono text-white focus:outline-none"
            />
          </>
        )}
      </div>

      <div className="flex justify-end gap-1">
        <button
          onClick={onCancel}
          className="px-2 py-0.5 text-[9px] font-mono text-gray-500 hover:text-gray-400"
        >
          CANCEL
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="bg-primary-900/50 px-2 py-0.5 text-[9px] font-mono text-primary-400 hover:bg-primary-900/70 disabled:opacity-50"
        >
          CREATE
        </button>
      </div>
    </div>
  )
}

export function TimerPanel({
  roomId: _roomId,
  isHost,
  timers,
  onCreateTimer,
  onStartTimer,
  onPauseTimer,
  onResetTimer,
  onDeleteTimer,
}: TimerPanelProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)

  const handleCreate = useCallback(
    (name: string, type: TimerType, durationMs?: number) => {
      onCreateTimer(name, type, durationMs)
      setShowCreateForm(false)
    },
    [onCreateTimer]
  )

  const visibleTimers = useMemo(() => {
    if (isHost) return timers
    return timers.filter((t) => t.visibleToAll)
  }, [timers, isHost])

  return (
    <div className="flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-1.5">
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Timers</h3>
        <span className="text-[9px] font-mono text-gray-600">{visibleTimers.length}</span>
      </div>

      {/* Timers List */}
      <div className="space-y-1 p-1.5">
        {visibleTimers.length === 0 && !showCreateForm && (
          <p className="py-6 text-center text-[10px] font-mono text-gray-600">NO TIMERS</p>
        )}

        {visibleTimers.map((timer) => (
          <TimerDisplay
            key={timer.id}
            timer={timer}
            isHost={isHost}
            onStart={() => onStartTimer(timer.id)}
            onPause={() => onPauseTimer(timer.id)}
            onReset={() => onResetTimer(timer.id)}
            onDelete={() => onDeleteTimer(timer.id)}
          />
        ))}

        {/* Create Form (Host Only) */}
        {isHost && showCreateForm && (
          <CreateTimerForm
            onCreate={handleCreate}
            onCancel={() => setShowCreateForm(false)}
          />
        )}
      </div>

      {/* Add Timer Button (Host Only) */}
      {isHost && !showCreateForm && (
        <div className="border-t border-gray-800 p-1.5">
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full bg-gray-900 py-1.5 text-[10px] font-mono text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-400"
          >
            + ADD TIMER
          </button>
        </div>
      )}
    </div>
  )
}

// Large timer display for talent view
export function TimerLarge({
  timer,
}: {
  timer: RoomTimer
}) {
  const value = useTimerValue(timer)
  const isCountdown = timer.type === TimerType.COUNTDOWN
  const isExpired = isCountdown && value === 0 && timer.isRunning
  const isWarning = isCountdown && value > 0 && value <= 30000

  return (
    <div
      className={`
        p-4 text-center
        ${isExpired ? 'bg-red-950/50 animate-pulse' : isWarning ? 'bg-yellow-950/50' : 'bg-gray-900'}
      `}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
        {timer.name}
      </div>
      <div
        className={`
          font-mono text-5xl font-bold
          ${isExpired ? 'text-red-400' : isWarning ? 'text-yellow-400' : timer.isRunning ? 'text-green-400' : 'text-white'}
        `}
      >
        {formatTimerDisplay(value)}
      </div>
      {isExpired && (
        <div className="mt-1 font-mono text-sm font-bold text-red-400 animate-bounce">TIME!</div>
      )}
    </div>
  )
}

// Compact inline timer
export function TimerCompact({
  timer,
}: {
  timer: RoomTimer
}) {
  const value = useTimerValue(timer)
  const isCountdown = timer.type === TimerType.COUNTDOWN
  const isExpired = isCountdown && value === 0 && timer.isRunning

  return (
    <div className="inline-flex items-center gap-1.5 bg-gray-900 px-2 py-1">
      <div
        className={`h-1.5 w-1.5 ${timer.isRunning ? (isExpired ? 'bg-red-500 animate-pulse' : 'bg-green-500') : 'bg-gray-600'}`}
      />
      <span className="text-[9px] font-mono text-gray-500">{timer.name}</span>
      <span
        className={`font-mono text-[11px] font-medium ${isExpired ? 'text-red-400' : 'text-white'}`}
      >
        {formatTimerDisplay(value)}
      </span>
    </div>
  )
}
