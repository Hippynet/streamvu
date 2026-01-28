import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import type { AudioSource, AudioSourceType, PlaybackState, SRTConnectionState } from '@streamvu/shared'
import { TestSignalGenerator } from './TestSignalGenerator'

interface AudioSourcePlaybackState {
  audioLevel: number
  isPlaying: boolean
  error: string | null
}

interface SourcesPanelProps {
  roomId: string
  isHost: boolean
  onAddSource?: () => void
  refreshKey?: number
  // Optional: use external source management
  sources?: AudioSource[]
  playbackState?: Map<string, AudioSourcePlaybackState>
  onStartSource?: (sourceId: string) => void
  onStopSource?: (sourceId: string) => void
  onDeleteSource?: (sourceId: string) => void
  /** Hide the header (when parent provides its own) */
  hideHeader?: boolean
}

export function SourcesPanel({
  roomId,
  isHost,
  onAddSource,
  refreshKey,
  sources: externalSources,
  playbackState,
  onStartSource,
  onStopSource,
  onDeleteSource,
  hideHeader = false,
}: SourcesPanelProps) {
  const [internalSources, setInternalSources] = useState<AudioSource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showTestSignals, setShowTestSignals] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Use external sources if provided, otherwise manage internally
  const sources = externalSources || internalSources
  const isExternallyManaged = !!externalSources

  useEffect(() => {
    if (!isExternallyManaged) {
      loadSources()
    } else {
      setLoading(false)
    }
  }, [roomId, refreshKey, isExternallyManaged])

  const loadSources = async () => {
    try {
      const data = await api.audioSources.list(roomId)
      setInternalSources(data)
    } catch (err) {
      console.error('Failed to load sources:', err)
      setError('Failed to load sources')
    } finally {
      setLoading(false)
    }
  }

  const handleStart = async (sourceId: string) => {
    if (onStartSource) {
      // Use external handler (which includes audio playback)
      onStartSource(sourceId)
    } else {
      // Fallback to just updating backend state
      try {
        const updated = await api.audioSources.start(roomId, sourceId)
        setInternalSources(prev => prev.map(s => s.id === sourceId ? updated : s))
      } catch (err) {
        console.error('Failed to start source:', err)
      }
    }
  }

  const handleStop = async (sourceId: string) => {
    if (onStopSource) {
      // Use external handler
      onStopSource(sourceId)
    } else {
      try {
        const updated = await api.audioSources.stop(roomId, sourceId)
        setInternalSources(prev => prev.map(s => s.id === sourceId ? updated : s))
      } catch (err) {
        console.error('Failed to stop source:', err)
      }
    }
  }

  const handleDelete = async (sourceId: string) => {
    if (!confirm('Delete this source?')) return
    if (onDeleteSource) {
      onDeleteSource(sourceId)
    } else {
      try {
        await api.audioSources.delete(roomId, sourceId)
        setInternalSources(prev => prev.filter(s => s.id !== sourceId))
      } catch (err) {
        console.error('Failed to delete source:', err)
      }
    }
  }

  const getSourceIcon = (type: AudioSourceType) => {
    switch (type) {
      case 'HTTP_STREAM':
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
          </svg>
        )
      case 'FILE':
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
          </svg>
        )
      case 'PARTICIPANT':
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        )
      case 'TONE':
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
          </svg>
        )
      case 'SRT_STREAM':
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
          </svg>
        )
      default:
        return (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        )
    }
  }

  const getStateColor = (state: PlaybackState, isActive: boolean) => {
    if (!isActive) return 'text-gray-500'
    switch (state) {
      case 'PLAYING':
        return 'text-green-400'
      case 'PAUSED':
        return 'text-yellow-400'
      case 'LOADING':
        return 'text-blue-400'
      case 'ERROR':
        return 'text-red-400'
      default:
        return 'text-gray-400'
    }
  }

  const getSrtConnectionStateStyle = (state: SRTConnectionState | null) => {
    switch (state) {
      case 'CONNECTED':
        return { color: 'text-green-400', bg: 'bg-green-950/50', label: 'CONNECTED' }
      case 'LISTENING':
        return { color: 'text-purple-400', bg: 'bg-purple-950/50', label: 'LISTENING' }
      case 'CONNECTING':
        return { color: 'text-blue-400', bg: 'bg-blue-950/50', label: 'CONNECTING' }
      case 'ERROR':
        return { color: 'text-red-400', bg: 'bg-red-950/50', label: 'ERROR' }
      default:
        return { color: 'text-gray-500', bg: 'bg-gray-900', label: 'DISCONNECTED' }
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-2">
        <div className="h-4 w-4 animate-spin border-2 border-gray-600 border-t-gray-400"></div>
      </div>
    )
  }

  // Count active sources for collapsed view
  const activeCount = sources.filter(s => s.isActive).length

  // When hideHeader is true, parent handles collapse - always show content
  const showContent = hideHeader || !isCollapsed

  return (
    <div className={`flex flex-col ${isCollapsed && !hideHeader ? '' : 'h-full'}`}>
      {/* Collapsible Header - only when not hidden */}
      {!hideHeader && (
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-between border-b border-gray-800 px-2 py-1.5 text-left hover:bg-gray-900/50 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <svg
              className={`h-3 w-3 text-gray-600 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
            <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">Sources</h3>
          </div>
          <div className="flex items-center gap-1">
            {sources.length > 0 && (
              <span className="bg-gray-800 px-1 py-0.5 text-[9px] font-mono text-gray-500">
                {sources.length}
              </span>
            )}
            {activeCount > 0 && (
              <span className="bg-green-950/50 px-1 py-0.5 text-[9px] font-mono text-green-500">
                {activeCount} LIVE
              </span>
            )}
          </div>
        </button>
      )}

      {/* Content */}
      {showContent && (
        <>
          <div className="flex-1 overflow-y-auto p-1.5">
            {error && (
              <div className="mb-1 bg-red-950/50 px-2 py-1 text-[10px] font-mono text-red-400">{error}</div>
            )}

            {sources.length === 0 ? (
              <div className="py-6 text-center text-[10px] font-mono text-gray-600">
                NO SOURCES
              </div>
            ) : (
              <div className="space-y-0.5">
                {sources.map((source) => {
                  const playbackInfo = playbackState?.get(source.id)
                  const srtStyle = source.type === 'SRT_STREAM'
                    ? getSrtConnectionStateStyle(source.srtConnectionState as SRTConnectionState | null)
                    : null
                  return (
                    <SourceItem
                      key={source.id}
                      source={source}
                      isHost={isHost}
                      icon={getSourceIcon(source.type)}
                      stateColor={getStateColor(source.playbackState, source.isActive)}
                      audioLevel={playbackInfo?.audioLevel || 0}
                      isPlaying={playbackInfo?.isPlaying || false}
                      playbackError={playbackInfo?.error || null}
                      srtConnectionStyle={srtStyle}
                      onStart={() => handleStart(source.id)}
                      onStop={() => handleStop(source.id)}
                      onDelete={() => handleDelete(source.id)}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* Test Signals Section */}
          {isHost && (
            <div className="border-t border-gray-800 p-1.5">
              <button
                onClick={() => setShowTestSignals(!showTestSignals)}
                className="flex w-full items-center justify-between bg-yellow-950/30 px-2 py-1.5 text-[10px] font-mono text-yellow-500 hover:bg-yellow-950/50"
              >
                <div className="flex items-center gap-1.5">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  TEST SIGNALS
                </div>
                <svg
                  className={`h-3 w-3 transition-transform ${showTestSignals ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {showTestSignals && (
                <div className="mt-1">
                  <TestSignalGenerator compact />
                </div>
              )}
            </div>
          )}

          {isHost && (
            <div className="border-t border-gray-800 p-1.5">
              <button
                onClick={onAddSource}
                className="flex w-full items-center justify-center gap-1.5 bg-gray-800 py-1.5 text-[10px] font-mono text-gray-400 hover:bg-gray-700 hover:text-gray-300"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                ADD SOURCE
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

interface SourceItemProps {
  source: AudioSource
  isHost: boolean
  icon: React.ReactNode
  stateColor: string
  audioLevel: number
  isPlaying: boolean
  playbackError: string | null
  srtConnectionStyle: { color: string; bg: string; label: string } | null
  onStart: () => void
  onStop: () => void
  onDelete: () => void
}

function SourceItem({ source, isHost, icon, stateColor, audioLevel, isPlaying, playbackError, srtConnectionStyle, onStart, onStop, onDelete }: SourceItemProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [copied, setCopied] = useState(false)

  // Build SRT connection URL for LISTENER mode
  const srtConnectionUrl = source.type === 'SRT_STREAM' && source.srtMode === 'LISTENER' && source.srtListenerPort
    ? `srt://${window.location.hostname}:${source.srtListenerPort}`
    : null

  const handleCopyUrl = () => {
    if (srtConnectionUrl) {
      navigator.clipboard.writeText(srtConnectionUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div
      className={`group flex items-center gap-1.5 px-1.5 py-1 hover:bg-gray-900 ${
        source.isActive ? 'bg-gray-900/50 border-l-2 border-green-500' : 'border-l-2 border-transparent'
      }`}
    >
      <span className={`${stateColor} flex-shrink-0`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] text-white">{source.name}</div>
        <div className="flex items-center gap-1 text-[9px] font-mono text-gray-600">
          <span className={`px-0.5 ${source.channel === 'PROGRAM' ? 'bg-gray-800 text-gray-400' : source.channel === 'TALKBACK' ? 'bg-yellow-950/50 text-yellow-500' : 'bg-purple-950/50 text-purple-400'}`}>
            {source.channel === 'PROGRAM' ? 'PGM' : source.channel === 'TALKBACK' ? 'TB' : 'BOTH'}
          </span>
          {/* SRT connection state */}
          {srtConnectionStyle && (
            <span className={`px-0.5 ${srtConnectionStyle.bg} ${srtConnectionStyle.color}`}>
              {srtConnectionStyle.label}
            </span>
          )}
          {/* SRT mode badge */}
          {source.type === 'SRT_STREAM' && source.srtMode && (
            <span className="px-0.5 bg-purple-950/30 text-purple-500">
              {source.srtMode}
            </span>
          )}
          {isPlaying && (
            <span className="text-green-500">LIVE</span>
          )}
          {playbackError && (
            <span className="text-red-500" title={playbackError}>ERR</span>
          )}
        </div>
        {/* SRT connection URL for listener mode */}
        {srtConnectionUrl && (
          <div className="mt-0.5 flex items-center gap-1">
            <code className="flex-1 truncate text-[9px] font-mono text-purple-400/70">{srtConnectionUrl}</code>
            <button
              onClick={handleCopyUrl}
              className="flex-shrink-0 text-[8px] font-mono text-gray-500 hover:text-purple-400"
              title="Copy URL"
            >
              {copied ? '✓' : 'COPY'}
            </button>
          </div>
        )}
        {/* Audio level bar when playing */}
        {isPlaying && (
          <div className="mt-0.5 h-0.5 w-full bg-gray-800 overflow-hidden">
            <div
              className={`h-full transition-all ${audioLevel > 0.7 ? 'bg-red-500' : audioLevel > 0.4 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {isHost && (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {source.isActive ? (
            <button
              onClick={onStop}
              className="bg-red-900/50 p-0.5 text-red-400 hover:bg-red-900/70"
              title="Stop"
            >
              <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onStart}
              className="bg-green-900/50 p-0.5 text-green-400 hover:bg-green-900/70"
              title="Start"
            >
              <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="bg-gray-800 p-0.5 text-gray-500 hover:bg-gray-700"
            >
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
              </svg>
            </button>
            {showMenu && (
              <div className="absolute right-0 top-full z-10 mt-0.5 bg-gray-950 border border-gray-800 py-0.5 shadow-lg">
                <button
                  onClick={() => {
                    setShowMenu(false)
                    onDelete()
                  }}
                  className="flex w-full items-center gap-1.5 px-2 py-1 text-[10px] text-red-400 hover:bg-gray-900"
                >
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
