import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * Audio codec configuration options
 */
export interface CodecConfig {
  // Codec selection
  codec: AudioCodec
  // Bitrate in kbps
  bitrate: number
  // Sample rate in Hz
  sampleRate: number
  // Channels (1 = mono, 2 = stereo)
  channels: 1 | 2
  // Enable DTX (Discontinuous Transmission) - saves bandwidth when silent
  dtxEnabled: boolean
  // Enable FEC (Forward Error Correction) - helps with packet loss
  fecEnabled: boolean
  // Packet loss percentage to tune FEC (0-100)
  packetLossPercentage: number
  // Enable CBR (Constant Bit Rate) vs VBR (Variable Bit Rate)
  cbrEnabled: boolean
  // Complexity (0-10, higher = better quality but more CPU)
  complexity: number
  // Frame size in ms (2.5, 5, 10, 20, 40, 60)
  frameSize: number
}

export type AudioCodec = 'opus' | 'pcma' | 'pcmu' | 'g722'

export interface CodecInfo {
  name: string
  description: string
  supportsVbr: boolean
  supportsFec: boolean
  supportsDtx: boolean
  supportsStereo: boolean
  minBitrate: number
  maxBitrate: number
  defaultBitrate: number
  sampleRates: number[]
  defaultSampleRate: number
}

export const CODEC_INFO: Record<AudioCodec, CodecInfo> = {
  opus: {
    name: 'Opus',
    description: 'Modern codec with excellent quality and low latency. Best for broadcast.',
    supportsVbr: true,
    supportsFec: true,
    supportsDtx: true,
    supportsStereo: true,
    minBitrate: 6,
    maxBitrate: 510,
    defaultBitrate: 128,
    sampleRates: [8000, 12000, 16000, 24000, 48000],
    defaultSampleRate: 48000,
  },
  pcma: {
    name: 'G.711 A-law',
    description: 'Legacy codec, widely compatible. Used in telephony.',
    supportsVbr: false,
    supportsFec: false,
    supportsDtx: false,
    supportsStereo: false,
    minBitrate: 64,
    maxBitrate: 64,
    defaultBitrate: 64,
    sampleRates: [8000],
    defaultSampleRate: 8000,
  },
  pcmu: {
    name: 'G.711 μ-law',
    description: 'Legacy codec, widely compatible. Used in North American telephony.',
    supportsVbr: false,
    supportsFec: false,
    supportsDtx: false,
    supportsStereo: false,
    minBitrate: 64,
    maxBitrate: 64,
    defaultBitrate: 64,
    sampleRates: [8000],
    defaultSampleRate: 8000,
  },
  g722: {
    name: 'G.722',
    description: 'Wideband codec for telephony. Better quality than G.711.',
    supportsVbr: false,
    supportsFec: false,
    supportsDtx: false,
    supportsStereo: false,
    minBitrate: 48,
    maxBitrate: 64,
    defaultBitrate: 64,
    sampleRates: [16000],
    defaultSampleRate: 16000,
  },
}

export const DEFAULT_CODEC_CONFIG: CodecConfig = {
  codec: 'opus',
  bitrate: 128,
  sampleRate: 48000,
  channels: 2,
  dtxEnabled: false, // Keep transmitting even in silence for broadcast
  fecEnabled: true, // Helps with packet loss
  packetLossPercentage: 5,
  cbrEnabled: false, // VBR is generally better for Opus
  complexity: 10, // Max quality
  frameSize: 20, // 20ms is a good balance
}

// Preset configurations
export const CODEC_PRESETS: Record<string, Partial<CodecConfig>> = {
  'Broadcast - High Quality': {
    codec: 'opus',
    bitrate: 128,
    sampleRate: 48000,
    channels: 2,
    dtxEnabled: false,
    fecEnabled: true,
    packetLossPercentage: 5,
    cbrEnabled: false,
    complexity: 10,
    frameSize: 20,
  },
  'Broadcast - Standard': {
    codec: 'opus',
    bitrate: 64,
    sampleRate: 48000,
    channels: 2,
    dtxEnabled: false,
    fecEnabled: true,
    packetLossPercentage: 10,
    cbrEnabled: false,
    complexity: 8,
    frameSize: 20,
  },
  'Voice - Low Latency': {
    codec: 'opus',
    bitrate: 32,
    sampleRate: 24000,
    channels: 1,
    dtxEnabled: true,
    fecEnabled: true,
    packetLossPercentage: 15,
    cbrEnabled: false,
    complexity: 5,
    frameSize: 10,
  },
  'Voice - Minimum Bandwidth': {
    codec: 'opus',
    bitrate: 16,
    sampleRate: 16000,
    channels: 1,
    dtxEnabled: true,
    fecEnabled: true,
    packetLossPercentage: 20,
    cbrEnabled: false,
    complexity: 3,
    frameSize: 40,
  },
  'Legacy - G.711': {
    codec: 'pcmu',
    bitrate: 64,
    sampleRate: 8000,
    channels: 1,
    dtxEnabled: false,
    fecEnabled: false,
    packetLossPercentage: 0,
    cbrEnabled: true,
    complexity: 0,
    frameSize: 20,
  },
}

interface UseCodecConfigOptions {
  initialConfig?: Partial<CodecConfig>
  onConfigChange?: (config: CodecConfig) => void
}

interface UseCodecConfigReturn {
  config: CodecConfig
  updateConfig: (updates: Partial<CodecConfig>) => void
  applyPreset: (presetName: string) => void
  resetToDefault: () => void
  getCodecInfo: (codec: AudioCodec) => CodecInfo
  estimateBandwidth: () => number
  validateConfig: () => { valid: boolean; errors: string[] }
}

/**
 * Hook for managing codec configuration
 */
export function useCodecConfig({
  initialConfig,
  onConfigChange,
}: UseCodecConfigOptions = {}): UseCodecConfigReturn {
  const [config, setConfig] = useState<CodecConfig>({
    ...DEFAULT_CODEC_CONFIG,
    ...initialConfig,
  })

  const onConfigChangeRef = useRef(onConfigChange)
  onConfigChangeRef.current = onConfigChange

  // Notify on config change
  useEffect(() => {
    onConfigChangeRef.current?.(config)
  }, [config])

  const updateConfig = useCallback((updates: Partial<CodecConfig>) => {
    setConfig((prev) => {
      const newConfig = { ...prev, ...updates }

      // Auto-adjust settings based on codec capabilities
      const codecInfo = CODEC_INFO[newConfig.codec]

      // Clamp bitrate to codec limits
      if (newConfig.bitrate < codecInfo.minBitrate) {
        newConfig.bitrate = codecInfo.minBitrate
      }
      if (newConfig.bitrate > codecInfo.maxBitrate) {
        newConfig.bitrate = codecInfo.maxBitrate
      }

      // Disable unsupported features
      if (!codecInfo.supportsFec) {
        newConfig.fecEnabled = false
      }
      if (!codecInfo.supportsDtx) {
        newConfig.dtxEnabled = false
      }
      if (!codecInfo.supportsVbr) {
        newConfig.cbrEnabled = true
      }
      if (!codecInfo.supportsStereo) {
        newConfig.channels = 1
      }

      // Adjust sample rate if not supported
      if (!codecInfo.sampleRates.includes(newConfig.sampleRate)) {
        newConfig.sampleRate = codecInfo.defaultSampleRate
      }

      return newConfig
    })
  }, [])

  const applyPreset = useCallback((presetName: string) => {
    const preset = CODEC_PRESETS[presetName]
    if (preset) {
      setConfig((prev) => ({ ...prev, ...preset }))
    }
  }, [])

  const resetToDefault = useCallback(() => {
    setConfig(DEFAULT_CODEC_CONFIG)
  }, [])

  const getCodecInfo = useCallback((codec: AudioCodec): CodecInfo => {
    return CODEC_INFO[codec]
  }, [])

  const estimateBandwidth = useCallback((): number => {
    // Estimate total bandwidth in kbps including overhead
    let bandwidth = config.bitrate

    // Add RTP/UDP/IP overhead (approximately 40 bytes per packet)
    // Assuming 20ms frames at 48kHz
    const packetsPerSecond = 1000 / config.frameSize
    const overheadBitsPerSecond = packetsPerSecond * 40 * 8

    bandwidth += overheadBitsPerSecond / 1000

    // FEC adds approximately 50% overhead when enabled
    if (config.fecEnabled) {
      bandwidth *= 1.5
    }

    return Math.round(bandwidth)
  }, [config])

  const validateConfig = useCallback((): { valid: boolean; errors: string[] } => {
    const errors: string[] = []
    const codecInfo = CODEC_INFO[config.codec]

    if (config.bitrate < codecInfo.minBitrate) {
      errors.push(`Bitrate too low for ${codecInfo.name}. Minimum: ${codecInfo.minBitrate} kbps`)
    }
    if (config.bitrate > codecInfo.maxBitrate) {
      errors.push(`Bitrate too high for ${codecInfo.name}. Maximum: ${codecInfo.maxBitrate} kbps`)
    }
    if (!codecInfo.sampleRates.includes(config.sampleRate)) {
      errors.push(`Sample rate ${config.sampleRate} not supported by ${codecInfo.name}`)
    }
    if (config.channels === 2 && !codecInfo.supportsStereo) {
      errors.push(`${codecInfo.name} does not support stereo`)
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }, [config])

  return {
    config,
    updateConfig,
    applyPreset,
    resetToDefault,
    getCodecInfo,
    estimateBandwidth,
    validateConfig,
  }
}

/**
 * Generate SDP parameters for the codec configuration
 */
export function generateSdpParams(config: CodecConfig): Record<string, string | number> {
  const params: Record<string, string | number> = {}

  if (config.codec === 'opus') {
    params['maxplaybackrate'] = config.sampleRate
    params['stereo'] = config.channels === 2 ? 1 : 0
    params['useinbandfec'] = config.fecEnabled ? 1 : 0
    params['usedtx'] = config.dtxEnabled ? 1 : 0
    params['maxaveragebitrate'] = config.bitrate * 1000
    params['cbr'] = config.cbrEnabled ? 1 : 0
    params['ptime'] = config.frameSize
  }

  return params
}
