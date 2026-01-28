import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Test signal types available for broadcast engineering
 */
export type TestSignalType =
  | 'tone_1khz_10dbfs'   // Standard alignment tone -10dBFS
  | 'tone_1khz_18dbfs'   // EBU R68 reference level -18dBFS
  | 'tone_1khz_20dbfs'   // Common digital reference -20dBFS
  | 'tone_440hz'         // A4 tuning reference
  | 'tone_100hz'         // Low frequency test
  | 'tone_10khz'         // High frequency test
  | 'pink_noise'         // Equal energy per octave
  | 'white_noise'        // Equal energy per frequency
  | 'ebu_lineup'         // EBU line-up sequence (1kHz bursts)
  | 'countdown_10s'      // 10 second countdown with beeps
  | 'glits_tones'        // GLITS (1kHz/0dBFS for 10s, then -18dBFS)
  | 'sweep_20_20k'       // Frequency sweep 20Hz to 20kHz
  | 'stereo_id'          // Left/Right identification

interface TestSignal {
  id: TestSignalType
  name: string
  description: string
  category: 'tone' | 'noise' | 'sequence' | 'diagnostic'
  level?: string
}

const TEST_SIGNALS: TestSignal[] = [
  // Standard Tones
  {
    id: 'tone_1khz_10dbfs',
    name: '1kHz @ -10dBFS',
    description: 'Standard alignment tone for broadcast',
    category: 'tone',
    level: '-10dBFS',
  },
  {
    id: 'tone_1khz_18dbfs',
    name: '1kHz @ -18dBFS',
    description: 'EBU R68 reference level (PPM 4)',
    category: 'tone',
    level: '-18dBFS',
  },
  {
    id: 'tone_1khz_20dbfs',
    name: '1kHz @ -20dBFS',
    description: 'Digital reference level',
    category: 'tone',
    level: '-20dBFS',
  },
  {
    id: 'tone_440hz',
    name: '440Hz (A4)',
    description: 'Standard tuning reference',
    category: 'tone',
  },
  {
    id: 'tone_100hz',
    name: '100Hz',
    description: 'Low frequency response test',
    category: 'tone',
  },
  {
    id: 'tone_10khz',
    name: '10kHz',
    description: 'High frequency response test',
    category: 'tone',
  },
  // Noise
  {
    id: 'pink_noise',
    name: 'Pink Noise',
    description: 'Equal energy per octave - room acoustics',
    category: 'noise',
  },
  {
    id: 'white_noise',
    name: 'White Noise',
    description: 'Equal energy per frequency',
    category: 'noise',
  },
  // Sequences
  {
    id: 'ebu_lineup',
    name: 'EBU Line-up',
    description: '1kHz tone bursts for level checks',
    category: 'sequence',
  },
  {
    id: 'countdown_10s',
    name: '10s Countdown',
    description: 'Countdown beeps for timing',
    category: 'sequence',
  },
  {
    id: 'glits_tones',
    name: 'GLITS Sequence',
    description: 'Grade Listening Test Signal',
    category: 'sequence',
  },
  // Diagnostic
  {
    id: 'sweep_20_20k',
    name: 'Freq Sweep',
    description: '20Hz to 20kHz logarithmic sweep',
    category: 'diagnostic',
  },
  {
    id: 'stereo_id',
    name: 'L/R Identification',
    description: 'Left and right channel ID tones',
    category: 'diagnostic',
  },
]

interface TestSignalGeneratorProps {
  onSignalStart?: (signalType: TestSignalType, stream: MediaStream) => void
  onSignalStop?: () => void
  compact?: boolean
}

/**
 * Professional test signal generator for broadcast engineering
 * Generates various test tones, noise, and sequences for equipment alignment
 */
export function TestSignalGenerator({
  onSignalStart,
  onSignalStop,
  compact = false,
}: TestSignalGeneratorProps) {
  const [activeSignal, setActiveSignal] = useState<TestSignalType | null>(null)
  const [outputLevel, setOutputLevel] = useState(0.316) // -10dBFS default
  const [audioLevel, setAudioLevel] = useState(0)
  const [elapsed, setElapsed] = useState(0)

  const audioContextRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const streamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const sequenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  // Convert dBFS to linear gain
  const dbfsToLinear = (dbfs: number): number => Math.pow(10, dbfs / 20)

  // Get level for specific signal type
  const getSignalLevel = (signalType: TestSignalType): number => {
    switch (signalType) {
      case 'tone_1khz_10dbfs':
        return dbfsToLinear(-10)
      case 'tone_1khz_18dbfs':
        return dbfsToLinear(-18)
      case 'tone_1khz_20dbfs':
        return dbfsToLinear(-20)
      default:
        return outputLevel
    }
  }

  // Create audio context and nodes
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext({ sampleRate: 48000 })
    }

    const ctx = audioContextRef.current

    // Create gain for output level control
    gainNodeRef.current = ctx.createGain()

    // Create analyser for level monitoring
    analyserRef.current = ctx.createAnalyser()
    analyserRef.current.fftSize = 256
    analyserRef.current.smoothingTimeConstant = 0.3

    // Create MediaStream destination for sharing
    streamDestRef.current = ctx.createMediaStreamDestination()

    // Connect: gain -> analyser -> (local + stream)
    gainNodeRef.current.connect(analyserRef.current)
    analyserRef.current.connect(ctx.destination)
    analyserRef.current.connect(streamDestRef.current)

    return ctx
  }, [])

  // Generate pure tone
  const generateTone = useCallback((frequency: number, level: number) => {
    const ctx = initAudio()

    oscillatorRef.current = ctx.createOscillator()
    oscillatorRef.current.type = 'sine'
    oscillatorRef.current.frequency.value = frequency

    gainNodeRef.current!.gain.value = level
    oscillatorRef.current.connect(gainNodeRef.current!)
    oscillatorRef.current.start()
  }, [initAudio])

  // Generate noise
  const generateNoise = useCallback((type: 'white' | 'pink') => {
    const ctx = initAudio()

    // Create noise buffer
    const bufferSize = ctx.sampleRate * 2
    const noiseBuffer = ctx.createBuffer(2, bufferSize, ctx.sampleRate)

    for (let channel = 0; channel < 2; channel++) {
      const data = noiseBuffer.getChannelData(channel)

      if (type === 'white') {
        // White noise - random samples
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1
        }
      } else {
        // Pink noise - filtered white noise (Paul Kellet's algorithm)
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1
          b0 = 0.99886 * b0 + white * 0.0555179
          b1 = 0.99332 * b1 + white * 0.0750759
          b2 = 0.96900 * b2 + white * 0.1538520
          b3 = 0.86650 * b3 + white * 0.3104856
          b4 = 0.55000 * b4 + white * 0.5329522
          b5 = -0.7616 * b5 - white * 0.0168980
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
          b6 = white * 0.115926
        }
      }
    }

    noiseSourceRef.current = ctx.createBufferSource()
    noiseSourceRef.current.buffer = noiseBuffer
    noiseSourceRef.current.loop = true

    gainNodeRef.current!.gain.value = outputLevel * 0.5 // Reduce noise level
    noiseSourceRef.current.connect(gainNodeRef.current!)
    noiseSourceRef.current.start()
  }, [initAudio, outputLevel])

  // Generate EBU line-up sequence (1kHz bursts)
  const generateEBULineup = useCallback(() => {
    const ctx = initAudio()
    let burstCount = 0
    const level = dbfsToLinear(-18)

    const playBurst = () => {
      if (burstCount >= 10) {
        // After 10 bursts, continuous tone
        generateTone(1000, level)
        if (sequenceIntervalRef.current) {
          clearInterval(sequenceIntervalRef.current)
        }
        return
      }

      oscillatorRef.current = ctx.createOscillator()
      oscillatorRef.current.type = 'sine'
      oscillatorRef.current.frequency.value = 1000

      gainNodeRef.current!.gain.value = level
      oscillatorRef.current.connect(gainNodeRef.current!)
      oscillatorRef.current.start()
      oscillatorRef.current.stop(ctx.currentTime + 0.5) // 500ms burst

      burstCount++
    }

    playBurst()
    sequenceIntervalRef.current = setInterval(playBurst, 1000) // 1 burst per second
  }, [initAudio, generateTone])

  // Generate countdown beeps
  const generateCountdown = useCallback(() => {
    const ctx = initAudio()
    let count = 10

    const playBeep = () => {
      if (count <= 0) {
        stopSignal()
        return
      }

      oscillatorRef.current = ctx.createOscillator()
      oscillatorRef.current.type = 'sine'
      oscillatorRef.current.frequency.value = count === 1 ? 1500 : 1000 // Higher pitch on final beep

      gainNodeRef.current!.gain.value = dbfsToLinear(-10)
      oscillatorRef.current.connect(gainNodeRef.current!)
      oscillatorRef.current.start()
      oscillatorRef.current.stop(ctx.currentTime + 0.1) // 100ms beep

      count--
    }

    playBeep()
    sequenceIntervalRef.current = setInterval(playBeep, 1000)
  }, [initAudio])

  // Generate frequency sweep
  const generateSweep = useCallback(() => {
    const ctx = initAudio()

    oscillatorRef.current = ctx.createOscillator()
    oscillatorRef.current.type = 'sine'
    oscillatorRef.current.frequency.value = 20

    // Logarithmic sweep from 20Hz to 20kHz over 10 seconds
    oscillatorRef.current.frequency.exponentialRampToValueAtTime(
      20000,
      ctx.currentTime + 10
    )

    gainNodeRef.current!.gain.value = outputLevel
    oscillatorRef.current.connect(gainNodeRef.current!)
    oscillatorRef.current.start()
    oscillatorRef.current.stop(ctx.currentTime + 10)

    // Auto-stop after sweep
    setTimeout(() => {
      setActiveSignal(null)
      onSignalStop?.()
    }, 10000)
  }, [initAudio, outputLevel, onSignalStop])

  // Generate L/R identification
  const generateStereoID = useCallback(() => {
    const ctx = initAudio()
    let isLeft = true

    const playID = () => {
      // Create separate gain nodes for L/R panning
      const osc = ctx.createOscillator()
      const panner = ctx.createStereoPanner()

      osc.type = 'sine'
      osc.frequency.value = isLeft ? 440 : 880 // Different frequencies for L/R

      panner.pan.value = isLeft ? -1 : 1 // Hard pan L or R

      osc.connect(panner)
      panner.connect(gainNodeRef.current!)
      gainNodeRef.current!.gain.value = outputLevel

      osc.start()
      osc.stop(ctx.currentTime + 0.5) // 500ms tone

      isLeft = !isLeft
    }

    playID()
    sequenceIntervalRef.current = setInterval(playID, 1500) // Alternate every 1.5s
  }, [initAudio, outputLevel])

  // Start a signal
  const startSignal = useCallback((signalType: TestSignalType) => {
    stopSignal() // Stop any existing signal

    setActiveSignal(signalType)
    startTimeRef.current = Date.now()

    const level = getSignalLevel(signalType)

    switch (signalType) {
      case 'tone_1khz_10dbfs':
      case 'tone_1khz_18dbfs':
      case 'tone_1khz_20dbfs':
        generateTone(1000, level)
        break
      case 'tone_440hz':
        generateTone(440, outputLevel)
        break
      case 'tone_100hz':
        generateTone(100, outputLevel)
        break
      case 'tone_10khz':
        generateTone(10000, outputLevel)
        break
      case 'pink_noise':
        generateNoise('pink')
        break
      case 'white_noise':
        generateNoise('white')
        break
      case 'ebu_lineup':
        generateEBULineup()
        break
      case 'countdown_10s':
        generateCountdown()
        break
      case 'glits_tones':
        // GLITS: 10s at 0dBFS, then -18dBFS continuous
        generateTone(1000, dbfsToLinear(0))
        setTimeout(() => {
          if (activeSignal === 'glits_tones') {
            oscillatorRef.current?.stop()
            generateTone(1000, dbfsToLinear(-18))
          }
        }, 10000)
        break
      case 'sweep_20_20k':
        generateSweep()
        break
      case 'stereo_id':
        generateStereoID()
        break
    }

    // Notify parent with the audio stream
    if (streamDestRef.current && onSignalStart) {
      onSignalStart(signalType, streamDestRef.current.stream)
    }
  }, [outputLevel, generateTone, generateNoise, generateEBULineup, generateCountdown, generateSweep, generateStereoID, onSignalStart])

  // Stop signal
  const stopSignal = useCallback(() => {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop()
      } catch {
        // Already stopped
      }
      oscillatorRef.current = null
    }

    if (noiseSourceRef.current) {
      try {
        noiseSourceRef.current.stop()
      } catch {
        // Already stopped
      }
      noiseSourceRef.current = null
    }

    if (sequenceIntervalRef.current) {
      clearInterval(sequenceIntervalRef.current)
      sequenceIntervalRef.current = null
    }

    setActiveSignal(null)
    setAudioLevel(0)
    onSignalStop?.()
  }, [onSignalStop])

  // Monitor audio levels
  useEffect(() => {
    const updateLevels = () => {
      if (analyserRef.current && activeSignal) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)

        // Calculate RMS
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / dataArray.length)
        setAudioLevel(rms / 255)

        // Update elapsed time
        setElapsed((Date.now() - startTimeRef.current) / 1000)
      }

      animationFrameRef.current = requestAnimationFrame(updateLevels)
    }

    if (activeSignal) {
      updateLevels()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [activeSignal])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSignal()
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
    }
  }, [stopSignal])

  // Group signals by category
  const groupedSignals = TEST_SIGNALS.reduce((acc, signal) => {
    if (!acc[signal.category]) {
      acc[signal.category] = []
    }
    acc[signal.category].push(signal)
    return acc
  }, {} as Record<string, TestSignal[]>)

  const categoryLabels: Record<string, string> = {
    tone: 'Reference Tones',
    noise: 'Noise',
    sequence: 'Sequences',
    diagnostic: 'Diagnostic',
  }

  if (compact) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-gray-700 bg-gray-800 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">Test Signals</span>
          {activeSignal && (
            <button
              onClick={stopSignal}
              className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-500"
            >
              Stop
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {['tone_1khz_10dbfs', 'tone_1khz_18dbfs', 'pink_noise', 'stereo_id'].map((id) => {
            const signal = TEST_SIGNALS.find(s => s.id === id)!
            return (
              <button
                key={id}
                onClick={() => activeSignal === id ? stopSignal() : startSignal(id as TestSignalType)}
                className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                  activeSignal === id
                    ? 'bg-green-600 text-white animate-pulse'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {signal.name}
              </button>
            )
          })}
        </div>

        {activeSignal && (
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 overflow-hidden rounded bg-gray-700">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${audioLevel * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">{elapsed.toFixed(1)}s</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-gray-700 bg-gray-800 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Test Signal Generator</h3>
          <p className="text-xs text-gray-400">Professional test tones for broadcast alignment</p>
        </div>

        {activeSignal && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-green-400 animate-pulse">ACTIVE</span>
            <button
              onClick={stopSignal}
              className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-500"
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Output Level Control */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-400">Output Level:</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={outputLevel}
          onChange={(e) => setOutputLevel(parseFloat(e.target.value))}
          className="h-2 w-32 cursor-pointer appearance-none rounded bg-gray-600"
          disabled={!!activeSignal}
        />
        <span className="text-xs font-mono text-white">
          {outputLevel === 0 ? '-∞' : (20 * Math.log10(outputLevel)).toFixed(1)} dBFS
        </span>
      </div>

      {/* Signal Categories */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Object.entries(groupedSignals).map(([category, signals]) => (
          <div key={category} className="rounded border border-gray-700 bg-gray-900/50 p-2">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-500">
              {categoryLabels[category]}
            </h4>
            <div className="flex flex-col gap-1">
              {signals.map((signal) => (
                <button
                  key={signal.id}
                  onClick={() => activeSignal === signal.id ? stopSignal() : startSignal(signal.id)}
                  className={`flex flex-col items-start rounded px-2 py-1.5 text-left transition-colors ${
                    activeSignal === signal.id
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                  title={signal.description}
                >
                  <span className="text-xs font-medium">{signal.name}</span>
                  {signal.level && (
                    <span className={`text-[10px] ${activeSignal === signal.id ? 'text-green-200' : 'text-gray-500'}`}>
                      {signal.level}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Level Meter */}
      {activeSignal && (
        <div className="rounded border border-gray-700 bg-gray-900 p-3">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Output Level</span>
            <span className="font-mono">{elapsed.toFixed(1)}s</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-4 flex-1 overflow-hidden rounded bg-gray-700">
              <div
                className={`h-full transition-all ${
                  audioLevel > 0.9 ? 'bg-red-500' : audioLevel > 0.7 ? 'bg-yellow-500' : 'bg-green-500'
                }`}
                style={{ width: `${audioLevel * 100}%` }}
              />
            </div>
            <span className="w-16 text-right font-mono text-xs text-white">
              {audioLevel === 0 ? '-∞' : (20 * Math.log10(audioLevel)).toFixed(1)} dB
            </span>
          </div>

          {/* Signal info */}
          <div className="mt-2 text-center">
            <span className="text-xs text-green-400">
              {TEST_SIGNALS.find(s => s.id === activeSignal)?.description}
            </span>
          </div>
        </div>
      )}

      {/* Quick Reference */}
      <div className="rounded border border-gray-700 bg-gray-900/30 p-2 text-xs text-gray-500">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span>-10 dBFS = 0 dBu (US)</span>
          <span>-18 dBFS = PPM 4 (EBU)</span>
          <span>-20 dBFS = -10 dBV</span>
          <span>0 dBFS = Digital maximum</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact test tone button for integration into control bars
 */
export function TestToneButton({
  onToneStart,
  onToneStop,
}: {
  onToneStart?: (stream: MediaStream) => void
  onToneStop?: () => void
}) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)

  const quickTones = [
    { freq: 1000, level: -10, label: '1kHz -10dB' },
    { freq: 1000, level: -18, label: '1kHz -18dB' },
    { freq: 440, level: -10, label: '440Hz' },
  ]

  const playTone = (freq: number, level: number) => {
    stopTone()

    audioContextRef.current = new AudioContext({ sampleRate: 48000 })
    const ctx = audioContextRef.current

    oscillatorRef.current = ctx.createOscillator()
    oscillatorRef.current.type = 'sine'
    oscillatorRef.current.frequency.value = freq

    const gain = ctx.createGain()
    gain.gain.value = Math.pow(10, level / 20)

    const dest = ctx.createMediaStreamDestination()

    oscillatorRef.current.connect(gain)
    gain.connect(ctx.destination)
    gain.connect(dest)

    oscillatorRef.current.start()
    setIsPlaying(true)

    onToneStart?.(dest.stream)
  }

  const stopTone = () => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop()
      oscillatorRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    setIsPlaying(false)
    onToneStop?.()
  }

  return (
    <div className="relative">
      <button
        onClick={() => isPlaying ? stopTone() : setShowMenu(!showMenu)}
        className={`flex h-7 items-center gap-1 px-2 text-[10px] font-mono uppercase transition-colors ${
          isPlaying
            ? 'bg-yellow-600 text-white animate-pulse'
            : 'bg-gray-900 text-gray-500 hover:bg-gray-800 hover:text-gray-300'
        }`}
        title="Test tone generator"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        {isPlaying ? 'TONE' : 'Test'}
      </button>

      {showMenu && !isPlaying && (
        <div className="absolute bottom-full left-0 mb-1 border border-gray-800 bg-gray-950 p-0.5 shadow-lg">
          {quickTones.map((tone) => (
            <button
              key={tone.label}
              onClick={() => {
                playTone(tone.freq, tone.level)
                setShowMenu(false)
              }}
              className="block w-full px-2 py-1 text-left text-[10px] font-mono text-gray-400 hover:bg-gray-800 hover:text-white"
            >
              {tone.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
