import { useState, useCallback, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../../stores/authStore'
import { getWsUrl } from '../../config'
import { RecordingType, RecordingStatus } from '@streamvu/shared'
import type { Recording } from '@streamvu/shared'

interface RecordingPanelProps {
  roomId: string
  isHost: boolean
  participants: Array<{ participantId: string; displayName: string }>
}

function formatDuration(ms: number | null): string {
  if (!ms) return '00:00:00'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function formatFileSize(bytes: string | null): string {
  if (!bytes) return '-'
  const size = parseInt(bytes)
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const STATUS_STYLES: Record<RecordingStatus, { border: string; text: string; bg: string }> = {
  [RecordingStatus.RECORDING]: { border: 'border-red-500', text: 'text-red-400', bg: 'bg-red-950/30' },
  [RecordingStatus.PROCESSING]: { border: 'border-yellow-500', text: 'text-yellow-400', bg: 'bg-yellow-950/30' },
  [RecordingStatus.COMPLETED]: { border: 'border-green-500', text: 'text-green-400', bg: 'bg-green-950/30' },
  [RecordingStatus.FAILED]: { border: 'border-gray-600', text: 'text-gray-500', bg: 'bg-gray-900' },
}

function RecordingCard({
  recording,
  isHost,
  onStop,
  onDelete,
}: {
  recording: Recording
  isHost: boolean
  onStop: () => void
  onDelete: () => void
}) {
  const [elapsed, setElapsed] = useState(0)
  const isActive = recording.status === RecordingStatus.RECORDING

  useEffect(() => {
    if (!isActive) {
      setElapsed(recording.durationMs || 0)
      return
    }

    const startTime = new Date(recording.startedAt).getTime()
    setElapsed(Date.now() - startTime)

    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime)
    }, 1000)

    return () => clearInterval(interval)
  }, [isActive, recording.startedAt, recording.durationMs])

  const status = recording.status as RecordingStatus
  const styles = STATUS_STYLES[status] || STATUS_STYLES[RecordingStatus.FAILED]

  return (
    <div className={`border-l-2 ${styles.border} ${styles.bg} p-2`}>
      {/* Header */}
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isActive && <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}
          <span className={`text-[10px] font-mono ${styles.text}`}>
            {recording.type === RecordingType.MIX ? 'MIX' : recording.participantName || 'TRACK'}
          </span>
        </div>
        <span className="text-[8px] font-mono uppercase text-gray-600">{status}</span>
      </div>

      {/* Duration */}
      <div className="font-mono text-lg font-bold text-white">
        {formatDuration(elapsed)}
      </div>

      {/* Details */}
      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] font-mono text-gray-500">
        <span>{recording.format.toUpperCase()}</span>
        <span>{recording.sampleRate / 1000}kHz</span>
        <span>{recording.bitDepth || 24}bit</span>
        <span>{recording.channels === 1 ? 'MONO' : 'STEREO'}</span>
        {recording.fileSize && <span>{formatFileSize(recording.fileSize)}</span>}
      </div>

      {/* Actions */}
      {isHost && (
        <div className="mt-1.5 flex gap-1">
          {isActive ? (
            <button
              onClick={onStop}
              className="flex-1 bg-red-900/50 py-1 text-[9px] font-mono text-red-400 hover:bg-red-900/70"
            >
              STOP
            </button>
          ) : recording.status === RecordingStatus.COMPLETED ? (
            <>
              <button className="flex-1 bg-primary-900/50 py-1 text-[9px] font-mono text-primary-400 hover:bg-primary-900/70">
                DOWNLOAD
              </button>
              <button
                onClick={onDelete}
                className="bg-gray-800 px-2 py-1 text-[9px] font-mono text-gray-500 hover:bg-gray-700"
              >
                DEL
              </button>
            </>
          ) : (
            <button
              onClick={onDelete}
              className="flex-1 bg-gray-800 py-1 text-[9px] font-mono text-gray-500 hover:bg-gray-700"
            >
              DELETE
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function StartRecordingForm({
  participants,
  onStart,
  onCancel,
}: {
  participants: Array<{ participantId: string; displayName: string }>
  onStart: (type: RecordingType, participantId?: string, format?: string, sampleRate?: number) => void
  onCancel: () => void
}) {
  const [type, setType] = useState<RecordingType>(RecordingType.MIX)
  const [participantId, setParticipantId] = useState('')
  const [format, setFormat] = useState('wav')
  const [sampleRate, setSampleRate] = useState('48000')

  const handleStart = () => {
    onStart(
      type,
      type === RecordingType.INDIVIDUAL ? participantId || undefined : undefined,
      format,
      parseInt(sampleRate)
    )
  }

  return (
    <div className="space-y-2 bg-gray-900 p-2">
      <div>
        <label className="mb-0.5 block text-[9px] font-mono uppercase tracking-wider text-gray-600">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as RecordingType)}
          className="w-full bg-gray-800 px-2 py-1 text-[10px] text-white focus:outline-none"
        >
          <option value={RecordingType.MIX}>FULL MIX</option>
          <option value={RecordingType.INDIVIDUAL}>INDIVIDUAL</option>
        </select>
      </div>

      {type === RecordingType.INDIVIDUAL && (
        <div>
          <label className="mb-0.5 block text-[9px] font-mono uppercase tracking-wider text-gray-600">Participant</label>
          <select
            value={participantId}
            onChange={(e) => setParticipantId(e.target.value)}
            className="w-full bg-gray-800 px-2 py-1 text-[10px] text-white focus:outline-none"
          >
            <option value="">Select...</option>
            {participants.map((p) => (
              <option key={p.participantId} value={p.participantId}>
                {p.displayName}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        <div>
          <label className="mb-0.5 block text-[9px] font-mono uppercase tracking-wider text-gray-600">Format</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full bg-gray-800 px-2 py-1 text-[10px] text-white focus:outline-none"
          >
            <option value="wav">WAV</option>
            <option value="flac">FLAC</option>
            <option value="mp3">MP3</option>
          </select>
        </div>
        <div>
          <label className="mb-0.5 block text-[9px] font-mono uppercase tracking-wider text-gray-600">Sample Rate</label>
          <select
            value={sampleRate}
            onChange={(e) => setSampleRate(e.target.value)}
            className="w-full bg-gray-800 px-2 py-1 text-[10px] text-white focus:outline-none"
          >
            <option value="44100">44.1kHz</option>
            <option value="48000">48kHz</option>
            <option value="96000">96kHz</option>
          </select>
        </div>
      </div>

      <div className="flex gap-1 pt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-1 text-[9px] font-mono text-gray-500 hover:text-gray-400"
        >
          CANCEL
        </button>
        <button
          onClick={handleStart}
          disabled={type === RecordingType.INDIVIDUAL && !participantId}
          className="flex-1 bg-red-900/50 py-1 text-[9px] font-mono text-red-400 hover:bg-red-900/70 disabled:cursor-not-allowed disabled:opacity-50"
        >
          REC
        </button>
      </div>
    </div>
  )
}

export function RecordingPanel({
  roomId,
  isHost,
  participants,
}: RecordingPanelProps) {
  const tokens = useAuthStore((state) => state.tokens)
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [showStartForm, setShowStartForm] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!tokens?.accessToken || !roomId) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('recording:list', { roomId }, (response: { recordings?: Recording[]; error?: string }) => {
        if (response.recordings) {
          setRecordings(response.recordings)
        }
        setIsLoading(false)
      })
    })

    socket.on('recording:started', (data: { recording: Recording }) => {
      setRecordings((prev) => [data.recording, ...prev])
    })

    socket.on('recording:stopped', (data: { recording: Recording }) => {
      setRecordings((prev) =>
        prev.map((r) => (r.id === data.recording.id ? data.recording : r))
      )
    })

    socket.on('recording:progress', (data: { recordingId: string; durationMs: number; fileSize: string }) => {
      setRecordings((prev) =>
        prev.map((r) =>
          r.id === data.recordingId
            ? { ...r, durationMs: data.durationMs, fileSize: data.fileSize }
            : r
        )
      )
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [tokens?.accessToken, roomId])

  const handleStartRecording = useCallback(
    (type: RecordingType, participantId?: string, format?: string, sampleRate?: number) => {
      socketRef.current?.emit(
        'recording:start',
        {
          roomId,
          type,
          participantId,
          format,
          sampleRate,
          bitDepth: 24,
          channels: 2,
        },
        (response: { recording?: Recording; error?: string }) => {
          if (response.recording) {
            setShowStartForm(false)
          }
        }
      )
    },
    [roomId]
  )

  const handleStopRecording = useCallback(
    (recordingId: string) => {
      socketRef.current?.emit('recording:stop', { roomId, recordingId })
    },
    [roomId]
  )

  const handleDeleteRecording = useCallback(
    async (recordingId: string) => {
      setRecordings((prev) => prev.filter((r) => r.id !== recordingId))
    },
    []
  )

  const activeRecordings = recordings.filter((r) => r.status === RecordingStatus.RECORDING)
  const completedRecordings = recordings.filter((r) => r.status !== RecordingStatus.RECORDING)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="h-4 w-4 animate-spin border-2 border-gray-600 border-t-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Recording</h3>
          {activeRecordings.length > 0 && (
            <span className="animate-pulse bg-red-600 px-1 py-0.5 text-[8px] font-mono font-bold text-white">
              {activeRecordings.length} REC
            </span>
          )}
        </div>
        <span className="text-[9px] font-mono text-gray-600">{recordings.length}</span>
      </div>

      {/* Content */}
      <div className="max-h-72 space-y-1 overflow-y-auto p-1.5">
        {/* Active Recordings */}
        {activeRecordings.map((recording) => (
          <RecordingCard
            key={recording.id}
            recording={recording}
            isHost={isHost}
            onStop={() => handleStopRecording(recording.id)}
            onDelete={() => handleDeleteRecording(recording.id)}
          />
        ))}

        {/* Start Recording Form */}
        {isHost && showStartForm && (
          <StartRecordingForm
            participants={participants}
            onStart={handleStartRecording}
            onCancel={() => setShowStartForm(false)}
          />
        )}

        {/* Completed Recordings */}
        {completedRecordings.length > 0 && (
          <>
            {activeRecordings.length > 0 && (
              <div className="border-t border-gray-800 pt-1.5">
                <span className="text-[9px] font-mono uppercase text-gray-600">Previous</span>
              </div>
            )}
            {completedRecordings.map((recording) => (
              <RecordingCard
                key={recording.id}
                recording={recording}
                isHost={isHost}
                onStop={() => handleStopRecording(recording.id)}
                onDelete={() => handleDeleteRecording(recording.id)}
              />
            ))}
          </>
        )}

        {recordings.length === 0 && !showStartForm && (
          <p className="py-6 text-center text-[10px] font-mono text-gray-600">NO RECORDINGS</p>
        )}
      </div>

      {/* Start Recording Button (Host Only) */}
      {isHost && !showStartForm && activeRecordings.length === 0 && (
        <div className="border-t border-gray-800 p-1.5">
          <button
            onClick={() => setShowStartForm(true)}
            className="flex w-full items-center justify-center gap-1.5 bg-red-900/50 py-1.5 text-[10px] font-mono text-red-400 hover:bg-red-900/70"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            START RECORDING
          </button>
        </div>
      )}
    </div>
  )
}
