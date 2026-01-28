import type { StreamWithHealth } from '@streamvu/shared'
import VUMeterPro from './VUMeterPro'

interface StreamMonitorCardProps {
  stream: StreamWithHealth
  levels: { left: number; right: number; peak: number }
  isMuted: boolean
  isMonitoring: boolean
  onToggleMute: () => void
}

export default function StreamMonitorCard({
  stream,
  levels,
  isMuted,
  isMonitoring,
  onToggleMute,
}: StreamMonitorCardProps) {
  const isOnline = stream.latestHealth?.isOnline ?? false

  return (
    <div className="card flex h-full flex-col p-4">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-white">{stream.name}</h3>
          <p className="truncate text-xs text-gray-500">{stream.mountPoint || 'Stream'}</p>
        </div>
        <div className="ml-2 flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isOnline ? 'animate-pulse bg-green-500' : 'bg-red-500'
            }`}
          />
        </div>
      </div>

      {/* VU Meters */}
      <div className="flex flex-1 items-center justify-center py-2">
        {isMonitoring ? (
          <VUMeterPro
            leftLevel={levels.left}
            rightLevel={levels.right}
            peak={levels.peak}
            height={160}
          />
        ) : (
          <div className="text-center text-sm text-gray-500">
            <svg
              className="mx-auto mb-2 h-12 w-12 text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
              />
            </svg>
            Start monitoring
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="flex items-center justify-between border-t border-gray-700 px-1 py-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="text-gray-400">
            {stream.latestHealth?.bitrate ? `${stream.latestHealth.bitrate}k` : '-'}
          </span>
          <span className="text-gray-500">|</span>
          <span className="text-gray-400">{stream.latestHealth?.listeners ?? 0} listeners</span>
        </div>
        {levels.peak > 0.9 && (
          <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
            PEAK
          </span>
        )}
      </div>

      {/* Audio control */}
      {isMonitoring && (
        <button
          onClick={onToggleMute}
          className={`mt-2 w-full rounded-lg py-2 text-sm font-medium transition-colors ${
            isMuted
              ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              : 'bg-primary-600 text-white hover:bg-primary-500'
          }`}
        >
          {isMuted ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z"
                />
              </svg>
              Muted
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
                />
              </svg>
              Listening
            </span>
          )}
        </button>
      )}
    </div>
  )
}
