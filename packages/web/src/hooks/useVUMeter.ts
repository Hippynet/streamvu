import { useState, useRef, useCallback, useEffect } from 'react'
import type { VULevels } from '@streamvu/shared'
import { VU_DECAY_RATE } from '@streamvu/shared'

interface UseVUMeterReturn {
  levels: VULevels
  isPlaying: boolean
  error: string | null
  play: () => void
  stop: () => void
}

export function useVUMeter(streamUrl: string): UseVUMeterReturn {
  const [levels, setLevels] = useState<VULevels>({ left: 0, right: 0, peak: 0 })
  const [isPlaying, setIsPlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserLeftRef = useRef<AnalyserNode | null>(null)
  const analyserRightRef = useRef<AnalyserNode | null>(null)
  const splitterRef = useRef<ChannelSplitterNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const peakRef = useRef(0)

  const updateLevels = useCallback(() => {
    if (!analyserLeftRef.current || !analyserRightRef.current) return

    const leftData = new Float32Array(analyserLeftRef.current.fftSize)
    const rightData = new Float32Array(analyserRightRef.current.fftSize)

    analyserLeftRef.current.getFloatTimeDomainData(leftData)
    analyserRightRef.current.getFloatTimeDomainData(rightData)

    // Calculate RMS for each channel
    const calculateRMS = (data: Float32Array): number => {
      let sum = 0
      for (let i = 0; i < data.length; i++) {
        sum += data[i]! * data[i]!
      }
      return Math.sqrt(sum / data.length)
    }

    const leftRMS = calculateRMS(leftData)
    const rightRMS = calculateRMS(rightData)

    // Convert to 0-1 range with some scaling
    const leftLevel = Math.min(1, leftRMS * 3)
    const rightLevel = Math.min(1, rightRMS * 3)
    const currentPeak = Math.max(leftLevel, rightLevel)

    // Update peak with decay
    peakRef.current = Math.max(currentPeak, peakRef.current * VU_DECAY_RATE)

    setLevels({
      left: leftLevel,
      right: rightLevel,
      peak: peakRef.current,
    })

    animationFrameRef.current = requestAnimationFrame(updateLevels)
  }, [])

  const play = useCallback(async () => {
    setError(null)

    try {
      // Create audio element
      const audio = new Audio()
      audio.crossOrigin = 'anonymous'
      audio.src = streamUrl
      audioRef.current = audio

      // Create audio context
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      // Create source from audio element
      const source = audioContext.createMediaElementSource(audio)

      // Create channel splitter for stereo
      const splitter = audioContext.createChannelSplitter(2)
      splitterRef.current = splitter

      // Create analyzers for each channel
      const analyserLeft = audioContext.createAnalyser()
      const analyserRight = audioContext.createAnalyser()

      analyserLeft.fftSize = 2048
      analyserRight.fftSize = 2048
      analyserLeft.smoothingTimeConstant = 0.8
      analyserRight.smoothingTimeConstant = 0.8

      analyserLeftRef.current = analyserLeft
      analyserRightRef.current = analyserRight

      // Connect: source -> splitter -> analyzers
      source.connect(splitter)
      splitter.connect(analyserLeft, 0)
      splitter.connect(analyserRight, 1)

      // Also connect to destination for audio output
      source.connect(audioContext.destination)

      // Start playback
      await audio.play()
      setIsPlaying(true)

      // Start animation loop
      updateLevels()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to play stream'
      setError(message)
      console.error('VU Meter error:', err)
    }
  }, [streamUrl, updateLevels])

  const stop = useCallback(() => {
    // Stop animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Stop and cleanup audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    analyserLeftRef.current = null
    analyserRightRef.current = null
    splitterRef.current = null
    peakRef.current = 0

    setIsPlaying(false)
    setLevels({ left: 0, right: 0, peak: 0 })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return { levels, isPlaying, error, play, stop }
}
