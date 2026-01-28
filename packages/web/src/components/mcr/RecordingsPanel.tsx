import { useState, useRef, useEffect } from 'react'

interface Recording {
  url: string
  timestamp: Date
  duration: number
  streamName?: string
}

interface RecordingsPanelProps {
  recordings: Map<string, Recording>
  onClearAll: () => void
  onDeleteRecording: (key: string) => void
  isExpanded: boolean
  onToggleExpanded: () => void
}

// Waveform for the main player
function PlayerWaveform({
  audioUrl,
  progress,
  isPlaying,
  onSeek,
}: {
  audioUrl: string
  progress: number
  isPlaying: boolean
  onSeek: (progress: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [waveformData, setWaveformData] = useState<number[]>([])
  const [isHovering, setIsHovering] = useState(false)
  const [hoverPosition, setHoverPosition] = useState(0)

  useEffect(() => {
    const generateWaveform = async () => {
      try {
        const response = await fetch(audioUrl)
        const arrayBuffer = await response.arrayBuffer()
        const audioContext = new AudioContext()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        const channelData = audioBuffer.getChannelData(0)
        const samples = 150
        const blockSize = Math.floor(channelData.length / samples)
        const peaks: number[] = []

        for (let i = 0; i < samples; i++) {
          let sum = 0
          for (let j = 0; j < blockSize; j++) {
            sum += Math.abs(channelData[i * blockSize + j] || 0)
          }
          peaks.push(sum / blockSize)
        }

        const max = Math.max(...peaks)
        setWaveformData(peaks.map((p) => p / max))
        audioContext.close()
      } catch {
        setWaveformData(
          Array(150)
            .fill(0)
            .map(() => Math.random() * 0.5 + 0.25)
        )
      }
    }
    generateWaveform()
  }, [audioUrl])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || waveformData.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height
    const barWidth = width / waveformData.length
    const progressX = (progress / 100) * width
    const hoverX = (hoverPosition / 100) * width

    ctx.clearRect(0, 0, width, height)

    // Draw bars
    waveformData.forEach((value, index) => {
      const x = index * barWidth
      const barHeight = value * height * 0.85
      const y = (height - barHeight) / 2

      if (x < progressX) {
        ctx.fillStyle = '#22c55e'
      } else if (isHovering && x < hoverX) {
        ctx.fillStyle = '#4b5563'
      } else {
        ctx.fillStyle = '#1f2937'
      }
      ctx.fillRect(x, y, barWidth - 1, barHeight)
    })

    // Draw hover line
    if (isHovering) {
      ctx.fillStyle = '#6b7280'
      ctx.fillRect(hoverX - 0.5, 0, 1, height)
    }
  }, [waveformData, progress, isPlaying, isHovering, hoverPosition])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    onSeek((x / rect.width) * 100)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    setHoverPosition((x / rect.width) * 100)
  }

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full cursor-pointer"
      onClick={handleClick}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseMove={handleMouseMove}
    />
  )
}

export default function RecordingsPanel({
  recordings,
  onClearAll,
  onDeleteRecording,
  isExpanded,
  onToggleExpanded,
}: RecordingsPanelProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const selectedRecording = selectedKey ? recordings.get(selectedKey) : null

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // Select first recording if none selected
  useEffect(() => {
    if (!selectedKey && recordings.size > 0) {
      const firstKey = Array.from(recordings.keys()).pop()
      if (firstKey) setSelectedKey(firstKey)
    }
  }, [recordings, selectedKey])

  // Update progress
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const updateProgress = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100)
        setCurrentTime(audio.currentTime)
        setDuration(audio.duration)
      }
    }

    const handleEnded = () => setIsPlaying(false)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', updateProgress)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('loadedmetadata', updateProgress)

    return () => {
      audio.removeEventListener('timeupdate', updateProgress)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('loadedmetadata', updateProgress)
    }
  }, [selectedKey])

  const handlePlayPause = () => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
  }

  const handleSeek = (newProgress: number) => {
    const audio = audioRef.current
    if (audio && audio.duration) {
      audio.currentTime = (newProgress / 100) * audio.duration
    }
  }

  const handleSkip = (seconds: number) => {
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + seconds))
    }
  }

  const handleSelectRecording = (key: string) => {
    if (key === selectedKey) {
      handlePlayPause()
    } else {
      setSelectedKey(key)
      setProgress(0)
      setCurrentTime(0)
      // Auto-play when selecting new recording
      setTimeout(() => audioRef.current?.play(), 100)
    }
  }

  const handleExport = (key: string) => {
    const recording = recordings.get(key)
    if (!recording) return
    const streamName = recording.streamName?.replace(/[^a-zA-Z0-9]/g, '_') || 'recording'
    const timestamp = formatTimestamp(recording.timestamp).replace(/:/g, '')
    const a = document.createElement('a')
    a.href = recording.url
    a.download = `${streamName}_${timestamp}.webm`
    a.click()
  }

  const recordingsArray = Array.from(recordings.entries()).reverse()

  if (recordings.size === 0) return null

  return (
    <div className="flex flex-col border-t border-gray-800 bg-black">
      {/* Recordings list (collapsible) */}
      <div
        className="flex cursor-pointer items-center justify-between border-b border-gray-900 px-4 py-1.5 hover:bg-gray-900/50"
        onClick={onToggleExpanded}
      >
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">
            Recordings
          </span>
          <span className="font-mono text-xs text-gray-600">{recordings.size}</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClearAll()
            }}
            className="text-[10px] uppercase tracking-wider text-gray-600 hover:text-red-500"
          >
            Clear
          </button>
          <svg
            className={`h-4 w-4 text-gray-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </div>
      </div>

      {isExpanded && (
        <div className="max-h-32 overflow-y-auto border-b border-gray-900">
          {recordingsArray.map(([key, rec]) => {
            const isSelected = key === selectedKey
            const isCurrentPlaying = isSelected && isPlaying

            return (
              <div
                key={key}
                onClick={() => handleSelectRecording(key)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors ${
                  isSelected ? 'bg-gray-900' : 'hover:bg-gray-900/50'
                }`}
              >
                {/* Play indicator / status */}
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded ${
                    isCurrentPlaying
                      ? 'bg-green-600'
                      : isSelected
                        ? 'bg-gray-700'
                        : 'bg-transparent'
                  }`}
                >
                  {isCurrentPlaying ? (
                    <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : isSelected ? (
                    <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-700" />
                  )}
                </div>

                {/* Source name */}
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-xs font-medium ${isSelected ? 'text-white' : 'text-gray-400'}`}
                  >
                    {rec.streamName || 'Unknown'}
                  </div>
                </div>

                {/* Timestamp */}
                <span className="font-mono text-[10px] text-gray-600">
                  {formatTimestamp(rec.timestamp)}
                </span>

                {/* Duration */}
                <span
                  className={`w-10 text-right font-mono text-[10px] ${isSelected ? 'text-gray-400' : 'text-gray-600'}`}
                >
                  {formatTime(rec.duration)}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleExport(key)
                    }}
                    className="p-1 text-gray-600 transition-colors hover:text-primary-400"
                    title="Download"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isSelected) {
                        audioRef.current?.pause()
                        setSelectedKey(null)
                      }
                      onDeleteRecording(key)
                    }}
                    className="p-1 text-gray-600 transition-colors hover:text-red-500"
                    title="Delete"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Persistent player bar */}
      {selectedRecording && (
        <div className="bg-gray-950 px-4 py-2">
          {/* Hidden audio element */}
          <audio ref={audioRef} src={selectedRecording.url} preload="metadata" />

          <div className="flex items-center gap-4">
            {/* Track info */}
            <div className="w-40 flex-shrink-0">
              <div className="truncate text-xs font-medium text-white">
                {selectedRecording.streamName || 'Unknown'}
              </div>
              <div className="text-[10px] text-gray-500">
                {formatTimestamp(selectedRecording.timestamp)}
              </div>
            </div>

            {/* Playback controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleSkip(-10)}
                className="p-1.5 text-gray-500 transition-colors hover:text-white"
                title="Back 10s"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                </svg>
              </button>

              <button
                onClick={handlePlayPause}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
                  isPlaying ? 'bg-green-600 hover:bg-green-500' : 'bg-gray-700 hover:bg-gray-600'
                }`}
              >
                {isPlaying ? (
                  <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg
                    className="ml-0.5 h-4 w-4 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              <button
                onClick={() => handleSkip(10)}
                className="p-1.5 text-gray-500 transition-colors hover:text-white"
                title="Forward 10s"
              >
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                </svg>
              </button>
            </div>

            {/* Current time */}
            <span className="w-10 text-right font-mono text-[10px] text-gray-500">
              {formatTime(currentTime)}
            </span>

            {/* Waveform / scrubber */}
            <div className="h-8 flex-1 overflow-hidden rounded bg-gray-900">
              <PlayerWaveform
                audioUrl={selectedRecording.url}
                progress={progress}
                isPlaying={isPlaying}
                onSeek={handleSeek}
              />
            </div>

            {/* Duration */}
            <span className="w-10 font-mono text-[10px] text-gray-500">
              {formatTime(duration || selectedRecording.duration)}
            </span>

            {/* Export button */}
            <button
              onClick={() => selectedKey && handleExport(selectedKey)}
              className="p-1.5 text-gray-500 transition-colors hover:text-primary-400"
              title="Download"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
