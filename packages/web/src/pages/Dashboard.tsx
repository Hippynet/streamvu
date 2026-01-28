import { useEffect, useMemo } from 'react'
import { useStreamStore } from '../stores/streamStore'
import { api } from '../services/api'
import { useStreamMonitor } from '../hooks/useStreamMonitor'
import StreamMonitorCard from '../components/streams/StreamMonitorCard'

export default function Dashboard() {
  const { streams, loading, error, setStreams, setLoading, setError } = useStreamStore()
  const { isMonitoring, startMonitoring, stopMonitoring, getLevels, toggleMute, isMuted } =
    useStreamMonitor()

  // Filter to only online streams for monitoring
  const onlineStreams = useMemo(() => streams.filter((s) => s.latestHealth?.isOnline), [streams])

  useEffect(() => {
    const fetchStreams = async () => {
      setLoading(true)
      try {
        const data = await api.streams.list()
        setStreams(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load streams')
      }
    }

    fetchStreams()

    // Refresh streams every 30 seconds
    const interval = setInterval(fetchStreams, 30000)
    return () => clearInterval(interval)
  }, [setStreams, setLoading, setError])

  const handleStartMonitoring = () => {
    const streamConfigs = onlineStreams.map((s) => ({ id: s.id, url: s.url }))
    startMonitoring(streamConfigs)
  }

  if (loading && streams.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center p-6">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary-500"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="m-6 rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-300">{error}</div>
    )
  }

  const offlineCount = streams.filter((s) => !s.latestHealth?.isOnline).length

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Stream Monitor</h1>
          <p className="mt-1 text-gray-400">
            {onlineStreams.length} online
            {offlineCount > 0 && (
              <span className="ml-2 text-red-400">({offlineCount} offline)</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isMonitoring ? (
            <button onClick={stopMonitoring} className="btn btn-danger">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-400" />
                Stop Monitoring
              </span>
            </button>
          ) : (
            <button
              onClick={handleStartMonitoring}
              disabled={onlineStreams.length === 0}
              className="btn btn-primary disabled:opacity-50"
            >
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Start Monitoring ({onlineStreams.length})
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Monitoring status bar */}
      {isMonitoring && (
        <div className="flex items-center gap-3 rounded-lg border border-green-700/50 bg-green-900/20 px-4 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-sm text-green-400">
            Monitoring active - All streams playing (muted). Click a stream to listen.
          </span>
        </div>
      )}

      {/* Stream grid */}
      {streams.length === 0 ? (
        <div className="card p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-white">No streams configured</h3>
          <p className="mt-2 text-gray-400">Add your first Icecast stream to start monitoring.</p>
          <a href="/streams" className="btn btn-primary mt-4 inline-block">
            Add Stream
          </a>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {streams.map((stream) => (
            <StreamMonitorCard
              key={stream.id}
              stream={stream}
              levels={getLevels(stream.id)}
              isMuted={isMuted(stream.id)}
              isMonitoring={isMonitoring && (stream.latestHealth?.isOnline ?? false)}
              onToggleMute={() => toggleMute(stream.id)}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      {streams.length > 0 && (
        <div className="flex items-center justify-center gap-6 pt-4 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-green-500" />
            <span>Normal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-yellow-500" />
            <span>High</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-red-500" />
            <span>Clipping</span>
          </div>
        </div>
      )}
    </div>
  )
}
