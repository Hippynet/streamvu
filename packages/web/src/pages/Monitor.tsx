import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useStreamStore } from '../stores/streamStore'
import { useStreamMonitor } from '../hooks/useStreamMonitor'
import MCRStreamTile from '../components/mcr/MCRStreamTile'
import RecordingsPanel from '../components/mcr/RecordingsPanel'
import type { StreamVUConfig } from '@streamvu/shared'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable'

type GridColumns = 'auto' | 1 | 2 | 3 | 4 | 5 | 6

const GRID_COLUMNS_KEY = 'streamvu-grid-columns'
const STREAM_ORDER_KEY = 'streamvu-stream-order'
const HIPPYNET_PROMO_KEY = 'streamvu-hippynet-promo'

function generateId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export default function Monitor() {
  const { streams, setStreams } = useStreamStore()
  const { isMonitoring, startMonitoring, stopMonitoring, getLevels, toggleMute, isMuted } =
    useStreamMonitor()
  const [silenceStreams, setSilenceStreams] = useState<Set<string>>(new Set())
  const [streamOrder, setStreamOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem(STREAM_ORDER_KEY)
    return saved ? JSON.parse(saved) : []
  })
  const [gridColumns, setGridColumns] = useState<GridColumns>(() => {
    const saved = localStorage.getItem(GRID_COLUMNS_KEY)
    if (saved === 'auto') return 'auto'
    const num = parseInt(saved || '', 10)
    if (num >= 1 && num <= 6) return num as GridColumns
    return 'auto'
  })

  // Recording state
  const [recordings, setRecordings] = useState<
    Map<string, { url: string; timestamp: Date; duration: number; streamName?: string }>
  >(new Map())
  const [recordingStreams, setRecordingStreams] = useState<Set<string>>(new Set())
  const [recordingsPanelExpanded, setRecordingsPanelExpanded] = useState(true)
  const mediaRecordersRef = useRef<
    Map<
      string,
      {
        recorder: MediaRecorder
        chunks: Blob[]
        startTime: number
        audio?: HTMLAudioElement
        audioContext?: AudioContext
      }
    >
  >(new Map())

  // Import state
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Hippynet promo banner state
  const [promoExpanded, setPromoExpanded] = useState(() => {
    const saved = localStorage.getItem(HIPPYNET_PROMO_KEY)
    return saved !== 'collapsed'
  })
  const togglePromo = useCallback(() => {
    setPromoExpanded((prev) => {
      const newValue = !prev
      localStorage.setItem(HIPPYNET_PROMO_KEY, newValue ? 'expanded' : 'collapsed')
      return newValue
    })
  }, [])

  // Clock
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  // Import config handler
  const handleImportConfig = useCallback((file: File) => {
    setImportError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const config = JSON.parse(content) as StreamVUConfig

        if (config.version !== 1) {
          setImportError('Unsupported config version')
          return
        }
        if (!Array.isArray(config.streams)) {
          setImportError('Invalid config: streams must be an array')
          return
        }
        for (const stream of config.streams) {
          if (!stream.name || !stream.url) {
            setImportError('Invalid config: each stream must have a name and URL')
            return
          }
        }

        const now = new Date().toISOString()
        const importedStreams = config.streams.map((s) => ({
          id: s.id || generateId(),
          name: s.name,
          url: s.url,
          mountPoint: s.mountPoint ?? null,
          displayOrder: s.displayOrder ?? 0,
          isVisible: s.isVisible ?? true,
          createdAt: now,
          updatedAt: now,
          latestHealth: null,
        }))

        setStreams(importedStreams)
      } catch {
        setImportError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }, [setStreams])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        handleImportConfig(file)
      } else {
        setImportError('Please drop a JSON file')
      }
    }
  }, [handleImportConfig])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleImportConfig(file)
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [handleImportConfig])

  // Export config handler
  const handleExportConfig = useCallback(() => {
    const config: StreamVUConfig = {
      version: 1,
      exportedAt: new Date().toISOString(),
      streams: streams.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        mountPoint: s.mountPoint,
        displayOrder: s.displayOrder,
        isVisible: s.isVisible,
      })),
    }
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `streamvu-config-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [streams])

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleGridColumnsChange = (cols: GridColumns) => {
    setGridColumns(cols)
    localStorage.setItem(GRID_COLUMNS_KEY, String(cols))
  }

  // Get ordered streams
  const orderedStreams = useMemo(() => {
    const allStreams = [...streams]
    if (streamOrder.length > 0) {
      const orderedMap = new Map(streamOrder.map((id, index) => [id, index]))
      allStreams.sort((a, b) => {
        const orderA = orderedMap.get(a.id) ?? Infinity
        const orderB = orderedMap.get(b.id) ?? Infinity
        return orderA - orderB
      })
    }
    return allStreams
  }, [streams, streamOrder])

  // Filter streams
  // Streams are "monitorable" if they have no health data (unknown) or are confirmed online
  // Only mark as offline if health check explicitly says so
  const onlineStreams = useMemo(
    () => orderedStreams.filter((s) => s.latestHealth === null || s.latestHealth?.isOnline),
    [orderedStreams]
  )
  const offlineStreams = useMemo(
    () => orderedStreams.filter((s) => s.latestHealth !== null && !s.latestHealth?.isOnline),
    [orderedStreams]
  )

  // Update order when streams change
  useEffect(() => {
    setStreamOrder((prev) => {
      const existingIds = new Set(prev)
      const newIds = streams.filter((s) => !existingIds.has(s.id)).map((s) => s.id)
      if (newIds.length > 0) {
        const updated = [...prev, ...newIds]
        localStorage.setItem(STREAM_ORDER_KEY, JSON.stringify(updated))
        return updated
      }
      return prev
    })
  }, [streams])

  // Track silence detection
  useEffect(() => {
    if (!isMonitoring) {
      setSilenceStreams(new Set())
      return
    }
    const checkSilence = () => {
      const silent = new Set<string>()
      onlineStreams.forEach((stream) => {
        const levels = getLevels(stream.id)
        if (levels.left < 0.01 && levels.right < 0.01) {
          silent.add(stream.id)
        }
      })
      setSilenceStreams(silent)
    }
    const interval = setInterval(checkSilence, 1000)
    return () => clearInterval(interval)
  }, [isMonitoring, onlineStreams, getLevels])

  const handleStartMonitoring = useCallback(() => {
    const streamConfigs = onlineStreams.map((s) => ({ id: s.id, url: s.url }))
    startMonitoring(streamConfigs)
  }, [onlineStreams, startMonitoring])

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (over && active.id !== over.id) {
        setStreamOrder((prev) => {
          const currentOrder = prev.length > 0 ? prev : orderedStreams.map((s) => s.id)
          const oldIndex = currentOrder.indexOf(active.id as string)
          const newIndex = currentOrder.indexOf(over.id as string)
          if (oldIndex !== -1 && newIndex !== -1) {
            const newOrder = arrayMove(currentOrder, oldIndex, newIndex)
            localStorage.setItem(STREAM_ORDER_KEY, JSON.stringify(newOrder))
            return newOrder
          }
          return prev
        })
      }
    },
    [orderedStreams]
  )

  // Recording functions
  const startRecording = useCallback(
    async (streamId: string) => {
      const stream = streams.find((s) => s.id === streamId)
      if (!stream) return

      try {
        const recordAudio = new Audio()
        recordAudio.crossOrigin = 'anonymous'
        recordAudio.src = stream.url

        const audioContext = new AudioContext()
        const source = audioContext.createMediaElementSource(recordAudio)
        const dest = audioContext.createMediaStreamDestination()
        source.connect(dest)

        await recordAudio.play()

        const mediaRecorder = new MediaRecorder(dest.stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm',
        })

        const chunks: Blob[] = []
        const startTime = Date.now()

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }

        mediaRecorder.onstop = () => {
          recordAudio.pause()
          recordAudio.src = ''
          audioContext.close()

          const blob = new Blob(chunks, { type: 'audio/webm' })
          const url = URL.createObjectURL(blob)
          const duration = Math.floor((Date.now() - startTime) / 1000)

          setRecordings((prev) => {
            const updated = new Map(prev)
            updated.set(`${stream.id}-${Date.now()}`, {
              url,
              timestamp: new Date(),
              duration,
              streamName: stream.name,
            })
            return updated
          })

          setRecordingStreams((prev) => {
            const updated = new Set(prev)
            updated.delete(streamId)
            return updated
          })
        }

        mediaRecordersRef.current.set(streamId, {
          recorder: mediaRecorder,
          chunks,
          startTime,
          audio: recordAudio,
          audioContext,
        })
        mediaRecorder.start(1000)
        setRecordingStreams((prev) => new Set(prev).add(streamId))
      } catch (err) {
        console.error('Failed to start recording:', err)
      }
    },
    [streams]
  )

  const stopRecording = useCallback((streamId: string) => {
    const recorderData = mediaRecordersRef.current.get(streamId)
    if (recorderData) {
      if (recorderData.recorder.state === 'recording') {
        recorderData.recorder.stop()
      } else {
        recorderData.audio?.pause()
        if (recorderData.audio) recorderData.audio.src = ''
        recorderData.audioContext?.close()
      }
      mediaRecordersRef.current.delete(streamId)
    }
  }, [])

  // Clear config handler (must be after stopRecording is defined)
  const handleClearConfig = useCallback(() => {
    // Stop monitoring first
    if (isMonitoring) {
      stopMonitoring()
    }
    // Stop any recordings
    recordingStreams.forEach((streamId) => {
      stopRecording(streamId)
    })
    // Clear streams
    setStreams([])
    // Clear saved order
    localStorage.removeItem(STREAM_ORDER_KEY)
    setStreamOrder([])
    setShowClearConfirm(false)
  }, [isMonitoring, stopMonitoring, recordingStreams, stopRecording, setStreams])

  const deleteRecording = useCallback((key: string) => {
    setRecordings((prev) => {
      const updated = new Map(prev)
      const recording = updated.get(key)
      if (recording) URL.revokeObjectURL(recording.url)
      updated.delete(key)
      return updated
    })
  }, [])

  const clearAllRecordings = useCallback(() => {
    recordings.forEach((rec) => URL.revokeObjectURL(rec.url))
    setRecordings(new Map())
  }, [recordings])

  // Calculate grid columns
  const gridClass = useMemo(() => {
    if (gridColumns !== 'auto') {
      const columnClasses: Record<number, string> = {
        1: 'grid-cols-1',
        2: 'grid-cols-2',
        3: 'grid-cols-3',
        4: 'grid-cols-4',
        5: 'grid-cols-5',
        6: 'grid-cols-6',
      }
      return columnClasses[gridColumns] || 'grid-cols-4'
    }
    const count = streams.length
    if (count <= 2) return 'grid-cols-1 sm:grid-cols-2'
    if (count <= 4) return 'grid-cols-2 lg:grid-cols-4'
    if (count <= 6) return 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
    if (count <= 8) return 'grid-cols-2 lg:grid-cols-4 xl:grid-cols-4'
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'
  }, [streams.length, gridColumns])

  const allOrderedStreams = useMemo(() => {
    return [...onlineStreams, ...offlineStreams]
  }, [onlineStreams, offlineStreams])

  const formatTime = (date: Date) =>
    date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  // Empty state with drag-and-drop
  if (streams.length === 0) {
    return (
      <div
        className={`flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center bg-gray-950 p-6 transition-colors ${
          isDraggingOver ? 'bg-primary-950/30' : ''
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div
          className={`max-w-md rounded-2xl border-2 border-dashed p-12 text-center transition-all ${
            isDraggingOver
              ? 'border-primary-500 bg-primary-950/20 scale-105'
              : 'border-gray-700 bg-gray-900/50'
          }`}
        >
          <div className={`mx-auto mb-6 h-20 w-20 rounded-full p-5 transition-colors ${
            isDraggingOver ? 'bg-primary-900/50' : 'bg-gray-800'
          }`}>
            <svg className={`h-full w-full transition-colors ${isDraggingOver ? 'text-primary-400' : 'text-gray-500'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>

          <h2 className="mb-2 text-xl font-bold text-white">
            {isDraggingOver ? 'Drop to Import' : 'No Streams Configured'}
          </h2>
          <p className="mb-6 text-gray-400">
            {isDraggingOver
              ? 'Release to import your stream configuration'
              : 'Drag & drop a config file or click to import'}
          </p>

          {importError && (
            <div className="mb-6 rounded-lg border border-red-700 bg-red-900/50 p-3 text-sm text-red-300">
              {importError}
            </div>
          )}

          <div className="flex flex-col items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileInput}
              className="hidden"
              id="config-import-monitor"
            />
            <label
              htmlFor="config-import-monitor"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 font-medium text-white transition-colors hover:bg-primary-500"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              Import Config
            </label>

            <Link
              to="/streams"
              className="text-sm text-gray-400 transition-colors hover:text-white"
            >
              or configure streams manually
            </Link>
          </div>

          <p className="mt-8 text-xs text-gray-600">
            Supports StreamVU JSON configuration files
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-gray-950">
      {/* Control bar */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-black px-4 py-2">
        <div className="flex items-center gap-6">
          {/* Status indicators */}
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-500" />
            <span className="text-sm text-gray-300">
              <span className="font-bold text-white">{onlineStreams.length}</span> Online
            </span>
          </div>
          {offlineStreams.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm text-red-400">
                <span className="font-bold">{offlineStreams.length}</span> Offline
              </span>
            </div>
          )}
          {silenceStreams.size > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 animate-pulse rounded-full bg-yellow-500" />
              <span className="text-sm text-yellow-400">
                <span className="font-bold">{silenceStreams.size}</span> Silence
              </span>
            </div>
          )}

          {/* Config actions */}
          <div className="ml-4 flex items-center gap-2 border-l border-gray-700 pl-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleFileInput}
              className="hidden"
              id="config-import-bar"
            />
            <label
              htmlFor="config-import-bar"
              className="cursor-pointer rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              title="Import config"
            >
              Import
            </label>
            <button
              onClick={handleExportConfig}
              className="rounded px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              title="Export config"
            >
              Export
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="rounded px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-900/50 hover:text-red-300"
              title="Clear all streams"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Grid layout selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Grid</span>
            <div className="flex items-center rounded border border-gray-700 bg-gray-900">
              {(['auto', 1, 2, 3, 4, 5, 6] as GridColumns[]).map((cols) => (
                <button
                  key={cols}
                  onClick={() => handleGridColumnsChange(cols)}
                  className={`px-2 py-1 font-mono text-xs transition-colors ${
                    gridColumns === cols
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {cols === 'auto' ? 'A' : cols}
                </button>
              ))}
            </div>
          </div>

          {/* Monitor control */}
          {isMonitoring ? (
            <button
              onClick={stopMonitoring}
              className="flex items-center gap-2 rounded border border-red-700 bg-red-900/50 px-4 py-2 text-red-400 transition-colors hover:bg-red-900"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm font-medium">STOP</span>
            </button>
          ) : (
            <button
              onClick={handleStartMonitoring}
              disabled={onlineStreams.length === 0}
              className="flex items-center gap-2 rounded border border-green-700 bg-green-900/50 px-4 py-2 text-green-400 transition-colors hover:bg-green-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span className="text-sm font-medium">MONITOR</span>
            </button>
          )}

          {/* Clock */}
          <div className="font-mono text-xl font-bold tracking-wider text-white">
            {formatTime(time)}
          </div>
        </div>
      </div>

      {/* Stream tiles */}
      <main className="flex-1 overflow-auto p-4">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={allOrderedStreams.map((s) => s.id)} strategy={rectSortingStrategy}>
            <div className={`grid ${gridClass} auto-rows-fr gap-4`}>
              {allOrderedStreams.map((stream) => {
                // Treat streams without health data as potentially online (unknown status)
                const isOnline = stream.latestHealth === null || stream.latestHealth?.isOnline === true
                const levels = getLevels(stream.id)
                return (
                  <MCRStreamTile
                    key={stream.id}
                    id={stream.id}
                    name={stream.name}
                    isOnline={isOnline}
                    isMonitoring={isMonitoring && isOnline}
                    leftLevel={levels.left}
                    rightLevel={levels.right}
                    isMuted={isMuted(stream.id)}
                    onToggleMute={() => toggleMute(stream.id)}
                    health={stream.latestHealth}
                    isRecording={recordingStreams.has(stream.id)}
                    onStartRecording={() => startRecording(stream.id)}
                    onStopRecording={() => stopRecording(stream.id)}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      </main>

      {/* Recordings panel */}
      <RecordingsPanel
        recordings={recordings}
        onClearAll={clearAllRecordings}
        onDeleteRecording={deleteRecording}
        isExpanded={recordingsPanelExpanded}
        onToggleExpanded={() => setRecordingsPanelExpanded(!recordingsPanelExpanded)}
      />

      {/* Hippynet promo banner */}
      <div className="border-t border-blue-900/30 bg-gradient-to-r from-[#0B1C8C]/20 via-[#1E6BFF]/10 to-[#0B1C8C]/20">
        <button
          onClick={togglePromo}
          className="flex w-full items-center justify-between px-4 py-2 text-left transition-colors hover:bg-blue-900/20"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[#1E6BFF]">Powered by</span>
            <span className="font-bold text-white">Hippynet</span>
            <span className="hidden text-xs text-gray-500 sm:inline">• Broadcast infrastructure that just works</span>
          </div>
          <svg
            className={`h-4 w-4 text-gray-500 transition-transform ${promoExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {promoExpanded && (
          <div className="border-t border-blue-900/20 px-4 py-4">
            <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-3">
              {/* Stream Hosting */}
              <a
                href="https://hippynet.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-lg border border-blue-900/30 bg-gray-900/50 p-3 transition-all hover:border-[#1E6BFF]/50 hover:bg-gray-900"
              >
                <div className="mb-1 flex items-center gap-2">
                  <svg className="h-4 w-4 text-[#1E6BFF]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3m-19.5 0a4.5 4.5 0 01.9-2.7L5.737 5.1a3.375 3.375 0 012.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 01.9 2.7m0 0a3 3 0 01-3 3m0 3h.008v.008h-.008V18m0-12h.008v.008h-.008V6m0 3h.008v.008h-.008V9z" />
                  </svg>
                  <span className="text-sm font-semibold text-white">Stream Hosting</span>
                </div>
                <p className="text-xs text-gray-400 group-hover:text-gray-300">
                  Reliable Icecast & Shoutcast hosting with 99.9% uptime guarantee
                </p>
              </a>

              {/* Audio Toolbox */}
              <a
                href="https://hippynet.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-lg border border-blue-900/30 bg-gray-900/50 p-3 transition-all hover:border-[#1E6BFF]/50 hover:bg-gray-900"
              >
                <div className="mb-1 flex items-center gap-2">
                  <svg className="h-4 w-4 text-[#FFD319]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                  </svg>
                  <span className="text-sm font-semibold text-white">Audio Toolbox</span>
                </div>
                <p className="text-xs text-gray-400 group-hover:text-gray-300">
                  Professional audio processing, compression & silence detection
                </p>
              </a>

              {/* Listen Again */}
              <a
                href="https://hippynet.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-lg border border-blue-900/30 bg-gray-900/50 p-3 transition-all hover:border-[#1E6BFF]/50 hover:bg-gray-900"
              >
                <div className="mb-1 flex items-center gap-2">
                  <svg className="h-4 w-4 text-[#1E6BFF]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
                  </svg>
                  <span className="text-sm font-semibold text-white">Listen Again</span>
                </div>
                <p className="text-xs text-gray-400 group-hover:text-gray-300">
                  Automatic catch-up podcasts & on-demand show archives
                </p>
              </a>
            </div>

            <div className="mt-3 flex items-center justify-center gap-4 text-xs text-gray-500">
              <span>99.9% Uptime</span>
              <span className="text-gray-700">•</span>
              <span>15+ Years Experience</span>
              <span className="text-gray-700">•</span>
              <span>200+ Stations</span>
              <span className="text-gray-700">•</span>
              <a
                href="https://hippynet.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#1E6BFF] transition-colors hover:text-[#4D8AFF]"
              >
                hippynet.co.uk
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-800 bg-black px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>StreamVU Monitor</span>
            <span>•</span>
            <span>{streams.length} streams</span>
            {recordingStreams.size > 0 && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1 text-red-400">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
                  {recordingStreams.size} recording
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            {isMonitoring && (
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Monitoring Active
              </span>
            )}
            <span className="text-gray-600">Drag tiles to reorder</span>
          </div>
        </div>
      </footer>

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="mx-4 max-w-sm rounded-lg border border-gray-700 bg-gray-900 p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-bold text-white">Clear All Streams?</h3>
            <p className="mb-6 text-sm text-gray-400">
              This will remove all {streams.length} streams from your configuration. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="rounded px-4 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleClearConfig}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
