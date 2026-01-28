import { useState, useRef, useCallback, useEffect } from 'react'

interface StreamLevels {
  left: number
  right: number
  peak: number
}

interface MonitoredStream {
  id: string
  url: string
  audio: HTMLAudioElement
  audioContext: AudioContext
  analyserLeft: AnalyserNode
  analyserRight: AnalyserNode
  source: MediaElementAudioSourceNode
  gainNode: GainNode
  levels: StreamLevels
  isMuted: boolean
  error: string | null
}

interface UseStreamMonitorReturn {
  isMonitoring: boolean
  streams: Map<string, MonitoredStream>
  startMonitoring: (streamConfigs: Array<{ id: string; url: string }>) => Promise<void>
  stopMonitoring: () => void
  getLevels: (streamId: string) => StreamLevels
  toggleMute: (streamId: string) => void
  isMuted: (streamId: string) => boolean
  getAudioElement: (streamId: string) => HTMLAudioElement | null
}

export function useStreamMonitor(): UseStreamMonitorReturn {
  const [isMonitoring, setIsMonitoring] = useState(false)
  const streamsRef = useRef<Map<string, MonitoredStream>>(new Map())
  const animationFrameRef = useRef<number | null>(null)
  const [, forceUpdate] = useState({})

  const calculateRMS = (data: Float32Array): number => {
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      sum += data[i]! * data[i]!
    }
    return Math.sqrt(sum / data.length)
  }

  const updateAllLevels = useCallback(() => {
    streamsRef.current.forEach((stream) => {
      if (stream.analyserLeft && stream.analyserRight) {
        const leftData = new Float32Array(stream.analyserLeft.fftSize)
        const rightData = new Float32Array(stream.analyserRight.fftSize)

        stream.analyserLeft.getFloatTimeDomainData(leftData)
        stream.analyserRight.getFloatTimeDomainData(rightData)

        const leftRMS = calculateRMS(leftData)
        const rightRMS = calculateRMS(rightData)

        // Scale RMS to level (0 dB = 1.0, +6 dB = ~2.0)
        // RMS of 0.25 = 0 dB reference point
        // Allow values > 1.0 for peaks above 0 dB
        const leftLevel = leftRMS * 4
        const rightLevel = rightRMS * 4
        const currentPeak = Math.max(leftLevel, rightLevel)

        // Update with decay on peak
        stream.levels = {
          left: leftLevel,
          right: rightLevel,
          peak: Math.max(currentPeak, stream.levels.peak * 0.95),
        }
      }
    })

    forceUpdate({})
    animationFrameRef.current = requestAnimationFrame(updateAllLevels)
  }, [])

  const startMonitoring = useCallback(
    async (streamConfigs: Array<{ id: string; url: string }>) => {
      // Stop any existing monitoring
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      streamsRef.current.forEach((stream) => {
        stream.audio.pause()
        stream.audio.src = ''
        stream.audioContext.close()
      })
      streamsRef.current.clear()

      // Create monitors for each stream
      for (const config of streamConfigs) {
        try {
          const audio = new Audio()
          audio.crossOrigin = 'anonymous'
          audio.src = config.url

          const audioContext = new AudioContext()
          const source = audioContext.createMediaElementSource(audio)

          // Create gain node for muting
          const gainNode = audioContext.createGain()
          gainNode.gain.value = 0 // Start muted

          // Create stereo splitter and analyzers
          const splitter = audioContext.createChannelSplitter(2)
          const analyserLeft = audioContext.createAnalyser()
          const analyserRight = audioContext.createAnalyser()

          analyserLeft.fftSize = 2048
          analyserRight.fftSize = 2048
          analyserLeft.smoothingTimeConstant = 0.8
          analyserRight.smoothingTimeConstant = 0.8

          // Connect: source -> splitter -> analyzers
          source.connect(splitter)
          splitter.connect(analyserLeft, 0)
          splitter.connect(analyserRight, 1)

          // Connect source -> gain -> destination (for listening)
          source.connect(gainNode)
          gainNode.connect(audioContext.destination)

          const monitoredStream: MonitoredStream = {
            id: config.id,
            url: config.url,
            audio,
            audioContext,
            analyserLeft,
            analyserRight,
            source,
            gainNode,
            levels: { left: 0, right: 0, peak: 0 },
            isMuted: true,
            error: null,
          }

          streamsRef.current.set(config.id, monitoredStream)

          // Start playback
          audio.play().catch((err) => {
            monitoredStream.error = err.message
            console.error(`Error playing stream ${config.id}:`, err)
          })
        } catch (err) {
          console.error(`Error setting up stream ${config.id}:`, err)
        }
      }

      setIsMonitoring(true)
      updateAllLevels()
    },
    [updateAllLevels]
  )

  const stopMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    streamsRef.current.forEach((stream) => {
      stream.audio.pause()
      stream.audio.src = ''
      stream.audioContext.close()
    })
    streamsRef.current.clear()

    setIsMonitoring(false)
    forceUpdate({})
  }, [])

  const getLevels = useCallback((streamId: string): StreamLevels => {
    return streamsRef.current.get(streamId)?.levels || { left: 0, right: 0, peak: 0 }
  }, [])

  const toggleMute = useCallback((streamId: string) => {
    const stream = streamsRef.current.get(streamId)
    if (stream) {
      stream.isMuted = !stream.isMuted
      stream.gainNode.gain.value = stream.isMuted ? 0 : 1
      forceUpdate({})
    }
  }, [])

  const isMuted = useCallback((streamId: string): boolean => {
    return streamsRef.current.get(streamId)?.isMuted ?? true
  }, [])

  const getAudioElement = useCallback((streamId: string): HTMLAudioElement | null => {
    return streamsRef.current.get(streamId)?.audio ?? null
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring()
    }
  }, [stopMonitoring])

  return {
    isMonitoring,
    streams: streamsRef.current,
    startMonitoring,
    stopMonitoring,
    getLevels,
    toggleMute,
    isMuted,
    getAudioElement,
  }
}
