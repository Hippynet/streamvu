import { useEffect, useRef, useState } from 'react'

interface LoudnessMeterProps {
  analyserNode: AnalyserNode | null
  targetLUFS?: number // Target loudness level (e.g., -14 for streaming)
  showPeakHold?: boolean
  orientation?: 'horizontal' | 'vertical'
  size?: 'sm' | 'md' | 'lg'
}

interface LoudnessState {
  momentary: number // Short-term LUFS (400ms)
  shortTerm: number // Short-term LUFS (3s)
  integrated: number // Integrated LUFS (entire session)
  peak: number // True peak in dBFS
  range: number // Loudness range
}

/**
 * Simplified loudness meter using RMS approximation
 * Note: For true ITU-R BS.1770 LUFS, a full implementation with
 * K-weighting and gating would be needed
 */
export function LoudnessMeter({
  analyserNode,
  targetLUFS = -14,
  showPeakHold = true,
  orientation = 'vertical',
  size = 'md',
}: LoudnessMeterProps) {
  const [loudness, setLoudness] = useState<LoudnessState>({
    momentary: -Infinity,
    shortTerm: -Infinity,
    integrated: -Infinity,
    peak: -Infinity,
    range: 0,
  })
  const [peakHold, setPeakHold] = useState(-Infinity)

  const integratedBufferRef = useRef<number[]>([])
  const shortTermBufferRef = useRef<number[]>([])
  const peakHoldTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!analyserNode) return

    const dataArray = new Float32Array(analyserNode.frequencyBinCount)

    const updateMeter = () => {
      analyserNode.getFloatTimeDomainData(dataArray)

      // Calculate RMS (approximate momentary loudness)
      let sum = 0
      let maxSample = 0
      for (let i = 0; i < dataArray.length; i++) {
        const sample = Math.abs(dataArray[i])
        sum += sample * sample
        if (sample > maxSample) maxSample = sample
      }
      const rms = Math.sqrt(sum / dataArray.length)

      // Convert to dB (approximate LUFS - real LUFS needs K-weighting)
      const momentary = 20 * Math.log10(Math.max(rms, 0.00001))
      const peak = 20 * Math.log10(Math.max(maxSample, 0.00001))

      // Update short-term buffer (last 3 seconds at ~20fps = 60 samples)
      shortTermBufferRef.current.push(rms)
      if (shortTermBufferRef.current.length > 60) {
        shortTermBufferRef.current.shift()
      }

      // Calculate short-term average
      const shortTermRms =
        shortTermBufferRef.current.length > 0
          ? shortTermBufferRef.current.reduce((a, b) => a + b, 0) /
            shortTermBufferRef.current.length
          : 0
      const shortTerm = 20 * Math.log10(Math.max(shortTermRms, 0.00001))

      // Update integrated buffer (keep all samples for session average)
      integratedBufferRef.current.push(rms)
      // Limit to last 10 minutes of data to prevent memory issues
      if (integratedBufferRef.current.length > 12000) {
        integratedBufferRef.current.shift()
      }

      // Calculate integrated average
      const integratedRms =
        integratedBufferRef.current.length > 0
          ? integratedBufferRef.current.reduce((a, b) => a + b, 0) /
            integratedBufferRef.current.length
          : 0
      const integrated = 20 * Math.log10(Math.max(integratedRms, 0.00001))

      // Calculate loudness range (simplified)
      const sortedSamples = [...integratedBufferRef.current].sort((a, b) => a - b)
      const low = sortedSamples[Math.floor(sortedSamples.length * 0.1)] || 0
      const high = sortedSamples[Math.floor(sortedSamples.length * 0.9)] || 0
      const range =
        high > 0 && low > 0 ? 20 * Math.log10(high) - 20 * Math.log10(Math.max(low, 0.00001)) : 0

      setLoudness({
        momentary,
        shortTerm,
        integrated,
        peak,
        range: Math.max(0, range),
      })

      // Update peak hold
      if (peak > peakHold) {
        setPeakHold(peak)
        if (peakHoldTimeoutRef.current) {
          clearTimeout(peakHoldTimeoutRef.current)
        }
        peakHoldTimeoutRef.current = setTimeout(() => {
          setPeakHold(-Infinity)
        }, 2000)
      }
    }

    const interval = setInterval(updateMeter, 50) // 20fps

    return () => {
      clearInterval(interval)
      if (peakHoldTimeoutRef.current) {
        clearTimeout(peakHoldTimeoutRef.current)
      }
    }
  }, [analyserNode, peakHold])

  // Reset integrated on unmount
  useEffect(() => {
    return () => {
      integratedBufferRef.current = []
      shortTermBufferRef.current = []
    }
  }, [])

  const resetIntegrated = () => {
    integratedBufferRef.current = []
    shortTermBufferRef.current = []
    setLoudness((prev) => ({
      ...prev,
      integrated: -Infinity,
      range: 0,
    }))
  }

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  const meterHeight = {
    sm: 'h-20',
    md: 'h-32',
    lg: 'h-48',
  }

  if (orientation === 'horizontal') {
    return (
      <HorizontalLoudnessMeter
        loudness={loudness}
        peakHold={peakHold}
        targetLUFS={targetLUFS}
        showPeakHold={showPeakHold}
        onReset={resetIntegrated}
        size={size}
      />
    )
  }

  return (
    <div className={`flex flex-col gap-2 rounded-lg border border-gray-700 bg-gray-800 p-3 ${sizeClasses[size]}`}>
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-300">Loudness</span>
        <button
          onClick={resetIntegrated}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Reset
        </button>
      </div>

      <div className="flex gap-3">
        {/* Momentary Meter */}
        <div className="flex flex-col items-center gap-1">
          <div className={`relative w-4 overflow-hidden rounded-sm bg-gray-900 ${meterHeight[size]}`}>
            <LoudnessBar level={loudness.momentary} targetLUFS={targetLUFS} />
            {showPeakHold && peakHold > -60 && (
              <div
                className="absolute left-0 right-0 h-0.5 bg-white"
                style={{ bottom: `${levelToPercent(peakHold)}%` }}
              />
            )}
            {/* Target line */}
            <div
              className="absolute left-0 right-0 h-0.5 bg-primary-500 opacity-50"
              style={{ bottom: `${levelToPercent(targetLUFS)}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">M</span>
        </div>

        {/* Short-term Meter */}
        <div className="flex flex-col items-center gap-1">
          <div className={`relative w-4 overflow-hidden rounded-sm bg-gray-900 ${meterHeight[size]}`}>
            <LoudnessBar level={loudness.shortTerm} targetLUFS={targetLUFS} />
            <div
              className="absolute left-0 right-0 h-0.5 bg-primary-500 opacity-50"
              style={{ bottom: `${levelToPercent(targetLUFS)}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">S</span>
        </div>

        {/* Integrated Meter */}
        <div className="flex flex-col items-center gap-1">
          <div className={`relative w-4 overflow-hidden rounded-sm bg-gray-900 ${meterHeight[size]}`}>
            <LoudnessBar level={loudness.integrated} targetLUFS={targetLUFS} />
            <div
              className="absolute left-0 right-0 h-0.5 bg-primary-500 opacity-50"
              style={{ bottom: `${levelToPercent(targetLUFS)}%` }}
            />
          </div>
          <span className="text-xs text-gray-500">I</span>
        </div>

        {/* True Peak Meter */}
        <div className="flex flex-col items-center gap-1">
          <div className={`relative w-4 overflow-hidden rounded-sm bg-gray-900 ${meterHeight[size]}`}>
            <TruePeakBar level={loudness.peak} />
          </div>
          <span className="text-xs text-gray-500">TP</span>
        </div>
      </div>

      {/* Numeric readouts */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Integrated:</span>
          <span className={getIntegratedColor(loudness.integrated, targetLUFS)}>
            {formatLUFS(loudness.integrated)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Peak:</span>
          <span className={loudness.peak > -1 ? 'text-red-400' : 'text-gray-300'}>
            {loudness.peak > -100 ? `${loudness.peak.toFixed(1)} dB` : '-∞'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Range:</span>
          <span className="text-gray-300">{loudness.range.toFixed(1)} LU</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Target:</span>
          <span className="text-primary-400">{targetLUFS} LUFS</span>
        </div>
      </div>
    </div>
  )
}

// Horizontal layout for compact display
function HorizontalLoudnessMeter({
  loudness,
  peakHold,
  targetLUFS,
  showPeakHold,
  onReset,
  size,
}: {
  loudness: LoudnessState
  peakHold: number
  targetLUFS: number
  showPeakHold: boolean
  onReset: () => void
  size: 'sm' | 'md' | 'lg'
}) {
  const barHeight = {
    sm: 'h-2',
    md: 'h-3',
    lg: 'h-4',
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-gray-700 bg-gray-800 p-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">Loudness</span>
        <div className="flex items-center gap-3">
          <span className={getIntegratedColor(loudness.integrated, targetLUFS)}>
            I: {formatLUFS(loudness.integrated)}
          </span>
          <span className={loudness.peak > -1 ? 'text-red-400' : 'text-gray-400'}>
            TP: {loudness.peak > -100 ? `${loudness.peak.toFixed(1)}` : '-∞'}
          </span>
          <button onClick={onReset} className="text-gray-500 hover:text-gray-300">
            Reset
          </button>
        </div>
      </div>

      <div className="relative w-full overflow-hidden rounded-sm bg-gray-900">
        {/* Scale markers */}
        <div className="absolute inset-0 flex justify-between px-1 text-[8px] text-gray-600">
          <span>-36</span>
          <span>-24</span>
          <span>-18</span>
          <span>-12</span>
          <span>-6</span>
          <span>0</span>
        </div>

        {/* Momentary bar */}
        <div
          className={`${barHeight[size]} transition-all ${getMeterColor(loudness.momentary, targetLUFS)}`}
          style={{ width: `${levelToPercent(loudness.momentary)}%` }}
        />

        {/* Target marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-primary-500"
          style={{ left: `${levelToPercent(targetLUFS)}%` }}
        />

        {/* Peak hold marker */}
        {showPeakHold && peakHold > -60 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-white"
            style={{ left: `${levelToPercent(peakHold)}%` }}
          />
        )}
      </div>
    </div>
  )
}

// Helper components
function LoudnessBar({ level, targetLUFS }: { level: number; targetLUFS: number }) {
  const percent = levelToPercent(level)
  const color = getMeterColor(level, targetLUFS)

  return (
    <div
      className={`absolute bottom-0 w-full transition-all ${color}`}
      style={{ height: `${percent}%` }}
    />
  )
}

function TruePeakBar({ level }: { level: number }) {
  const percent = levelToPercent(level)
  const isClipping = level > -0.5

  return (
    <div
      className={`absolute bottom-0 w-full transition-all ${
        isClipping ? 'bg-red-500' : level > -3 ? 'bg-yellow-500' : 'bg-blue-500'
      }`}
      style={{ height: `${percent}%` }}
    />
  )
}

// Utility functions
function levelToPercent(level: number): number {
  // Map -36 to 0 dB to 0-100%
  if (level < -36) return 0
  if (level > 0) return 100
  return ((level + 36) / 36) * 100
}

function getMeterColor(level: number, target: number): string {
  const diff = level - target
  if (diff > 3) return 'bg-red-500' // Too loud
  if (diff > 0) return 'bg-yellow-500' // Slightly over target
  if (diff > -6) return 'bg-green-500' // Good range
  return 'bg-blue-500' // Below target
}

function getIntegratedColor(level: number, target: number): string {
  if (level < -100) return 'text-gray-500'
  const diff = level - target
  if (Math.abs(diff) <= 1) return 'text-green-400' // On target
  if (diff > 2) return 'text-red-400' // Too loud
  if (diff < -3) return 'text-blue-400' // Too quiet
  return 'text-yellow-400' // Close
}

function formatLUFS(level: number): string {
  if (level < -100) return '-∞ LUFS'
  return `${level.toFixed(1)} LUFS`
}

// Export a hook for using loudness metering independently
export function useLoudnessMeter(analyserNode: AnalyserNode | null) {
  const [loudness, setLoudness] = useState<LoudnessState>({
    momentary: -Infinity,
    shortTerm: -Infinity,
    integrated: -Infinity,
    peak: -Infinity,
    range: 0,
  })

  const integratedBufferRef = useRef<number[]>([])
  const shortTermBufferRef = useRef<number[]>([])

  useEffect(() => {
    if (!analyserNode) return

    const dataArray = new Float32Array(analyserNode.frequencyBinCount)

    const updateMeter = () => {
      analyserNode.getFloatTimeDomainData(dataArray)

      let sum = 0
      let maxSample = 0
      for (let i = 0; i < dataArray.length; i++) {
        const sample = Math.abs(dataArray[i])
        sum += sample * sample
        if (sample > maxSample) maxSample = sample
      }
      const rms = Math.sqrt(sum / dataArray.length)

      const momentary = 20 * Math.log10(Math.max(rms, 0.00001))
      const peak = 20 * Math.log10(Math.max(maxSample, 0.00001))

      shortTermBufferRef.current.push(rms)
      if (shortTermBufferRef.current.length > 60) shortTermBufferRef.current.shift()

      const shortTermRms =
        shortTermBufferRef.current.reduce((a, b) => a + b, 0) /
        shortTermBufferRef.current.length
      const shortTerm = 20 * Math.log10(Math.max(shortTermRms, 0.00001))

      integratedBufferRef.current.push(rms)
      if (integratedBufferRef.current.length > 12000) integratedBufferRef.current.shift()

      const integratedRms =
        integratedBufferRef.current.reduce((a, b) => a + b, 0) /
        integratedBufferRef.current.length
      const integrated = 20 * Math.log10(Math.max(integratedRms, 0.00001))

      setLoudness({
        momentary,
        shortTerm,
        integrated,
        peak,
        range: 0,
      })
    }

    const interval = setInterval(updateMeter, 50)
    return () => clearInterval(interval)
  }, [analyserNode])

  const reset = () => {
    integratedBufferRef.current = []
    shortTermBufferRef.current = []
    setLoudness({
      momentary: -Infinity,
      shortTerm: -Infinity,
      integrated: -Infinity,
      peak: -Infinity,
      range: 0,
    })
  }

  return { loudness, reset }
}
