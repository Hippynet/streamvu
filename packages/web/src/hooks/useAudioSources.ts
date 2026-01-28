import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../services/api'
import { PlaybackState } from '@streamvu/shared'
import type { AudioSource } from '@streamvu/shared'

interface AudioSourcePlayback {
  source: AudioSource
  audioElement: HTMLAudioElement | null
  audioContext: AudioContext | null
  gainNode: GainNode | null
  panNode: StereoPannerNode | null
  analyserNode: AnalyserNode | null
  stream: MediaStream | null  // Exposed stream for mixer integration
  audioLevel: number
  isPlaying: boolean
  error: string | null
}

interface UseAudioSourcesOptions {
  roomId: string
  enabled?: boolean
  onSourcesChanged?: (sources: AudioSource[]) => void
  // Mediasoup functions for sharing audio with all participants
  produceAuxiliaryAudio?: (stream: MediaStream, sourceId: string) => Promise<string | null>
  closeAuxiliaryProducer?: (sourceId: string) => void
}

export function useAudioSources({
  roomId,
  enabled = true,
  onSourcesChanged,
  produceAuxiliaryAudio,
  closeAuxiliaryProducer,
}: UseAudioSourcesOptions) {
  const [sources, setSources] = useState<AudioSource[]>([])
  const [playbackState, setPlaybackState] = useState<Map<string, AudioSourcePlayback>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Animation frame for VU meters
  const animationFrameRef = useRef<number | null>(null)
  const playbackStateRef = useRef<Map<string, AudioSourcePlayback>>(playbackState)

  // Keep ref in sync with state
  useEffect(() => {
    playbackStateRef.current = playbackState
  }, [playbackState])

  // Load sources from API
  const loadSources = useCallback(async () => {
    if (!enabled) return

    try {
      const data = await api.audioSources.list(roomId)
      setSources(data)
      onSourcesChanged?.(data)
    } catch (err) {
      console.error('[useAudioSources] Failed to load sources:', err)
      setError('Failed to load sources')
    } finally {
      setLoading(false)
    }
  }, [roomId, enabled, onSourcesChanged])

  // Initial load
  useEffect(() => {
    loadSources()
  }, [loadSources])

  // Start playing an HTTP stream or SRT source
  const startSource = useCallback(async (sourceId: string) => {
    const source = sources.find(s => s.id === sourceId)
    if (!source) return

    try {
      // Update backend state
      const updatedSource = await api.audioSources.start(roomId, sourceId)
      setSources(prev => prev.map(s => s.id === sourceId ? updatedSource : s))

      // For SRT streams, the backend handles everything
      // Audio flows: FFmpeg (SRT decode) -> RTP -> PlainTransport -> mediasoup Producer -> Consumers
      // No local audio element needed - participants consume via mediasoup like they consume other participants
      if (source.type === 'SRT_STREAM') {
        console.log(`[useAudioSources] SRT source started: ${source.name}`)
        console.log(`[useAudioSources] Audio will flow through mediasoup from backend`)

        // Store minimal playback state for tracking
        setPlaybackState(prev => {
          const newState = new Map(prev)
          newState.set(sourceId, {
            source: updatedSource,
            audioElement: null,
            audioContext: null,
            gainNode: null,
            panNode: null,
            analyserNode: null,
            stream: null, // No local stream - audio comes via mediasoup
            audioLevel: 0,
            isPlaying: true,
            error: null,
          })
          return newState
        })
        return
      }

      // For HTTP streams, create audio element and start playback
      if (source.type === 'HTTP_STREAM' && source.streamUrl) {
        console.log(`[useAudioSources] Starting HTTP stream: ${source.name} (${source.streamUrl})`)

        // Create audio element
        const audioElement = new Audio()
        audioElement.crossOrigin = 'anonymous'
        audioElement.src = source.streamUrl

        // Create Web Audio graph for processing
        const audioContext = new AudioContext()

        // Wait for audio to be ready before connecting
        audioElement.addEventListener('canplay', async () => {
          console.log(`[useAudioSources] Stream can play: ${source.name}`)

          try {
            // Resume context if needed
            if (audioContext.state === 'suspended') {
              await audioContext.resume()
            }

            const mediaSource = audioContext.createMediaElementSource(audioElement)
            const gainNode = audioContext.createGain()
            const panNode = audioContext.createStereoPanner()
            const analyserNode = audioContext.createAnalyser()

            // Configure analyser for VU meter
            analyserNode.fftSize = 256
            analyserNode.smoothingTimeConstant = 0.8

            // Create a MediaStreamDestination for WebRTC distribution
            // This creates a MediaStream that can be sent to other participants
            const streamDestination = audioContext.createMediaStreamDestination()

            // Connect: source -> gain -> pan -> analyser -> MediaStream (for mixer integration)
            // NOTE: We do NOT connect to speakers here - audio playback is handled by the ProMixer
            // The mixer routes audio to buses (PGM, AUX, etc) and then to speakers
            mediaSource.connect(gainNode)
            gainNode.connect(panNode)
            panNode.connect(analyserNode)

            // Route to MediaStream for mixer integration (NOT to speakers)
            // The mixer will handle routing to PGM bus -> speakers
            analyserNode.connect(streamDestination)

            // Apply initial settings
            gainNode.gain.value = source.muted ? 0 : source.volume
            panNode.pan.value = source.pan

            // Store playback state
            setPlaybackState(prev => {
              const newState = new Map(prev)
              newState.set(sourceId, {
                source: updatedSource,
                audioElement,
                audioContext,
                gainNode,
                panNode,
                analyserNode: analyserNode,
                stream: streamDestination.stream,  // Store stream for mixer integration
                audioLevel: 0,
                isPlaying: true,
                error: null,
              })
              return newState
            })

            // Start playback
            await audioElement.play()
            console.log(`[useAudioSources] Stream playing locally: ${source.name}`)

            // Produce to room for all participants to hear
            if (produceAuxiliaryAudio) {
              const producerId = await produceAuxiliaryAudio(streamDestination.stream, sourceId)
              if (producerId) {
                console.log(`[useAudioSources] Stream shared with room: ${source.name} (producer: ${producerId})`)
              } else {
                console.warn(`[useAudioSources] Failed to share stream with room: ${source.name}`)
              }
            }

            // Update sources state to reflect PLAYING
            setSources(prev => prev.map(s => s.id === sourceId ? { ...s, playbackState: PlaybackState.PLAYING } : s))

          } catch (err) {
            console.error(`[useAudioSources] Failed to set up Web Audio:`, err)
            setPlaybackState(prev => {
              const newState = new Map(prev)
              const existing = newState.get(sourceId)
              if (existing) {
                newState.set(sourceId, { ...existing, error: 'Failed to set up audio' })
              }
              return newState
            })
          }
        }, { once: true })

        audioElement.addEventListener('error', (e) => {
          console.error(`[useAudioSources] Stream error: ${source.name}`, e)
          setPlaybackState(prev => {
            const newState = new Map(prev)
            const existing = newState.get(sourceId)
            if (existing) {
              newState.set(sourceId, { ...existing, error: 'Stream connection failed', isPlaying: false })
            }
            return newState
          })
        })

        // Start loading
        audioElement.load()
      }

      // For FILE playback, create audio element and load from file download URL
      if (source.type === 'FILE' && source.fileId) {
        console.log(`[useAudioSources] Starting file playback: ${source.name}`)

        // Build the file download URL
        const fileUrl = `/api/files/${source.fileId}/download`

        // Create audio element
        const audioElement = new Audio()
        audioElement.crossOrigin = 'anonymous'
        audioElement.src = fileUrl

        // Create Web Audio graph for processing
        const audioContext = new AudioContext()

        // Wait for audio to be ready before connecting
        audioElement.addEventListener('canplaythrough', async () => {
          console.log(`[useAudioSources] File can play: ${source.name}`)

          try {
            // Resume context if needed
            if (audioContext.state === 'suspended') {
              await audioContext.resume()
            }

            const mediaSource = audioContext.createMediaElementSource(audioElement)
            const gainNode = audioContext.createGain()
            const panNode = audioContext.createStereoPanner()
            const analyserNode = audioContext.createAnalyser()

            // Configure analyser for VU meter
            analyserNode.fftSize = 256
            analyserNode.smoothingTimeConstant = 0.8

            // Create a MediaStreamDestination for WebRTC distribution
            const streamDestination = audioContext.createMediaStreamDestination()

            // Connect: source -> gain -> pan -> analyser -> MediaStream (for mixer integration)
            // NOTE: We do NOT connect to speakers here - audio playback is handled by the ProMixer
            // The mixer routes audio to buses (PGM, AUX, etc) and then to speakers
            mediaSource.connect(gainNode)
            gainNode.connect(panNode)
            panNode.connect(analyserNode)

            // Route to MediaStream for mixer integration (NOT to speakers)
            // The mixer will handle routing to PGM bus -> speakers
            analyserNode.connect(streamDestination)

            // Apply initial settings
            gainNode.gain.value = source.muted ? 0 : source.volume
            panNode.pan.value = source.pan

            // Set initial position if resuming
            if (source.playbackPosition > 0) {
              audioElement.currentTime = source.playbackPosition
            }

            // Store playback state
            setPlaybackState(prev => {
              const newState = new Map(prev)
              newState.set(sourceId, {
                source: updatedSource,
                audioElement,
                audioContext,
                gainNode,
                panNode,
                analyserNode: analyserNode,
                stream: streamDestination.stream,
                audioLevel: 0,
                isPlaying: true,
                error: null,
              })
              return newState
            })

            // Start playback
            await audioElement.play()
            console.log(`[useAudioSources] File playing locally: ${source.name}`)

            // Produce to room for all participants to hear
            if (produceAuxiliaryAudio) {
              const producerId = await produceAuxiliaryAudio(streamDestination.stream, sourceId)
              if (producerId) {
                console.log(`[useAudioSources] File shared with room: ${source.name} (producer: ${producerId})`)
              } else {
                console.warn(`[useAudioSources] Failed to share file with room: ${source.name}`)
              }
            }

            // Update sources state to reflect PLAYING
            setSources(prev => prev.map(s => s.id === sourceId ? { ...s, playbackState: PlaybackState.PLAYING } : s))

          } catch (err) {
            console.error(`[useAudioSources] Failed to set up Web Audio for file:`, err)
            setPlaybackState(prev => {
              const newState = new Map(prev)
              const existing = newState.get(sourceId)
              if (existing) {
                newState.set(sourceId, { ...existing, error: 'Failed to set up audio' })
              }
              return newState
            })
          }
        }, { once: true })

        // Handle playback end (for looping or stopping)
        audioElement.addEventListener('ended', async () => {
          console.log(`[useAudioSources] File playback ended: ${source.name}`)
          if (source.loopEnabled) {
            audioElement.currentTime = 0
            await audioElement.play()
          } else {
            // Update state to stopped
            setSources(prev => prev.map(s => s.id === sourceId ? { ...s, playbackState: PlaybackState.STOPPED, playbackPosition: 0 } : s))
            setPlaybackState(prev => {
              const newState = new Map(prev)
              const existing = newState.get(sourceId)
              if (existing) {
                newState.set(sourceId, { ...existing, isPlaying: false })
              }
              return newState
            })
            // Notify backend
            try {
              await api.audioSources.stop(roomId, sourceId)
            } catch (e) {
              console.error('[useAudioSources] Failed to notify backend of file end:', e)
            }
          }
        })

        audioElement.addEventListener('error', (e) => {
          console.error(`[useAudioSources] File error: ${source.name}`, e)
          setPlaybackState(prev => {
            const newState = new Map(prev)
            const existing = newState.get(sourceId)
            if (existing) {
              newState.set(sourceId, { ...existing, error: 'File playback failed', isPlaying: false })
            }
            return newState
          })
        })

        // Start loading
        audioElement.load()
      }
    } catch (err) {
      console.error('[useAudioSources] Failed to start source:', err)
    }
  }, [roomId, sources, produceAuxiliaryAudio])

  // Stop a source
  const stopSource = useCallback(async (sourceId: string) => {
    const source = sources.find(s => s.id === sourceId)

    try {
      // Update backend state (this also stops SRT ingest on backend)
      const updatedSource = await api.audioSources.stop(roomId, sourceId)
      setSources(prev => prev.map(s => s.id === sourceId ? updatedSource : s))

      // For SRT sources, backend handles cleanup (FFmpeg stop, transport close)
      // We just need to clean up local playback state
      if (source?.type === 'SRT_STREAM') {
        console.log(`[useAudioSources] SRT source stopped: ${source.name}`)
        setPlaybackState(prev => {
          const newState = new Map(prev)
          newState.delete(sourceId)
          return newState
        })
        return
      }

      // Stop sharing HTTP streams with room participants
      if (closeAuxiliaryProducer) {
        closeAuxiliaryProducer(sourceId)
        console.log(`[useAudioSources] Stopped sharing source with room: ${sourceId}`)
      }

      // Clean up HTTP stream audio playback
      const playback = playbackState.get(sourceId)
      if (playback) {
        console.log(`[useAudioSources] Stopping source: ${sourceId}`)

        if (playback.audioElement) {
          playback.audioElement.pause()
          playback.audioElement.src = ''
        }

        if (playback.audioContext) {
          playback.audioContext.close()
        }

        setPlaybackState(prev => {
          const newState = new Map(prev)
          newState.delete(sourceId)
          return newState
        })
      }
    } catch (err) {
      console.error('[useAudioSources] Failed to stop source:', err)
    }
  }, [roomId, sources, playbackState, closeAuxiliaryProducer])

  // Update source volume
  const setSourceVolume = useCallback((sourceId: string, volume: number) => {
    const playback = playbackState.get(sourceId)
    if (playback?.gainNode) {
      const source = sources.find(s => s.id === sourceId)
      const isMuted = source?.muted || false
      playback.gainNode.gain.value = isMuted ? 0 : volume
    }

    // Update source in state
    setSources(prev => prev.map(s => s.id === sourceId ? { ...s, volume } : s))
  }, [playbackState, sources])

  // Update source pan
  const setSourcePan = useCallback((sourceId: string, pan: number) => {
    const playback = playbackState.get(sourceId)
    if (playback?.panNode) {
      playback.panNode.pan.value = pan
    }

    // Update source in state
    setSources(prev => prev.map(s => s.id === sourceId ? { ...s, pan } : s))
  }, [playbackState])

  // Toggle source mute
  const toggleSourceMute = useCallback((sourceId: string) => {
    const source = sources.find(s => s.id === sourceId)
    if (!source) return

    const newMuted = !source.muted
    const playback = playbackState.get(sourceId)
    if (playback?.gainNode) {
      playback.gainNode.gain.value = newMuted ? 0 : source.volume
    }

    // Update source in state
    setSources(prev => prev.map(s => s.id === sourceId ? { ...s, muted: newMuted } : s))
  }, [sources, playbackState])

  // Pause a file source
  const pauseSource = useCallback(async (sourceId: string) => {
    const source = sources.find(s => s.id === sourceId)
    if (!source || source.type !== 'FILE') return

    try {
      // Update backend state
      await api.audioSources.pause(roomId, sourceId)

      // Pause local playback
      const playback = playbackState.get(sourceId)
      if (playback?.audioElement) {
        playback.audioElement.pause()
        console.log(`[useAudioSources] File paused: ${source.name}`)

        // Update playback state
        setPlaybackState(prev => {
          const newState = new Map(prev)
          const existing = newState.get(sourceId)
          if (existing) {
            newState.set(sourceId, { ...existing, isPlaying: false })
          }
          return newState
        })
      }

      // Update source state
      setSources(prev => prev.map(s => s.id === sourceId ? { ...s, playbackState: PlaybackState.PAUSED } : s))
    } catch (err) {
      console.error('[useAudioSources] Failed to pause source:', err)
    }
  }, [roomId, sources, playbackState])

  // Resume a paused file source
  const resumeSource = useCallback(async (sourceId: string) => {
    const source = sources.find(s => s.id === sourceId)
    if (!source || source.type !== 'FILE') return

    try {
      // Update backend state
      await api.audioSources.play(roomId, sourceId)

      // Resume local playback
      const playback = playbackState.get(sourceId)
      if (playback?.audioElement) {
        await playback.audioElement.play()
        console.log(`[useAudioSources] File resumed: ${source.name}`)

        // Update playback state
        setPlaybackState(prev => {
          const newState = new Map(prev)
          const existing = newState.get(sourceId)
          if (existing) {
            newState.set(sourceId, { ...existing, isPlaying: true })
          }
          return newState
        })
      }

      // Update source state
      setSources(prev => prev.map(s => s.id === sourceId ? { ...s, playbackState: PlaybackState.PLAYING } : s))
    } catch (err) {
      console.error('[useAudioSources] Failed to resume source:', err)
    }
  }, [roomId, sources, playbackState])

  // Seek a file source to a specific position
  const seekSource = useCallback(async (sourceId: string, position: number) => {
    const source = sources.find(s => s.id === sourceId)
    if (!source || source.type !== 'FILE') return

    try {
      // Update backend state
      await api.audioSources.seek(roomId, sourceId, position)

      // Seek local playback
      const playback = playbackState.get(sourceId)
      if (playback?.audioElement) {
        playback.audioElement.currentTime = position
        console.log(`[useAudioSources] File seeked to ${position}s: ${source.name}`)
      }

      // Update source state
      setSources(prev => prev.map(s => s.id === sourceId ? { ...s, playbackPosition: position } : s))
    } catch (err) {
      console.error('[useAudioSources] Failed to seek source:', err)
    }
  }, [roomId, sources, playbackState])

  // Delete a source
  const deleteSource = useCallback(async (sourceId: string) => {
    try {
      // Stop playback first
      await stopSource(sourceId)

      // Delete from backend
      await api.audioSources.delete(roomId, sourceId)
      setSources(prev => prev.filter(s => s.id !== sourceId))
    } catch (err) {
      console.error('[useAudioSources] Failed to delete source:', err)
    }
  }, [roomId, stopSource])

  // Get audio level for a source (for VU meter)
  const getAudioLevel = useCallback((sourceId: string): number => {
    const playback = playbackStateRef.current.get(sourceId)
    return playback?.audioLevel || 0
  }, [])

  // Get MediaStream for a source (for mixer integration)
  const getSourceStream = useCallback((sourceId: string): MediaStream | null => {
    const playback = playbackStateRef.current.get(sourceId)
    return playback?.stream || null
  }, [])

  // Update VU levels via animation frame
  useEffect(() => {
    const updateLevels = () => {
      let hasUpdates = false

      playbackStateRef.current.forEach((playback) => {
        if (playback.analyserNode && playback.isPlaying) {
          // Use fftSize for time-domain data (not frequencyBinCount which is fftSize/2)
          const dataArray = new Uint8Array(playback.analyserNode.fftSize)
          // FIXED: Use getByteTimeDomainData for actual audio level, not getByteFrequencyData (FFT magnitudes)
          playback.analyserNode.getByteTimeDomainData(dataArray)

          // Calculate RMS level from time-domain samples
          let sum = 0
          for (let i = 0; i < dataArray.length; i++) {
            // Convert from 0-255 (128 = silence) to -1 to 1
            const sample = (dataArray[i] - 128) / 128
            sum += sample * sample
          }
          const rms = Math.sqrt(sum / dataArray.length)
          const normalizedLevel = Math.min(rms, 1) // Already normalized to 0-1

          if (Math.abs(playback.audioLevel - normalizedLevel) > 0.01) {
            playback.audioLevel = normalizedLevel
            hasUpdates = true
          }
        }
      })

      if (hasUpdates) {
        setPlaybackState(new Map(playbackStateRef.current))
      }

      animationFrameRef.current = requestAnimationFrame(updateLevels)
    }

    if (playbackState.size > 0) {
      updateLevels()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [playbackState.size])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      playbackState.forEach((playback) => {
        if (playback.audioElement) {
          playback.audioElement.pause()
          playback.audioElement.src = ''
        }
        if (playback.audioContext) {
          playback.audioContext.close()
        }
      })
    }
  }, [])

  return {
    sources,
    playbackState,
    loading,
    error,
    loadSources,
    startSource,
    stopSource,
    pauseSource,
    resumeSource,
    seekSource,
    setSourceVolume,
    setSourcePan,
    toggleSourceMute,
    deleteSource,
    getAudioLevel,
    getSourceStream,
  }
}
