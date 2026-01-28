/**
 * useAudioEngine - Client-Side Audio Processing Engine
 *
 * Implements a full broadcast-style audio processing chain using Web Audio API.
 * All mixing happens in the browser for efficiency - server only encodes outputs.
 *
 * Features:
 * - Per-channel processing: Input gain, HPF, 3-band EQ, Compressor, Pan, Fader
 * - 6 mix buses: PGM, TB, AUX1-4
 * - Aux sends with pre/post fader options
 * - Real-time level metering
 * - Bus output as MediaStream for server encoding
 */

import { useRef, useCallback, useEffect, useState } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export type BusType = 'PGM' | 'TB' | 'AUX1' | 'AUX2' | 'AUX3' | 'AUX4'

// Ducking source types for voice-activated gain reduction
export type DuckingSourceType = 'voice' | 'music' | 'sfx' | 'none'

export interface DuckingSettings {
  sourceType: DuckingSourceType // What type of audio is this channel?
  enabled: boolean // Is ducking enabled for this channel?
  amount: number // How much to duck by in dB (-3 to -24)
  threshold: number // Voice detection threshold (0-1)
  attack: number // Attack time in ms (1-100)
  release: number // Release time in ms (50-2000)
}

// Preset ducking configurations
export const DUCKING_PRESETS = {
  music: {
    sourceType: 'music' as DuckingSourceType,
    enabled: true,
    amount: -12,
    threshold: 0.1,
    attack: 10,
    release: 500,
  },
  sfx: {
    sourceType: 'sfx' as DuckingSourceType,
    enabled: true,
    amount: -6,
    threshold: 0.1,
    attack: 5,
    release: 200,
  },
  off: {
    sourceType: 'none' as DuckingSourceType,
    enabled: false,
    amount: 0,
    threshold: 0.1,
    attack: 10,
    release: 500,
  },
}

export interface EQSettings {
  hpfEnabled: boolean
  hpfFreq: number // 20-500 Hz
  lowGain: number // -15 to +15 dB
  lowFreq: number // 60-500 Hz
  midGain: number // -15 to +15 dB
  midFreq: number // 200-8000 Hz
  midQ: number // 0.5-8
  highGain: number // -15 to +15 dB
  highFreq: number // 2000-16000 Hz
}

export interface CompressorSettings {
  enabled: boolean
  threshold: number // -40 to 0 dB
  ratio: number // 1 to 20
  attack: number // 0.001 to 0.1 seconds
  release: number // 0.01 to 1 seconds
  makeupGain: number // 0 to 20 dB
}

export interface GateSettings {
  enabled: boolean
  threshold: number // -60 to 0 dB - below this level, gate closes
  attack: number // 0.001 to 0.05 seconds - how fast gate opens
  hold: number // 0 to 500 ms - how long gate stays open after signal drops
  release: number // 0.01 to 1 seconds - how fast gate closes
  range: number // -80 to 0 dB - how much to attenuate when closed (0 = full mute)
}

export interface ChannelSettings {
  inputGain: number // -20 to +20 dB
  eq: EQSettings
  gate: GateSettings // Noise gate
  compressor: CompressorSettings
  ducking: DuckingSettings // Voice-activated ducking
  pan: number // -1 to +1
  fader: number // 0 to 1.5 (unity = 1.0)
  mute: boolean
  solo: boolean
  pfl: boolean // Pre-Fader Listen
  auxSends: Record<BusType, { level: number; preFader: boolean }>
  busAssignment: BusType[]
}

export interface BusSettings {
  fader: number // 0 to 1.5
  mute: boolean
  limiterEnabled: boolean
  limiterThreshold: number // -12 to 0 dB
}

export interface ChannelLevels {
  input: number // 0-1 normalized
  output: number // 0-1 normalized
  gainReduction: number // 0-20 dB (compressor GR)
}

export interface BusLevels {
  left: number // 0-1 normalized
  right: number // 0-1 normalized
}

// Internal processing chain for a channel
interface ChannelNodes {
  source: MediaStreamAudioSourceNode | null
  inputGain: GainNode
  hpf: BiquadFilterNode
  gateGain: GainNode // Noise gate (gain-based, controlled in animation loop)
  eqLow: BiquadFilterNode
  eqMid: BiquadFilterNode
  eqHigh: BiquadFilterNode
  compressor: DynamicsCompressorNode
  makeupGain: GainNode
  duckingGain: GainNode // Gain node for ducking control
  panner: StereoPannerNode
  fader: GainNode
  inputAnalyser: AnalyserNode
  outputAnalyser: AnalyserNode
  gateAnalyser: AnalyserNode // For gate level detection (pre-gate)
  // Aux send nodes (one per bus, tapped at different points)
  auxSendsPre: Map<BusType, GainNode> // Pre-fader sends
  auxSendsPost: Map<BusType, GainNode> // Post-fader sends
  // Splitter for routing to multiple buses
  splitter: ChannelSplitterNode
  // Merger back to stereo after panning
  merger: ChannelMergerNode
}

// Internal bus mixer
interface BusNodes {
  input: GainNode // Sum of all channel sends
  limiter: DynamicsCompressorNode
  fader: GainNode
  analyserL: AnalyserNode
  analyserR: AnalyserNode
  splitter: ChannelSplitterNode
  destination: MediaStreamAudioDestinationNode // For sending to server
}

// Default settings
const DEFAULT_EQ: EQSettings = {
  hpfEnabled: false,
  hpfFreq: 80,
  lowGain: 0,
  lowFreq: 100,
  midGain: 0,
  midFreq: 1000,
  midQ: 1.5,
  highGain: 0,
  highFreq: 8000,
}

const DEFAULT_COMPRESSOR: CompressorSettings = {
  enabled: false,
  threshold: -20,
  ratio: 4,
  attack: 0.01, // 10ms
  release: 0.1, // 100ms
  makeupGain: 0,
}

const DEFAULT_GATE: GateSettings = {
  enabled: false,
  threshold: -40, // dB - gate opens above this level
  attack: 0.005, // 5ms - fast attack for speech
  hold: 100, // 100ms - keeps gate open briefly after signal drops
  release: 0.1, // 100ms - smooth release
  range: -60, // dB - how much to attenuate when closed (-60 = nearly silent)
}

const DEFAULT_DUCKING: DuckingSettings = {
  sourceType: 'voice', // Default to voice (won't be ducked)
  enabled: false,
  amount: -12,
  threshold: 0.1,
  attack: 10,
  release: 500,
}

const DEFAULT_AUX_SENDS: Record<BusType, { level: number; preFader: boolean }> = {
  PGM: { level: 0, preFader: false },
  TB: { level: 0, preFader: false },
  AUX1: { level: 0, preFader: true },
  AUX2: { level: 0, preFader: true },
  AUX3: { level: 0, preFader: true },
  AUX4: { level: 0, preFader: true },
}

export const DEFAULT_CHANNEL_SETTINGS: ChannelSettings = {
  inputGain: 0,
  eq: DEFAULT_EQ,
  gate: DEFAULT_GATE,
  compressor: DEFAULT_COMPRESSOR,
  ducking: DEFAULT_DUCKING,
  pan: 0,
  fader: 1.0,
  mute: false,
  solo: false,
  pfl: false,
  auxSends: DEFAULT_AUX_SENDS,
  busAssignment: ['PGM'],
}

export const DEFAULT_BUS_SETTINGS: BusSettings = {
  fader: 1.0,
  mute: false,
  limiterEnabled: true,
  limiterThreshold: -3,
}

const ALL_BUSES: BusType[] = ['PGM', 'TB', 'AUX1', 'AUX2', 'AUX3', 'AUX4']

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20)
}

function getRMSLevel(analyser: AnalyserNode): number {
  // Use fftSize for time-domain data (not frequencyBinCount which is fftSize/2)
  const dataArray = new Uint8Array(analyser.fftSize)
  // FIXED: Use getByteTimeDomainData for actual audio level, not getByteFrequencyData (FFT magnitudes)
  analyser.getByteTimeDomainData(dataArray)
  let sum = 0
  for (let i = 0; i < dataArray.length; i++) {
    // Convert from 0-255 (128 = silence) to -1 to 1
    const sample = (dataArray[i] - 128) / 128
    sum += sample * sample
  }
  const rms = Math.sqrt(sum / dataArray.length)
  return Math.min(rms, 1) // Already normalized to 0-1
}

// ============================================================================
// HOOK
// ============================================================================

export function useAudioEngine() {
  // Audio context
  const audioContextRef = useRef<AudioContext | null>(null)

  // Channel storage
  const channelsRef = useRef<Map<string, ChannelNodes>>(new Map())
  const channelSettingsRef = useRef<Map<string, ChannelSettings>>(new Map())

  // Bus storage
  const busesRef = useRef<Map<BusType, BusNodes>>(new Map())
  const busSettingsRef = useRef<Map<BusType, BusSettings>>(new Map())

  // Solo state tracking
  const [soloActive, setSoloActive] = useState(false)

  // Level metering
  const [channelLevels, setChannelLevels] = useState<Map<string, ChannelLevels>>(new Map())
  const [busLevels, setBusLevels] = useState<Map<BusType, BusLevels>>(new Map())
  const animationFrameRef = useRef<number>()
  const lastMeterUpdateRef = useRef<number>(0)
  const prevVoiceDetectedRef = useRef<boolean>(false)
  const METER_UPDATE_INTERVAL_MS = 50 // Throttle meter updates to ~20fps instead of 60fps

  // Ducking state
  const [voiceDetected, setVoiceDetected] = useState(false)
  const duckingCurrentRef = useRef<Map<string, number>>(new Map()) // Current gain per channel

  // Gate state
  const gateStateRef = useRef<Map<string, {
    isOpen: boolean
    currentGain: number
    holdTimeRemaining: number // ms remaining in hold phase
    lastUpdateTime: number // for calculating elapsed time
  }>>(new Map())

  // Process ducking - called in the animation frame loop
  const processDucking = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return

    // Check for voice activity on voice channels
    let maxVoiceLevel = 0
    let voiceThreshold = 0.1

    channelsRef.current.forEach((nodes, channelId) => {
      const settings = channelSettingsRef.current.get(channelId)
      if (settings?.ducking.sourceType === 'voice' && !settings.mute) {
        const level = getRMSLevel(nodes.inputAnalyser)
        if (level > maxVoiceLevel) {
          maxVoiceLevel = level
          voiceThreshold = settings.ducking.threshold
        }
      }
    })

    const isVoiceActive = maxVoiceLevel > voiceThreshold
    // Only update state if changed to prevent render loops
    if (isVoiceActive !== prevVoiceDetectedRef.current) {
      prevVoiceDetectedRef.current = isVoiceActive
      setVoiceDetected(isVoiceActive)
    }

    // Apply ducking to music and SFX channels
    channelsRef.current.forEach((nodes, channelId) => {
      const settings = channelSettingsRef.current.get(channelId)
      if (!settings) return

      const { ducking } = settings
      if (!ducking.enabled || ducking.sourceType === 'voice' || ducking.sourceType === 'none') {
        // Not a duckable channel - ensure gain is normal
        if (nodes.duckingGain.gain.value !== 1.0) {
          nodes.duckingGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.05)
        }
        return
      }

      // This is a music or SFX channel - apply ducking
      const targetGain = isVoiceActive ? dbToLinear(ducking.amount) : 1.0
      const currentGain = duckingCurrentRef.current.get(channelId) ?? 1.0

      // Apply attack or release time
      const timeConstant = isVoiceActive
        ? ducking.attack / 1000 // Attack (voice detected)
        : ducking.release / 1000 // Release (voice stopped)

      // Only update if significantly different
      if (Math.abs(targetGain - currentGain) > 0.01) {
        nodes.duckingGain.gain.setTargetAtTime(targetGain, ctx.currentTime, timeConstant)
        duckingCurrentRef.current.set(channelId, targetGain)
      }
    })
  }, [])

  // Process noise gates - called in the animation frame loop
  const processGates = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx) return

    const now = performance.now()

    channelsRef.current.forEach((nodes, channelId) => {
      const settings = channelSettingsRef.current.get(channelId)
      if (!settings) return

      const { gate } = settings

      // If gate is disabled, ensure gain is at unity
      if (!gate.enabled) {
        if (nodes.gateGain.gain.value !== 1.0) {
          nodes.gateGain.gain.setTargetAtTime(1.0, ctx.currentTime, 0.01)
        }
        return
      }

      // Get or initialize gate state for this channel
      let state = gateStateRef.current.get(channelId)
      if (!state) {
        state = {
          isOpen: true,
          currentGain: 1.0,
          holdTimeRemaining: 0,
          lastUpdateTime: now,
        }
        gateStateRef.current.set(channelId, state)
      }

      // Calculate elapsed time since last update
      const elapsed = now - state.lastUpdateTime
      state.lastUpdateTime = now

      // Get input level from gateAnalyser (measures signal BEFORE the gate)
      const inputLevel = getRMSLevel(nodes.gateAnalyser)

      // Convert threshold from dB to linear (0-1 scale)
      // RMS level of 0.1 ≈ -20dB, 0.01 ≈ -40dB, 0.001 ≈ -60dB
      const thresholdLinear = dbToLinear(gate.threshold)

      // Gate logic
      if (inputLevel > thresholdLinear) {
        // Signal above threshold - open the gate
        if (!state.isOpen) {
          state.isOpen = true
        }
        // Reset hold time when signal is above threshold
        state.holdTimeRemaining = gate.hold

        // Attack - open the gate
        const targetGain = 1.0
        if (Math.abs(state.currentGain - targetGain) > 0.01) {
          nodes.gateGain.gain.setTargetAtTime(targetGain, ctx.currentTime, gate.attack)
          state.currentGain = targetGain
        }
      } else {
        // Signal below threshold
        if (state.isOpen) {
          // Decrement hold time
          state.holdTimeRemaining -= elapsed

          if (state.holdTimeRemaining <= 0) {
            // Hold time expired - close the gate
            state.isOpen = false
            state.holdTimeRemaining = 0

            // Release - close the gate to the range level
            const targetGain = dbToLinear(gate.range)
            if (Math.abs(state.currentGain - targetGain) > 0.001) {
              nodes.gateGain.gain.setTargetAtTime(targetGain, ctx.currentTime, gate.release)
              state.currentGain = targetGain
            }
          }
        } else {
          // Gate already closed - keep it closed
          const targetGain = dbToLinear(gate.range)
          if (state.currentGain !== targetGain) {
            state.currentGain = targetGain
          }
        }
      }
    })
  }, [])

  // Initialize audio context and buses
  const initialize = useCallback(() => {
    if (audioContextRef.current) return audioContextRef.current

    const ctx = new AudioContext({ sampleRate: 48000 })
    audioContextRef.current = ctx

    // Resume if suspended - this needs user gesture to work
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log('[AudioEngine] AudioContext resumed successfully')
      }).catch((err) => {
        console.warn('[AudioEngine] Failed to resume AudioContext:', err)
      })
    }

    // Also add a click listener to resume on user interaction (browser requirement)
    const resumeOnInteraction = () => {
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          console.log('[AudioEngine] AudioContext resumed on user interaction')
          document.removeEventListener('click', resumeOnInteraction)
          document.removeEventListener('keydown', resumeOnInteraction)
        })
      }
    }
    document.addEventListener('click', resumeOnInteraction, { once: true })
    document.addEventListener('keydown', resumeOnInteraction, { once: true })

    // Create all buses
    ALL_BUSES.forEach(busType => {
      const busNodes = createBusNodes(ctx)
      busesRef.current.set(busType, busNodes)
      busSettingsRef.current.set(busType, { ...DEFAULT_BUS_SETTINGS })

      // Connect PGM bus to speakers by default
      if (busType === 'PGM') {
        busNodes.fader.connect(ctx.destination)
      }
    })

    // Start level metering
    startMetering()

    return ctx
  }, [])

  // Create bus nodes
  const createBusNodes = (ctx: AudioContext): BusNodes => {
    const input = ctx.createGain()
    input.gain.value = 1.0

    // Limiter (configured as a brick-wall limiter)
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.001
    limiter.release.value = 0.01

    const fader = ctx.createGain()
    fader.gain.value = 1.0

    // Stereo analysers
    const splitter = ctx.createChannelSplitter(2)
    const analyserL = ctx.createAnalyser()
    analyserL.fftSize = 256
    analyserL.smoothingTimeConstant = 0.8
    const analyserR = ctx.createAnalyser()
    analyserR.fftSize = 256
    analyserR.smoothingTimeConstant = 0.8

    // Destination for sending to server
    const destination = ctx.createMediaStreamDestination()

    // Silent keepalive generator - ensures bus always produces audio even when nothing is routed
    // This prevents encoder timeout issues when the bus has no active sources
    // Uses an inaudible 1Hz tone at -120dB (effectively silent but keeps audio stream active)
    const silenceOsc = ctx.createOscillator()
    silenceOsc.frequency.value = 1 // 1Hz - well below human hearing
    silenceOsc.type = 'sine'
    const silenceGain = ctx.createGain()
    silenceGain.gain.value = 0.000001 // -120dB - inaudible but keeps stream active
    silenceOsc.connect(silenceGain)
    silenceGain.connect(input)
    silenceOsc.start()

    // Connect: input → limiter → fader → splitter → analysers
    //                                  └→ destination
    input.connect(limiter)
    limiter.connect(fader)
    fader.connect(splitter)
    fader.connect(destination)

    splitter.connect(analyserL, 0)
    splitter.connect(analyserR, 1)

    return { input, limiter, fader, analyserL, analyserR, splitter, destination }
  }

  // Create channel processing nodes
  const createChannelNodes = (ctx: AudioContext): ChannelNodes => {
    // Input gain
    const inputGain = ctx.createGain()
    inputGain.gain.value = 1.0

    // HPF (highpass filter)
    const hpf = ctx.createBiquadFilter()
    hpf.type = 'highpass'
    hpf.frequency.value = 80
    hpf.Q.value = 0.707

    // Noise gate - controlled via gain node in animation loop
    // Web Audio doesn't have a native gate, so we implement it with a gain node
    // whose value is adjusted based on input level
    const gateGain = ctx.createGain()
    gateGain.gain.value = 1.0

    // Gate analyser - measures level BEFORE gate for threshold comparison
    const gateAnalyser = ctx.createAnalyser()
    gateAnalyser.fftSize = 256
    gateAnalyser.smoothingTimeConstant = 0.3 // Faster response for gate

    // 3-band EQ
    const eqLow = ctx.createBiquadFilter()
    eqLow.type = 'lowshelf'
    eqLow.frequency.value = 100
    eqLow.gain.value = 0

    const eqMid = ctx.createBiquadFilter()
    eqMid.type = 'peaking'
    eqMid.frequency.value = 1000
    eqMid.Q.value = 1.5
    eqMid.gain.value = 0

    const eqHigh = ctx.createBiquadFilter()
    eqHigh.type = 'highshelf'
    eqHigh.frequency.value = 8000
    eqHigh.gain.value = 0

    // Compressor
    const compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -20
    compressor.knee.value = 3
    compressor.ratio.value = 4
    compressor.attack.value = 0.01
    compressor.release.value = 0.1

    // Makeup gain
    const makeupGain = ctx.createGain()
    makeupGain.gain.value = 1.0

    // Ducking gain (controlled by voice detection on other channels)
    const duckingGain = ctx.createGain()
    duckingGain.gain.value = 1.0

    // Panner
    const panner = ctx.createStereoPanner()
    panner.pan.value = 0

    // Channel fader
    const fader = ctx.createGain()
    fader.gain.value = 1.0

    // Analysers for metering
    const inputAnalyser = ctx.createAnalyser()
    inputAnalyser.fftSize = 256
    inputAnalyser.smoothingTimeConstant = 0.8

    const outputAnalyser = ctx.createAnalyser()
    outputAnalyser.fftSize = 256
    outputAnalyser.smoothingTimeConstant = 0.8

    // Aux send nodes
    const auxSendsPre = new Map<BusType, GainNode>()
    const auxSendsPost = new Map<BusType, GainNode>()

    ALL_BUSES.forEach(busType => {
      const preSend = ctx.createGain()
      preSend.gain.value = 0
      auxSendsPre.set(busType, preSend)

      const postSend = ctx.createGain()
      postSend.gain.value = 0
      auxSendsPost.set(busType, postSend)
    })

    // Stereo handling
    const splitter = ctx.createChannelSplitter(2)
    const merger = ctx.createChannelMerger(2)

    // Connect the processing chain:
    // inputGain → hpf → gateAnalyser (tap) → gateGain → eqLow → eqMid → eqHigh → compressor → makeupGain → duckingGain → panner → fader
    //       ↓                                                                                                                       ↓
    //   inputAnalyser                                                                                                         outputAnalyser

    inputGain.connect(inputAnalyser)
    inputGain.connect(hpf)
    hpf.connect(gateAnalyser) // Tap for gate level detection
    hpf.connect(gateGain) // Gate gain control
    gateGain.connect(eqLow)
    eqLow.connect(eqMid)
    eqMid.connect(eqHigh)
    eqHigh.connect(compressor)
    compressor.connect(makeupGain)
    makeupGain.connect(duckingGain)  // Ducking inserted here
    duckingGain.connect(panner)

    // Pre-fader aux sends tap from makeupGain output (before ducking)
    auxSendsPre.forEach(send => {
      makeupGain.connect(send)
    })

    panner.connect(fader)
    fader.connect(outputAnalyser)

    // Post-fader aux sends tap from fader output
    auxSendsPost.forEach(send => {
      fader.connect(send)
    })

    return {
      source: null,
      inputGain,
      hpf,
      gateGain,
      eqLow,
      eqMid,
      eqHigh,
      compressor,
      makeupGain,
      duckingGain,
      panner,
      fader,
      inputAnalyser,
      outputAnalyser,
      gateAnalyser,
      auxSendsPre,
      auxSendsPost,
      splitter,
      merger,
    }
  }

  // Add a channel with a MediaStream
  const addChannel = useCallback((
    channelId: string,
    stream: MediaStream,
    initialSettings?: Partial<ChannelSettings>
  ) => {
    const ctx = initialize()
    if (!ctx) return

    // Check if channel already exists
    if (channelsRef.current.has(channelId)) {
      console.warn(`[AudioEngine] Channel ${channelId} already exists`)
      return
    }

    // Create nodes
    const nodes = createChannelNodes(ctx)

    // Create source from stream
    try {
      const source = ctx.createMediaStreamSource(stream)
      nodes.source = source
      source.connect(nodes.inputGain)
    } catch (err) {
      console.error(`[AudioEngine] Failed to create source for ${channelId}:`, err)
      return
    }

    // Store nodes
    channelsRef.current.set(channelId, nodes)

    // Initialize settings
    const settings: ChannelSettings = {
      ...DEFAULT_CHANNEL_SETTINGS,
      ...initialSettings,
    }
    channelSettingsRef.current.set(channelId, settings)

    // Apply initial settings
    applyChannelSettings(channelId, settings)

    // Connect to buses based on bus assignment
    connectChannelToBuses(channelId)

    console.log(`[AudioEngine] Added channel ${channelId}`)
  }, [initialize])

  // Remove a channel
  const removeChannel = useCallback((channelId: string) => {
    const nodes = channelsRef.current.get(channelId)
    if (!nodes) return

    // Disconnect all nodes
    if (nodes.source) nodes.source.disconnect()
    nodes.inputGain.disconnect()
    nodes.hpf.disconnect()
    nodes.gateGain.disconnect()
    nodes.gateAnalyser.disconnect()
    nodes.eqLow.disconnect()
    nodes.eqMid.disconnect()
    nodes.eqHigh.disconnect()
    nodes.compressor.disconnect()
    nodes.makeupGain.disconnect()
    nodes.duckingGain.disconnect()
    nodes.panner.disconnect()
    nodes.fader.disconnect()
    nodes.inputAnalyser.disconnect()
    nodes.outputAnalyser.disconnect()
    nodes.auxSendsPre.forEach(send => send.disconnect())
    nodes.auxSendsPost.forEach(send => send.disconnect())

    channelsRef.current.delete(channelId)
    channelSettingsRef.current.delete(channelId)

    // Update levels
    setChannelLevels(prev => {
      const next = new Map(prev)
      next.delete(channelId)
      return next
    })

    console.log(`[AudioEngine] Removed channel ${channelId}`)
  }, [])

  // Connect a channel to its assigned buses
  const connectChannelToBuses = useCallback((channelId: string) => {
    const nodes = channelsRef.current.get(channelId)
    const settings = channelSettingsRef.current.get(channelId)
    if (!nodes || !settings) return

    // Connect aux sends to bus inputs
    ALL_BUSES.forEach(busType => {
      const bus = busesRef.current.get(busType)
      if (!bus) return

      const auxSettings = settings.auxSends[busType]
      const sendNode = auxSettings.preFader
        ? nodes.auxSendsPre.get(busType)
        : nodes.auxSendsPost.get(busType)

      if (sendNode) {
        // Disconnect any existing connection
        try {
          sendNode.disconnect(bus.input)
        } catch {
          // Not connected, ignore
        }

        // Connect if routed
        if (settings.busAssignment.includes(busType) || auxSettings.level > 0) {
          sendNode.connect(bus.input)
        }
      }
    })

    // For main bus assignment, also connect the post-fader output
    settings.busAssignment.forEach(busType => {
      const bus = busesRef.current.get(busType)
      const postSend = nodes.auxSendsPost.get(busType)
      if (bus && postSend) {
        // Main bus assignment uses post-fader at unity (controlled by fader)
        // unless aux send has a different level
        const auxLevel = settings.auxSends[busType].level
        if (auxLevel === 0) {
          postSend.gain.value = 1.0
        }
        try {
          postSend.disconnect(bus.input)
        } catch {
          // ignore
        }
        postSend.connect(bus.input)
      }
    })
  }, [])

  // Apply channel settings to nodes
  const applyChannelSettings = useCallback((channelId: string, settings: ChannelSettings) => {
    const nodes = channelsRef.current.get(channelId)
    if (!nodes) return

    const ctx = audioContextRef.current
    if (!ctx) return

    // Input gain
    nodes.inputGain.gain.setTargetAtTime(
      dbToLinear(settings.inputGain),
      ctx.currentTime,
      0.01
    )

    // HPF
    if (settings.eq.hpfEnabled) {
      nodes.hpf.frequency.setTargetAtTime(settings.eq.hpfFreq, ctx.currentTime, 0.01)
      // HPF is always in the chain, but we can set freq to very low to effectively bypass
    } else {
      nodes.hpf.frequency.setTargetAtTime(10, ctx.currentTime, 0.01) // Below audible
    }

    // EQ
    nodes.eqLow.frequency.setTargetAtTime(settings.eq.lowFreq, ctx.currentTime, 0.01)
    nodes.eqLow.gain.setTargetAtTime(settings.eq.lowGain, ctx.currentTime, 0.01)

    nodes.eqMid.frequency.setTargetAtTime(settings.eq.midFreq, ctx.currentTime, 0.01)
    nodes.eqMid.Q.setTargetAtTime(settings.eq.midQ, ctx.currentTime, 0.01)
    nodes.eqMid.gain.setTargetAtTime(settings.eq.midGain, ctx.currentTime, 0.01)

    nodes.eqHigh.frequency.setTargetAtTime(settings.eq.highFreq, ctx.currentTime, 0.01)
    nodes.eqHigh.gain.setTargetAtTime(settings.eq.highGain, ctx.currentTime, 0.01)

    // Compressor
    if (settings.compressor.enabled) {
      nodes.compressor.threshold.setTargetAtTime(settings.compressor.threshold, ctx.currentTime, 0.01)
      nodes.compressor.ratio.setTargetAtTime(settings.compressor.ratio, ctx.currentTime, 0.01)
      nodes.compressor.attack.setTargetAtTime(settings.compressor.attack, ctx.currentTime, 0.01)
      nodes.compressor.release.setTargetAtTime(settings.compressor.release, ctx.currentTime, 0.01)
      nodes.makeupGain.gain.setTargetAtTime(dbToLinear(settings.compressor.makeupGain), ctx.currentTime, 0.01)
    } else {
      // Bypass compressor by setting threshold very high
      nodes.compressor.threshold.setTargetAtTime(0, ctx.currentTime, 0.01)
      nodes.compressor.ratio.setTargetAtTime(1, ctx.currentTime, 0.01)
      nodes.makeupGain.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
    }

    // Pan
    nodes.panner.pan.setTargetAtTime(settings.pan, ctx.currentTime, 0.01)

    // Fader with mute/solo handling
    let effectiveFader = settings.fader
    if (settings.mute) {
      effectiveFader = 0
    }
    // Solo handling is done globally - if any channel is solo'd, mute non-solo'd channels
    // This is handled in updateSoloState

    nodes.fader.gain.setTargetAtTime(effectiveFader, ctx.currentTime, 0.01)

    // Aux sends
    ALL_BUSES.forEach(busType => {
      const auxSettings = settings.auxSends[busType]
      const preSend = nodes.auxSendsPre.get(busType)
      const postSend = nodes.auxSendsPost.get(busType)

      if (auxSettings.preFader && preSend) {
        preSend.gain.setTargetAtTime(auxSettings.level, ctx.currentTime, 0.01)
        if (postSend) postSend.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
      } else if (postSend) {
        // For main bus assignment, use unity if no aux level set
        const level = settings.busAssignment.includes(busType) && auxSettings.level === 0
          ? 1.0
          : auxSettings.level
        postSend.gain.setTargetAtTime(level, ctx.currentTime, 0.01)
        if (preSend) preSend.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
      }
    })
  }, [])

  // Update channel settings
  const updateChannel = useCallback((channelId: string, updates: Partial<ChannelSettings>) => {
    const settings = channelSettingsRef.current.get(channelId)
    if (!settings) return

    const newSettings: ChannelSettings = {
      ...settings,
      ...updates,
      eq: { ...settings.eq, ...(updates.eq || {}) },
      gate: { ...settings.gate, ...(updates.gate || {}) },
      compressor: { ...settings.compressor, ...(updates.compressor || {}) },
      ducking: { ...settings.ducking, ...(updates.ducking || {}) },
      auxSends: { ...settings.auxSends, ...(updates.auxSends || {}) },
    }

    channelSettingsRef.current.set(channelId, newSettings)
    applyChannelSettings(channelId, newSettings)

    // Check if bus assignment changed
    if (updates.busAssignment) {
      connectChannelToBuses(channelId)
    }

    // Check solo state
    if (updates.solo !== undefined) {
      updateSoloState()
    }
  }, [applyChannelSettings, connectChannelToBuses])

  // Update solo state globally
  const updateSoloState = useCallback(() => {
    const anySolo = Array.from(channelSettingsRef.current.values()).some(s => s.solo)
    setSoloActive(anySolo)

    const ctx = audioContextRef.current
    if (!ctx) return

    // If any channel is solo'd, mute all non-solo'd channels
    channelsRef.current.forEach((nodes, channelId) => {
      const settings = channelSettingsRef.current.get(channelId)
      if (!settings) return

      let effectiveFader = settings.fader
      if (settings.mute || (anySolo && !settings.solo)) {
        effectiveFader = 0
      }

      nodes.fader.gain.setTargetAtTime(effectiveFader, ctx.currentTime, 0.01)
    })
  }, [])

  // Apply bus settings
  const applyBusSettings = useCallback((busType: BusType, settings: BusSettings) => {
    const bus = busesRef.current.get(busType)
    const ctx = audioContextRef.current
    if (!bus || !ctx) return

    // Limiter
    if (settings.limiterEnabled) {
      bus.limiter.threshold.setTargetAtTime(settings.limiterThreshold, ctx.currentTime, 0.01)
      bus.limiter.ratio.setTargetAtTime(20, ctx.currentTime, 0.01)
    } else {
      bus.limiter.threshold.setTargetAtTime(0, ctx.currentTime, 0.01)
      bus.limiter.ratio.setTargetAtTime(1, ctx.currentTime, 0.01)
    }

    // Fader
    const effectiveFader = settings.mute ? 0 : settings.fader
    bus.fader.gain.setTargetAtTime(effectiveFader, ctx.currentTime, 0.01)
  }, [])

  // Update bus settings
  const updateBus = useCallback((busType: BusType, updates: Partial<BusSettings>) => {
    const settings = busSettingsRef.current.get(busType)
    if (!settings) return

    const newSettings: BusSettings = { ...settings, ...updates }
    busSettingsRef.current.set(busType, newSettings)
    applyBusSettings(busType, newSettings)
  }, [applyBusSettings])

  // Get MediaStream for a bus (for sending to server)
  const getBusOutputStream = useCallback((busType: BusType): MediaStream | null => {
    const bus = busesRef.current.get(busType)
    return bus?.destination.stream || null
  }, [])

  // Connect a bus to speakers
  const connectBusToSpeakers = useCallback((busType: BusType, connect: boolean) => {
    const bus = busesRef.current.get(busType)
    const ctx = audioContextRef.current
    if (!bus || !ctx) return

    if (connect) {
      bus.fader.connect(ctx.destination)
    } else {
      try {
        bus.fader.disconnect(ctx.destination)
      } catch {
        // Not connected
      }
    }
  }, [])

  // Level metering loop - throttled to prevent render storms
  const startMetering = useCallback(() => {
    const updateLevels = () => {
      const now = performance.now()
      const elapsed = now - lastMeterUpdateRef.current

      // Process ducking and gates every frame (doesn't cause re-renders unless state changes)
      processDucking()
      processGates()

      // Throttle meter state updates to reduce re-renders
      if (elapsed >= METER_UPDATE_INTERVAL_MS) {
        lastMeterUpdateRef.current = now

        // Channel levels
        const newChannelLevels = new Map<string, ChannelLevels>()
        channelsRef.current.forEach((nodes, channelId) => {
          const inputLevel = getRMSLevel(nodes.inputAnalyser)
          const outputLevel = getRMSLevel(nodes.outputAnalyser)

          // Gain reduction from compressor (approximation)
          // Web Audio doesn't expose GR directly, so we estimate based on input vs output
          const gainReduction = Math.max(0, (inputLevel - outputLevel) * 20)

          newChannelLevels.set(channelId, { input: inputLevel, output: outputLevel, gainReduction })
        })
        setChannelLevels(newChannelLevels)

        // Bus levels
        const newBusLevels = new Map<BusType, BusLevels>()
        busesRef.current.forEach((bus, busType) => {
          const left = getRMSLevel(bus.analyserL)
          const right = getRMSLevel(bus.analyserR)
          newBusLevels.set(busType, { left, right })
        })
        setBusLevels(newBusLevels)
      }

      animationFrameRef.current = requestAnimationFrame(updateLevels)
    }

    updateLevels()
  }, [processDucking, processGates])

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      // Disconnect all channels
      channelsRef.current.forEach((nodes) => {
        if (nodes.source) nodes.source.disconnect()
        nodes.inputGain.disconnect()
      })
      channelsRef.current.clear()

      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
    }
  }, [])

  // Get all channel settings (for persistence/UI)
  const getAllChannelSettings = useCallback((): Map<string, ChannelSettings> => {
    return new Map(channelSettingsRef.current)
  }, [])

  // Get all bus settings
  const getAllBusSettings = useCallback((): Map<BusType, BusSettings> => {
    return new Map(busSettingsRef.current)
  }, [])

  // Get channel IDs
  const getChannelIds = useCallback((): string[] => {
    return Array.from(channelsRef.current.keys())
  }, [])

  // Check if audio engine is initialized
  const isInitialized = useCallback((): boolean => {
    return !!audioContextRef.current
  }, [])

  // Check if audio context is running (not suspended)
  const isRunning = useCallback((): boolean => {
    return audioContextRef.current?.state === 'running'
  }, [])

  // Get audio context (for advanced use cases)
  const getAudioContext = useCallback((): AudioContext | null => {
    return audioContextRef.current
  }, [])

  // Get bus analysers for R128 loudness metering
  const getBusAnalysers = useCallback((busType: BusType): AnalyserNode[] | null => {
    const bus = busesRef.current.get(busType)
    if (!bus) return null
    return [bus.analyserL, bus.analyserR]
  }, [])

  return {
    // Initialization
    initialize,
    isInitialized,
    isRunning,
    getAudioContext,

    // Channel management
    addChannel,
    removeChannel,
    updateChannel,
    getChannelIds,
    getAllChannelSettings,

    // Bus management
    updateBus,
    getAllBusSettings,
    getBusOutputStream,
    connectBusToSpeakers,
    getBusAnalysers,

    // State
    soloActive,
    channelLevels,
    busLevels,
    voiceDetected, // For ducking indicator in UI

    // Constants
    ALL_BUSES,
    DUCKING_PRESETS,
  }
}

export default useAudioEngine
