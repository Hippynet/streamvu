import { useState, useEffect, useRef, useCallback } from 'react'

type AudioChannel = 'program' | 'talkback'

interface MixerChannelProps {
  participantId: string
  displayName: string
  stream?: MediaStream
  isLocal?: boolean
  initialVolume?: number
  initialPan?: number
  initialMuted?: boolean
  initialSolo?: boolean
  soloActive?: boolean // Whether any channel is solo'd
  channel?: AudioChannel // Current channel assignment
  onVolumeChange?: (volume: number) => void
  onPanChange?: (pan: number) => void
  onMuteChange?: (muted: boolean) => void
  onSoloChange?: (solo: boolean) => void
  onChannelChange?: (channel: AudioChannel) => void
  // Layout configuration
  channelWidth?: number
  meterHeight?: number
  showPan?: boolean
}

export function MixerChannel({
  participantId: _participantId,
  displayName,
  stream,
  isLocal,
  initialVolume = 1.0,
  initialPan = 0,
  initialMuted = false,
  initialSolo = false,
  soloActive = false,
  channel = 'program',
  onVolumeChange,
  onPanChange,
  onMuteChange,
  onSoloChange,
  onChannelChange,
  // Layout configuration with defaults
  channelWidth = 64,
  meterHeight = 120,
  showPan = true,
}: MixerChannelProps) {
  const [volume, setVolume] = useState(initialVolume)
  const [pan, setPan] = useState(initialPan)
  const [muted, setMuted] = useState(initialMuted)
  const [solo, setSolo] = useState(initialSolo)
  const [vuLevel, setVuLevel] = useState(0)

  // Refs for initial values (to avoid useEffect dependency issues)
  const displayNameRef = useRef(displayName)
  displayNameRef.current = displayName
  const volumeRef = useRef(volume)
  volumeRef.current = volume
  const panRef = useRef(pan)
  panRef.current = pan
  const mutedRef = useRef(muted)
  mutedRef.current = muted

  // Web Audio nodes
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const panNodeRef = useRef<StereoPannerNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // Set up Web Audio graph
  useEffect(() => {
    if (!stream || isLocal) return

    // Check stream state
    const tracks = stream.getAudioTracks()

    if (tracks.length === 0 || tracks[0].readyState !== 'live') {
      console.warn(`[MixerChannel] ${displayNameRef.current} - No live audio track available`)
      return
    }

    // Create audio context
    const audioContext = new AudioContext()
    audioContextRef.current = audioContext

    // Resume AudioContext if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
        console.error(`[MixerChannel] ${displayNameRef.current} - Failed to resume AudioContext:`, err)
      })
    }

    // Create nodes
    const source = audioContext.createMediaStreamSource(stream)
    const gainNode = audioContext.createGain()
    const panNode = audioContext.createStereoPanner()
    const analyser = audioContext.createAnalyser()

    // Configure analyser for VU meter
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8

    // Connect graph: source → gain → pan → analyser → destination
    source.connect(gainNode)
    gainNode.connect(panNode)
    panNode.connect(analyser)
    analyser.connect(audioContext.destination)

    // Store refs
    sourceRef.current = source
    gainNodeRef.current = gainNode
    panNodeRef.current = panNode
    analyserRef.current = analyser

    // Set initial values from refs
    gainNode.gain.value = mutedRef.current ? 0 : volumeRef.current
    panNode.pan.value = panRef.current

    // Start VU meter animation
    const updateVu = () => {
      if (!analyser) return

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(dataArray)

      // Calculate RMS level
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length)
      const normalizedLevel = Math.min(rms / 128, 1) // Normalize to 0-1

      setVuLevel(normalizedLevel)
      animationFrameRef.current = requestAnimationFrame(updateVu)
    }
    updateVu()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      source.disconnect()
      gainNode.disconnect()
      panNode.disconnect()
      analyser.disconnect()
      audioContext.close()
    }
  }, [stream, isLocal])

  // Update gain when volume or mute changes
  useEffect(() => {
    if (!gainNodeRef.current) return

    // If solo is active elsewhere and we're not solo'd, mute
    const shouldMute = muted || (soloActive && !solo)
    gainNodeRef.current.gain.value = shouldMute ? 0 : volume
  }, [volume, muted, solo, soloActive])

  // Update pan
  useEffect(() => {
    if (!panNodeRef.current) return
    panNodeRef.current.pan.value = pan
  }, [pan])

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume)
    onVolumeChange?.(newVolume)
  }, [onVolumeChange])

  const handlePanChange = useCallback((newPan: number) => {
    setPan(newPan)
    onPanChange?.(newPan)
  }, [onPanChange])

  const handleMuteToggle = useCallback(() => {
    const newMuted = !muted
    setMuted(newMuted)
    onMuteChange?.(newMuted)
  }, [muted, onMuteChange])

  const handleSoloToggle = useCallback(() => {
    const newSolo = !solo
    setSolo(newSolo)
    onSoloChange?.(newSolo)
  }, [solo, onSoloChange])

  const handleChannelToggle = useCallback(() => {
    const newChannel: AudioChannel = channel === 'program' ? 'talkback' : 'program'
    onChannelChange?.(newChannel)
  }, [channel, onChannelChange])

  // Calculate VU meter segments based on meter height
  const vuSegments = Math.max(4, Math.floor(meterHeight / 16))
  const activeSegments = Math.floor(vuLevel * vuSegments)

  return (
    <div
      className="flex flex-col items-center rounded-lg border border-gray-700 bg-gray-800 p-3"
      style={{ width: channelWidth }}
    >
      {/* Participant name */}
      <div className="mb-2 w-full truncate text-center text-sm font-medium text-white" title={displayName}>
        {displayName}
        {isLocal && <span className="ml-1 text-xs text-primary-400">(You)</span>}
      </div>

      {/* VU Meter */}
      <div
        className="mb-3 flex w-6 flex-col-reverse gap-0.5 rounded bg-gray-900 p-1"
        style={{ height: meterHeight }}
      >
        {Array.from({ length: vuSegments }).map((_, i) => {
          const isActive = i < activeSegments
          let bgColor = 'bg-gray-700'
          if (isActive) {
            if (i >= vuSegments - 2) {
              bgColor = 'bg-red-500' // Peak (red)
            } else if (i >= vuSegments - 4) {
              bgColor = 'bg-yellow-500' // High (yellow)
            } else {
              bgColor = 'bg-green-500' // Normal (green)
            }
          }
          return (
            <div
              key={i}
              className={`h-3 w-full rounded-sm transition-colors ${bgColor}`}
            />
          )
        })}
      </div>

      {/* Volume Fader */}
      <div className="mb-3 flex flex-col items-center">
        <input
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={volume}
          onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
          className="h-24 w-2 cursor-pointer appearance-none rounded-full bg-gray-600"
          style={{
            writingMode: 'vertical-lr',
            direction: 'rtl',
            background: `linear-gradient(to top, #3b82f6 ${(volume / 2) * 100}%, #4b5563 ${(volume / 2) * 100}%)`,
          }}
          title={`Volume: ${Math.round(volume * 100)}%`}
        />
        <span className="mt-1 text-xs text-gray-400">{Math.round(volume * 100)}%</span>
      </div>

      {/* Pan Knob */}
      {showPan && (
        <div className="mb-3 flex flex-col items-center">
          <div className="relative h-10 w-10">
            <svg viewBox="0 0 40 40" className="h-full w-full">
              {/* Background arc */}
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="#374151"
                strokeWidth="4"
                strokeDasharray="75 100"
                strokeLinecap="round"
                transform="rotate(135 20 20)"
              />
              {/* Active arc */}
              <circle
                cx="20"
                cy="20"
                r="16"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="4"
                strokeDasharray={`${((pan + 1) / 2) * 75} 100`}
                strokeLinecap="round"
                transform="rotate(135 20 20)"
              />
              {/* Center dot */}
              <circle cx="20" cy="20" r="6" fill="#1f2937" />
              {/* Indicator */}
              <line
                x1="20"
                y1="14"
                x2="20"
                y2="8"
                stroke="#f3f4f6"
                strokeWidth="2"
                strokeLinecap="round"
                transform={`rotate(${pan * 135} 20 20)`}
              />
            </svg>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.01"
              value={pan}
              onChange={(e) => handlePanChange(parseFloat(e.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              title={`Pan: ${pan === 0 ? 'C' : pan < 0 ? `${Math.round(Math.abs(pan) * 100)}L` : `${Math.round(pan * 100)}R`}`}
            />
          </div>
          <span className="mt-1 text-xs text-gray-400">
            {pan === 0 ? 'C' : pan < 0 ? `${Math.round(Math.abs(pan) * 100)}L` : `${Math.round(pan * 100)}R`}
          </span>
        </div>
      )}

      {/* Mute / Solo Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleMuteToggle}
          className={`rounded px-2 py-1 text-xs font-bold transition-colors ${
            muted
              ? 'bg-red-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          title={muted ? 'Unmute' : 'Mute'}
        >
          M
        </button>
        <button
          onClick={handleSoloToggle}
          className={`rounded px-2 py-1 text-xs font-bold transition-colors ${
            solo
              ? 'bg-yellow-500 text-black'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
          title={solo ? 'Unsolo' : 'Solo'}
        >
          S
        </button>
      </div>

      {/* Channel Routing (Program / Talkback) */}
      {onChannelChange && (
        <button
          onClick={handleChannelToggle}
          className={`mt-2 w-full rounded px-2 py-1 text-xs font-medium transition-colors ${
            channel === 'talkback'
              ? 'bg-yellow-600 text-white'
              : 'bg-primary-600 text-white'
          }`}
          title={`Route to ${channel === 'program' ? 'Talkback' : 'Program'}`}
        >
          {channel === 'program' ? 'PGM' : 'TB'}
        </button>
      )}
    </div>
  )
}
