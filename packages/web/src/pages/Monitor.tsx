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
type GridRows = 1 | 2 | 3

const GRID_COLUMNS_KEY = 'streamvu-grid-columns'
const GRID_ROWS_KEY = 'streamvu-grid-rows'
const STREAM_ORDER_KEY = 'streamvu-stream-order'
const HIPPYNET_PROMO_KEY = 'streamvu-hippynet-promo'

function generateId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export default function Monitor() {
  const { streams, setStreams } = useStreamStore()
  const { isMonitoring, startMonitoring, stopMonitoring, getLevels, toggleMute, isMuted, getVolume, setVolume } =
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
  const [gridRows, setGridRows] = useState<GridRows>(() => {
    const saved = localStorage.getItem(GRID_ROWS_KEY)
    const num = parseInt(saved || '', 10)
    if (num >= 1 && num <= 3) return num as GridRows
    return 2
  })

  const handleGridRowsChange = (rows: GridRows) => {
    setGridRows(rows)
    localStorage.setItem(GRID_ROWS_KEY, String(rows))
  }

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

  // Zen mode (hides chrome, shows only VU meters)
  const [zenMode, setZenMode] = useState(false)

  // Help panel state
  const [showHelp, setShowHelp] = useState(false)

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

  // Map grid rows to tile size for the component
  const tileSize = useMemo(() => {
    switch (gridRows) {
      case 1: return 'L' as const
      case 2: return 'M' as const
      case 3: return 'S' as const
      default: return 'M' as const
    }
  }, [gridRows])

  // Calculate row height style based on viewport
  // Chrome heights: header(64) + control bar(48) + warning(~60 if shown) + footer(40) + promo(~48 collapsed, ~200 expanded)
  const gridRowStyle = useMemo(() => {
    if (zenMode) {
      return {
        gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
        height: '100vh',
      }
    }
    // Base chrome: header + control bar + footer minimum
    // header: 64px, control bar: ~52px, footer: ~36px, promo collapsed: ~44px = ~196px
    // Add buffer for warning banner when not monitoring: +60px
    // When promo expanded: add ~160px more
    const baseChrome = 200 // Minimum chrome
    const warningHeight = !isMonitoring && streams.length > 0 ? 60 : 0
    const promoHeight = promoExpanded ? 180 : 44
    const totalChrome = baseChrome + warningHeight + promoHeight

    return {
      gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
      height: `calc(100vh - ${totalChrome}px)`,
    }
  }, [gridRows, zenMode, isMonitoring, streams.length, promoExpanded])

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
    <div className={`flex flex-col bg-gray-950 ${zenMode ? 'min-h-screen' : 'min-h-[calc(100vh-4rem)]'}`}>
      {/* Zen mode exit button */}
      {zenMode && (
        <button
          onClick={() => setZenMode(false)}
          className="fixed right-4 top-4 z-50 rounded-lg border border-gray-700 bg-gray-900/90 p-2 text-gray-400 shadow-lg backdrop-blur-sm transition-all hover:border-gray-600 hover:bg-gray-800 hover:text-white"
          title="Exit zen mode (Esc)"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
          </svg>
        </button>
      )}

      {/* Control bar */}
      {!zenMode && (
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
            <button
              onClick={() => setShowHelp(true)}
              className="rounded px-2 py-1 text-xs text-[#1E6BFF] transition-colors hover:bg-[#1E6BFF]/20 hover:text-[#4D8AFF]"
              title="Help & Info"
            >
              Help
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

          {/* Row selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-gray-500">Rows</span>
            <div className="flex items-center rounded border border-gray-700 bg-gray-900">
              {([1, 2, 3] as GridRows[]).map((rows) => (
                <button
                  key={rows}
                  onClick={() => handleGridRowsChange(rows)}
                  className={`px-2 py-1 font-mono text-xs transition-colors ${
                    gridRows === rows
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                  title={`${rows} row${rows > 1 ? 's' : ''} visible`}
                >
                  {rows}
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

          {/* Zen mode toggle */}
          <button
            onClick={() => setZenMode(true)}
            className="rounded p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
            title="Zen mode (hide chrome)"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        </div>
      </div>
      )}

      {/* Not monitoring warning */}
      {!isMonitoring && streams.length > 0 && !zenMode && (
        <div className="border-b border-amber-900/50 bg-amber-950/50 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-900/50">
                <svg className="h-5 w-5 text-amber-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-amber-300">Monitoring Paused</p>
                <p className="text-sm text-amber-400/80">VU meters are not active. Click MONITOR to start tracking audio levels.</p>
              </div>
            </div>
            <button
              onClick={handleStartMonitoring}
              disabled={onlineStreams.length === 0}
              className="rounded-lg bg-amber-600 px-4 py-2 font-medium text-white transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start Monitoring
            </button>
          </div>
        </div>
      )}

      {/* Stream tiles */}
      <main className="flex-1 overflow-hidden p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={allOrderedStreams.map((s) => s.id)} strategy={rectSortingStrategy}>
            <div
              className={`grid ${gridClass} gap-2 overflow-auto`}
              style={gridRowStyle}
            >
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
                    volume={getVolume(stream.id)}
                    onVolumeChange={(vol) => setVolume(stream.id, vol)}
                    tileSize={tileSize}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      </main>

      {/* Recordings panel */}
      {!zenMode && (
        <RecordingsPanel
          recordings={recordings}
          onClearAll={clearAllRecordings}
          onDeleteRecording={deleteRecording}
          isExpanded={recordingsPanelExpanded}
          onToggleExpanded={() => setRecordingsPanelExpanded(!recordingsPanelExpanded)}
        />
      )}

      {/* Hippynet promo banner */}
      {!zenMode && (
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
            className={`h-4 w-4 text-gray-500 transition-transform ${promoExpanded ? '' : 'rotate-180'}`}
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
            <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

              {/* Silence Detection */}
              <a
                href="https://hippynet.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-lg border border-blue-900/30 bg-gray-900/50 p-3 transition-all hover:border-[#1E6BFF]/50 hover:bg-gray-900"
              >
                <div className="mb-1 flex items-center gap-2">
                  <svg className="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0M3.124 7.5A8.969 8.969 0 015.292 3m13.416 0a8.969 8.969 0 012.168 4.5" />
                  </svg>
                  <span className="text-sm font-semibold text-white">Silence Detection</span>
                </div>
                <p className="text-xs text-gray-400 group-hover:text-gray-300">
                  24/7 monitoring with email & SMS alerts for dead air
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
      )}

      {/* Footer */}
      {!zenMode && (
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
      )}

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

      {/* Help modal */}
      {showHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-gray-700 bg-gray-900 px-6 py-4">
              <h2 className="text-xl font-bold text-white">StreamVU Monitor Help</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-6 p-6">
              {/* How it works */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-white">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E6BFF]/20 text-sm text-[#1E6BFF]">1</span>
                  How It Works
                </h3>
                <p className="text-sm leading-relaxed text-gray-400">
                  StreamVU Monitor runs <strong className="text-white">entirely in your browser</strong>.
                  It connects directly to your audio streams and displays real-time VU meters using the Web Audio API.
                  No data is sent to any server - your stream URLs and configuration are stored locally in your browser.
                </p>
              </div>

              {/* Getting started */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-white">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E6BFF]/20 text-sm text-[#1E6BFF]">2</span>
                  Getting Started
                </h3>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex gap-2">
                    <span className="text-emerald-400">•</span>
                    <span><strong className="text-white">Add streams</strong> via the Streams page, or import a JSON config file</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-400">•</span>
                    <span><strong className="text-white">Click MONITOR</strong> to start tracking audio levels</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-400">•</span>
                    <span><strong className="text-white">Drag tiles</strong> by the colored status bar to reorder</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-emerald-400">•</span>
                    <span><strong className="text-white">Export config</strong> to save your setup and share with colleagues</span>
                  </li>
                </ul>
              </div>

              {/* Config format */}
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-lg font-semibold text-white">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1E6BFF]/20 text-sm text-[#1E6BFF]">3</span>
                  Configuration Format
                </h3>
                <p className="mb-2 text-sm text-gray-400">
                  Export/import uses a simple JSON format:
                </p>
                <pre className="overflow-x-auto rounded-lg bg-black/50 p-3 font-mono text-xs text-gray-300">
{`{
  "version": 1,
  "streams": [
    {
      "name": "Station Name",
      "url": "https://stream.example.com/live",
      "mountPoint": "/live"
    }
  ]
}`}
                </pre>
              </div>

              {/* Limitations */}
              <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-4">
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-amber-300">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                  </svg>
                  Browser-Based Limitations
                </h3>
                <ul className="space-y-1 text-sm text-amber-400/80">
                  <li>• Monitoring stops when you close or navigate away from this tab</li>
                  <li>• Some streams may have CORS restrictions preventing monitoring</li>
                  <li>• Audio must be unmuted for VU meters to work (browser security)</li>
                </ul>
              </div>

              {/* 24/7 monitoring promo */}
              <div className="rounded-lg border border-[#1E6BFF]/30 bg-[#1E6BFF]/10 p-4">
                <h3 className="mb-2 flex items-center gap-2 font-semibold text-white">
                  <svg className="h-5 w-5 text-[#1E6BFF]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  Need 24/7 Monitoring?
                </h3>
                <p className="mb-3 text-sm text-gray-300">
                  For continuous server-side monitoring with email/SMS alerts, silence detection,
                  and automatic failover, check out <strong>Hippynet's professional monitoring services</strong>.
                </p>
                <a
                  href="https://hippynet.co.uk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-[#1E6BFF] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4D8AFF]"
                >
                  Learn More
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
