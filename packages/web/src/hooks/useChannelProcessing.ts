import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Channel processing settings
 */
export interface ChannelProcessingSettings {
  // High-pass filter
  highPassEnabled: boolean
  highPassFrequency: number // Hz (20-1000)

  // EQ - 3-band parametric
  eqEnabled: boolean
  eqLowFrequency: number // Hz
  eqLowGain: number // dB (-15 to +15)
  eqMidFrequency: number // Hz
  eqMidGain: number // dB
  eqMidQ: number // 0.1 to 10
  eqHighFrequency: number // Hz
  eqHighGain: number // dB

  // Compressor
  compressorEnabled: boolean
  compressorThreshold: number // dB (-60 to 0)
  compressorRatio: number // 1:1 to 20:1
  compressorAttack: number // ms
  compressorRelease: number // ms
  compressorKnee: number // dB

  // Limiter
  limiterEnabled: boolean
  limiterThreshold: number // dB

  // Noise gate
  gateEnabled: boolean
  gateThreshold: number // dB
  gateAttack: number // ms
  gateRelease: number // ms

  // Output
  outputGain: number // dB (-20 to +20)
}

export const DEFAULT_PROCESSING: ChannelProcessingSettings = {
  highPassEnabled: true,
  highPassFrequency: 80,

  eqEnabled: false,
  eqLowFrequency: 100,
  eqLowGain: 0,
  eqMidFrequency: 1000,
  eqMidGain: 0,
  eqMidQ: 1,
  eqHighFrequency: 10000,
  eqHighGain: 0,

  compressorEnabled: false,
  compressorThreshold: -24,
  compressorRatio: 4,
  compressorAttack: 10,
  compressorRelease: 250,
  compressorKnee: 10,

  limiterEnabled: true,
  limiterThreshold: -1,

  gateEnabled: false,
  gateThreshold: -50,
  gateAttack: 5,
  gateRelease: 100,

  outputGain: 0,
}

interface UseChannelProcessingOptions {
  audioContext: AudioContext | null
  sourceNode: MediaStreamAudioSourceNode | AudioNode | null
  enabled?: boolean
  initialSettings?: Partial<ChannelProcessingSettings>
}

interface UseChannelProcessingReturn {
  outputNode: AudioNode | null
  settings: ChannelProcessingSettings
  updateSettings: (settings: Partial<ChannelProcessingSettings>) => void
  resetSettings: () => void
  bypass: boolean
  setBypass: (bypass: boolean) => void
  levels: {
    input: number
    output: number
    gainReduction: number
  }
}

/**
 * Hook for per-channel audio processing using Web Audio API
 */
export function useChannelProcessing({
  audioContext,
  sourceNode,
  enabled = true,
  initialSettings,
}: UseChannelProcessingOptions): UseChannelProcessingReturn {
  const [settings, setSettings] = useState<ChannelProcessingSettings>({
    ...DEFAULT_PROCESSING,
    ...initialSettings,
  })
  const [bypass, setBypass] = useState(false)
  const [levels, setLevels] = useState({ input: 0, output: 0, gainReduction: 0 })

  // Use refs for values that shouldn't trigger effect reruns
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const bypassRef = useRef(bypass)
  bypassRef.current = bypass

  // Node references
  const nodesRef = useRef<{
    // High-pass
    highPass: BiquadFilterNode | null
    // EQ
    eqLow: BiquadFilterNode | null
    eqMid: BiquadFilterNode | null
    eqHigh: BiquadFilterNode | null
    // Dynamics
    compressor: DynamicsCompressorNode | null
    // Limiter (using compressor with extreme ratio)
    limiter: DynamicsCompressorNode | null
    // Output
    outputGain: GainNode | null
    // Metering
    inputAnalyser: AnalyserNode | null
    outputAnalyser: AnalyserNode | null
    // Bypass switch
    bypassGain: GainNode | null
    processedGain: GainNode | null
  }>({
    highPass: null,
    eqLow: null,
    eqMid: null,
    eqHigh: null,
    compressor: null,
    limiter: null,
    outputGain: null,
    inputAnalyser: null,
    outputAnalyser: null,
    bypassGain: null,
    processedGain: null,
  })

  // Create audio processing chain
  useEffect(() => {
    if (!audioContext || !sourceNode || !enabled) return

    const nodes = nodesRef.current
    const currentSettings = settingsRef.current
    const currentBypass = bypassRef.current

    // Create nodes
    nodes.inputAnalyser = audioContext.createAnalyser()
    nodes.inputAnalyser.fftSize = 256

    nodes.highPass = audioContext.createBiquadFilter()
    nodes.highPass.type = 'highpass'
    nodes.highPass.frequency.value = currentSettings.highPassFrequency

    nodes.eqLow = audioContext.createBiquadFilter()
    nodes.eqLow.type = 'lowshelf'
    nodes.eqLow.frequency.value = currentSettings.eqLowFrequency
    nodes.eqLow.gain.value = currentSettings.eqEnabled ? currentSettings.eqLowGain : 0

    nodes.eqMid = audioContext.createBiquadFilter()
    nodes.eqMid.type = 'peaking'
    nodes.eqMid.frequency.value = currentSettings.eqMidFrequency
    nodes.eqMid.Q.value = currentSettings.eqMidQ
    nodes.eqMid.gain.value = currentSettings.eqEnabled ? currentSettings.eqMidGain : 0

    nodes.eqHigh = audioContext.createBiquadFilter()
    nodes.eqHigh.type = 'highshelf'
    nodes.eqHigh.frequency.value = currentSettings.eqHighFrequency
    nodes.eqHigh.gain.value = currentSettings.eqEnabled ? currentSettings.eqHighGain : 0

    nodes.compressor = audioContext.createDynamicsCompressor()
    nodes.compressor.threshold.value = currentSettings.compressorThreshold
    nodes.compressor.ratio.value = currentSettings.compressorRatio
    nodes.compressor.attack.value = currentSettings.compressorAttack / 1000 // Convert ms to s
    nodes.compressor.release.value = currentSettings.compressorRelease / 1000
    nodes.compressor.knee.value = currentSettings.compressorKnee

    // Limiter is a compressor with extreme settings
    nodes.limiter = audioContext.createDynamicsCompressor()
    nodes.limiter.threshold.value = currentSettings.limiterThreshold
    nodes.limiter.ratio.value = 20
    nodes.limiter.attack.value = 0.001
    nodes.limiter.release.value = 0.1
    nodes.limiter.knee.value = 0

    nodes.outputGain = audioContext.createGain()
    nodes.outputGain.gain.value = Math.pow(10, currentSettings.outputGain / 20)

    nodes.outputAnalyser = audioContext.createAnalyser()
    nodes.outputAnalyser.fftSize = 256

    // Bypass path
    nodes.bypassGain = audioContext.createGain()
    nodes.bypassGain.gain.value = currentBypass ? 1 : 0

    nodes.processedGain = audioContext.createGain()
    nodes.processedGain.gain.value = currentBypass ? 0 : 1

    // Connect the chain
    // Input metering
    sourceNode.connect(nodes.inputAnalyser)

    // Bypass path
    sourceNode.connect(nodes.bypassGain)

    // Processing path
    sourceNode.connect(nodes.highPass)
    nodes.highPass.connect(nodes.eqLow)
    nodes.eqLow.connect(nodes.eqMid)
    nodes.eqMid.connect(nodes.eqHigh)
    nodes.eqHigh.connect(nodes.compressor)
    nodes.compressor.connect(nodes.limiter)
    nodes.limiter.connect(nodes.outputGain)
    nodes.outputGain.connect(nodes.processedGain)

    // Merge bypass and processed
    nodes.bypassGain.connect(nodes.outputAnalyser)
    nodes.processedGain.connect(nodes.outputAnalyser)

    // Start metering
    const meterInterval = setInterval(() => {
      if (!nodes.inputAnalyser || !nodes.outputAnalyser || !nodes.compressor) return

      const inputData = new Float32Array(nodes.inputAnalyser.frequencyBinCount)
      const outputData = new Float32Array(nodes.outputAnalyser.frequencyBinCount)

      nodes.inputAnalyser.getFloatTimeDomainData(inputData)
      nodes.outputAnalyser.getFloatTimeDomainData(outputData)

      // Calculate RMS levels
      const inputLevel = calculateRMS(inputData)
      const outputLevel = calculateRMS(outputData)
      const gainReduction = nodes.compressor.reduction

      setLevels({
        input: inputLevel,
        output: outputLevel,
        gainReduction: Math.abs(gainReduction),
      })
    }, 50)

    return () => {
      clearInterval(meterInterval)

      // Disconnect all nodes
      try {
        sourceNode.disconnect()
        Object.values(nodes).forEach((node) => {
          if (node) {
            try {
              node.disconnect()
            } catch {
              // Ignore disconnection errors
            }
          }
        })
      } catch {
        // Ignore cleanup errors
      }

      // Clear references
      Object.keys(nodes).forEach((key) => {
        (nodes as Record<string, AudioNode | null>)[key] = null
      })
    }
  }, [audioContext, sourceNode, enabled])

  // Update node parameters when settings change
  useEffect(() => {
    const nodes = nodesRef.current
    if (!audioContext) return

    // High-pass
    if (nodes.highPass) {
      nodes.highPass.frequency.setValueAtTime(
        settings.highPassEnabled ? settings.highPassFrequency : 1,
        audioContext.currentTime
      )
    }

    // EQ
    if (nodes.eqLow) {
      nodes.eqLow.frequency.setValueAtTime(settings.eqLowFrequency, audioContext.currentTime)
      nodes.eqLow.gain.setValueAtTime(
        settings.eqEnabled ? settings.eqLowGain : 0,
        audioContext.currentTime
      )
    }
    if (nodes.eqMid) {
      nodes.eqMid.frequency.setValueAtTime(settings.eqMidFrequency, audioContext.currentTime)
      nodes.eqMid.Q.setValueAtTime(settings.eqMidQ, audioContext.currentTime)
      nodes.eqMid.gain.setValueAtTime(
        settings.eqEnabled ? settings.eqMidGain : 0,
        audioContext.currentTime
      )
    }
    if (nodes.eqHigh) {
      nodes.eqHigh.frequency.setValueAtTime(settings.eqHighFrequency, audioContext.currentTime)
      nodes.eqHigh.gain.setValueAtTime(
        settings.eqEnabled ? settings.eqHighGain : 0,
        audioContext.currentTime
      )
    }

    // Compressor
    if (nodes.compressor) {
      const comp = nodes.compressor
      if (settings.compressorEnabled) {
        comp.threshold.setValueAtTime(settings.compressorThreshold, audioContext.currentTime)
        comp.ratio.setValueAtTime(settings.compressorRatio, audioContext.currentTime)
        comp.attack.setValueAtTime(settings.compressorAttack / 1000, audioContext.currentTime)
        comp.release.setValueAtTime(settings.compressorRelease / 1000, audioContext.currentTime)
        comp.knee.setValueAtTime(settings.compressorKnee, audioContext.currentTime)
      } else {
        // Bypass compressor
        comp.threshold.setValueAtTime(0, audioContext.currentTime)
        comp.ratio.setValueAtTime(1, audioContext.currentTime)
      }
    }

    // Limiter
    if (nodes.limiter) {
      if (settings.limiterEnabled) {
        nodes.limiter.threshold.setValueAtTime(settings.limiterThreshold, audioContext.currentTime)
        nodes.limiter.ratio.setValueAtTime(20, audioContext.currentTime)
      } else {
        nodes.limiter.threshold.setValueAtTime(0, audioContext.currentTime)
        nodes.limiter.ratio.setValueAtTime(1, audioContext.currentTime)
      }
    }

    // Output gain
    if (nodes.outputGain) {
      const linearGain = Math.pow(10, settings.outputGain / 20)
      nodes.outputGain.gain.setTargetAtTime(linearGain, audioContext.currentTime, 0.01)
    }
  }, [audioContext, settings])

  // Update bypass
  useEffect(() => {
    const nodes = nodesRef.current
    if (!audioContext) return

    if (nodes.bypassGain && nodes.processedGain) {
      nodes.bypassGain.gain.setTargetAtTime(bypass ? 1 : 0, audioContext.currentTime, 0.01)
      nodes.processedGain.gain.setTargetAtTime(bypass ? 0 : 1, audioContext.currentTime, 0.01)
    }
  }, [audioContext, bypass])

  const updateSettings = useCallback((newSettings: Partial<ChannelProcessingSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_PROCESSING)
  }, [])

  return {
    outputNode: nodesRef.current.outputAnalyser,
    settings,
    updateSettings,
    resetSettings,
    bypass,
    setBypass,
    levels,
  }
}

/**
 * Calculate RMS level from audio data
 */
function calculateRMS(data: Float32Array): number {
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i]
  }
  const rms = Math.sqrt(sum / data.length)
  // Convert to dB
  return 20 * Math.log10(Math.max(rms, 0.00001))
}
