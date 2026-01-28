import { useState } from 'react'
import type { StreamWithHealth } from '@streamvu/shared'
import VUMeter from './VUMeter'
import { useVUMeter } from '../../hooks/useVUMeter'

interface StreamCardProps {
  stream: StreamWithHealth
}

export default function StreamCard({ stream }: StreamCardProps) {
  const [isListening, setIsListening] = useState(false)
  const { levels, isPlaying, play, stop, error } = useVUMeter(stream.url)

  const isOnline = stream.latestHealth?.isOnline ?? false

  const handleTogglePlay = () => {
    if (isPlaying) {
      stop()
      setIsListening(false)
    } else {
      play()
      setIsListening(true)
    }
  }

  return (
    <div className="card flex flex-col p-4">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-white">{stream.name}</h3>
          <p className="truncate text-sm text-gray-400">{stream.mountPoint || stream.url}</p>
        </div>
        <div className="ml-2 flex items-center gap-2">
          <span className={isOnline ? 'status-online' : 'status-offline'}></span>
          <span className={`text-xs ${isOnline ? 'text-green-400' : 'text-red-400'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>

      {/* VU Meters */}
      <div className="flex flex-1 items-center justify-center gap-4 py-4">
        <div className="text-center">
          <VUMeter level={isListening ? levels.left : 0} label="L" />
        </div>
        <div className="text-center">
          <VUMeter level={isListening ? levels.right : 0} label="R" />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 border-t border-gray-700 py-3 text-sm">
        <div>
          <span className="text-gray-500">Bitrate</span>
          <p className="text-white">
            {stream.latestHealth?.bitrate ? `${stream.latestHealth.bitrate} kbps` : '-'}
          </p>
        </div>
        <div>
          <span className="text-gray-500">Listeners</span>
          <p className="text-white">{stream.latestHealth?.listeners ?? '-'}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="border-t border-gray-700 pt-3">
        {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
        <button
          onClick={handleTogglePlay}
          disabled={!isOnline}
          className={`btn w-full ${isListening ? 'btn-danger' : 'btn-primary'} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {isListening ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
              </svg>
              Stop
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              Listen
            </span>
          )}
        </button>
      </div>
    </div>
  )
}
