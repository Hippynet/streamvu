import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useStreamStore } from '../stores/streamStore'
import { api } from '../services/api'
import { useStreamMonitor } from '../hooks/useStreamMonitor'
import MCRHeader from '../components/mcr/MCRHeader'
import MCRStreamTile from '../components/mcr/MCRStreamTile'
import RecordingsPanel from '../components/mcr/RecordingsPanel'
import { ActiveRoomsWidget } from '../components/mcr/ActiveRoomsWidget'
import { HippynetPromo } from '../components/promotions/HippynetPromo'
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

interface MCRDashboardProps {
  onToggleSidebar: () => void
  sidebarVisible: boolean
}

type GridColumns = 'auto' | 1 | 2 | 3 | 4 | 5 | 6

const GRID_COLUMNS_KEY = 'streamvu-grid-columns'
const STREAM_ORDER_KEY = 'streamvu-stream-order'

export default function MCRDashboard({ onToggleSidebar, sidebarVisible }: MCRDashboardProps) {
  const { streams, setStreams, setLoading, setError } = useStreamStore()
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
  const hasAutoStarted = useRef(false)

  // Recording state
  const [recordings, setRecordings] = useState<
    Map<string, { url: string; timestamp: Date; duration: number; streamName?: string }>
  >(new Map())
  const [recordingStreams, setRecordingStreams] = useState<Set<string>>(new Set())
  const [recordingsPanelExpanded, setRecordingsPanelExpanded] = useState(true)
  const [activeRoomsExpanded, setActiveRoomsExpanded] = useState(true)
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

  // Get ordered streams - combining online and offline with custom order
  const orderedStreams = useMemo(() => {
    const allStreams = [...streams]

    // If we have a saved order, use it
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
  const onlineStreams = useMemo(
    () => orderedStreams.filter((s) => s.latestHealth?.isOnline),
    [orderedStreams]
  )
  const offlineStreams = useMemo(
    () => orderedStreams.filter((s) => !s.latestHealth?.isOnline),
    [orderedStreams]
  )

  // Fetch streams
  useEffect(() => {
    const fetchStreams = async () => {
      setLoading(true)
      try {
        const data = await api.streams.list()
        setStreams(data)

        // Update order if we have new streams
        setStreamOrder((prev) => {
          const existingIds = new Set(prev)
          const newIds = data.filter((s) => !existingIds.has(s.id)).map((s) => s.id)
          if (newIds.length > 0) {
            const updated = [...prev, ...newIds]
            localStorage.setItem(STREAM_ORDER_KEY, JSON.stringify(updated))
            return updated
          }
          return prev
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load streams')
      }
    }

    fetchStreams()
    const interval = setInterval(fetchStreams, 30000)
    return () => clearInterval(interval)
  }, [setStreams, setLoading, setError])

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

  // Auto-start monitoring when online streams become available
  useEffect(() => {
    if (!hasAutoStarted.current && onlineStreams.length > 0 && !isMonitoring) {
      hasAutoStarted.current = true
      const timer = setTimeout(() => {
        handleStartMonitoring()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [onlineStreams.length, isMonitoring, handleStartMonitoring])

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event

      if (over && active.id !== over.id) {
        setStreamOrder((prev) => {
          // Create full order from current streams if empty
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

  // Recording functions - create a separate audio stream for recording
  const startRecording = useCallback(
    async (streamId: string) => {
      // Find the stream URL
      const stream = streams.find((s) => s.id === streamId)
      if (!stream) {
        console.error('Stream not found', streamId)
        return
      }

      try {
        // Create a new audio element just for recording
        const recordAudio = new Audio()
        recordAudio.crossOrigin = 'anonymous'
        recordAudio.src = stream.url

        // Create audio context and connect to MediaStreamDestination
        const audioContext = new AudioContext()
        const source = audioContext.createMediaElementSource(recordAudio)
        const dest = audioContext.createMediaStreamDestination()
        source.connect(dest)

        // Start playing (muted - we just need the stream)
        await recordAudio.play()

        const mediaRecorder = new MediaRecorder(dest.stream, {
          mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm',
        })

        const chunks: Blob[] = []
        const startTime = Date.now()

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data)
          }
        }

        mediaRecorder.onstop = () => {
          // Clean up
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
        mediaRecorder.start(1000) // Collect data every second

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
        recorderData.recorder.stop() // This will trigger onstop which cleans up
      } else {
        // Clean up manually if not recording
        recorderData.audio?.pause()
        if (recorderData.audio) recorderData.audio.src = ''
        recorderData.audioContext?.close()
      }
      mediaRecordersRef.current.delete(streamId)
    }
  }, [])

  const deleteRecording = useCallback((key: string) => {
    setRecordings((prev) => {
      const updated = new Map(prev)
      const recording = updated.get(key)
      if (recording) {
        URL.revokeObjectURL(recording.url) // Clean up blob URL
      }
      updated.delete(key)
      return updated
    })
  }, [])

  const clearAllRecordings = useCallback(() => {
    recordings.forEach((rec) => URL.revokeObjectURL(rec.url))
    setRecordings(new Map())
  }, [recordings])

  // Calculate grid columns based on setting or auto
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

  // Combine streams for rendering in order
  const allOrderedStreams = useMemo(() => {
    return [...onlineStreams, ...offlineStreams]
  }, [onlineStreams, offlineStreams])

  return (
    <div className="flex min-h-screen flex-col bg-gray-950">
      <MCRHeader
        onlineCount={onlineStreams.length}
        offlineCount={offlineStreams.length}
        silenceCount={silenceStreams.size}
        isMonitoring={isMonitoring}
        onStartMonitoring={handleStartMonitoring}
        onStopMonitoring={stopMonitoring}
        onToggleSidebar={onToggleSidebar}
        sidebarVisible={sidebarVisible}
        gridColumns={gridColumns}
        onGridColumnsChange={handleGridColumnsChange}
        recordingsCount={recordings.size}
      />

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4">
        {streams.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-8">
            <div className="text-center">
              <div className="mb-4 text-6xl text-gray-800">📡</div>
              <h2 className="mb-2 text-xl font-bold text-gray-400">No Streams Configured</h2>
              <p className="mb-4 text-gray-600">Add streams to begin monitoring</p>
              <a
                href="/streams"
                className="inline-block rounded bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-500"
              >
                Configure Streams
              </a>
            </div>
            <HippynetPromo variant="banner" className="max-w-xl" />
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={allOrderedStreams.map((s) => s.id)}
              strategy={rectSortingStrategy}
            >
              <div className={`grid ${gridClass} auto-rows-fr gap-4`}>
                {allOrderedStreams.map((stream) => {
                  const isOnline = stream.latestHealth?.isOnline ?? false
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
        )}
      </main>

      {/* Active Rooms Widget */}
      <ActiveRoomsWidget
        isExpanded={activeRoomsExpanded}
        onToggleExpanded={() => setActiveRoomsExpanded(!activeRoomsExpanded)}
      />

      {/* Recordings panel */}
      <RecordingsPanel
        recordings={recordings}
        onClearAll={clearAllRecordings}
        onDeleteRecording={deleteRecording}
        isExpanded={recordingsPanelExpanded}
        onToggleExpanded={() => setRecordingsPanelExpanded(!recordingsPanelExpanded)}
      />

      {/* Footer status bar */}
      <footer className="border-t border-gray-800 bg-black px-4 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>StreamVU Monitor v1.0</span>
            <span>•</span>
            <span>{streams.length} streams configured</span>
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
              <>
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                  Monitoring Active
                </span>
                <span>•</span>
              </>
            )}
            <span>Auto-refresh: 30s</span>
            <span>•</span>
            <span className="text-gray-600">Drag tiles to reorder</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
