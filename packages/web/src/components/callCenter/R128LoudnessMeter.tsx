/**
 * EBU R128 Loudness Meter Component
 *
 * Full ITU-R BS.1770-4 compliant loudness measurement with:
 * - K-weighted momentary (M, 400ms)
 * - Short-term (S, 3s)
 * - Integrated (I, program loudness with gating)
 * - True Peak (TP)
 * - Loudness Range (LRA)
 *
 * Uses Web Worker for audio processing to avoid blocking the UI.
 */

import { useEffect, useRef, useState, useCallback } from 'react'

interface R128LoudnessResult {
  momentary: number // M (400ms, LUFS)
  shortTerm: number // S (3s, LUFS)
  integrated: number // I (program, LUFS)
  truePeak: number // TP (dBTP)
  lra: number // Loudness Range (LU)
  maxMomentary: number
  maxShortTerm: number
  maxTruePeak: number
}

interface LoudnessViolation {
  type: 'PEAK' | 'LOUD' | 'QUIET'
  value: number
  threshold: number
  timestamp: number
}

interface R128LoudnessMeterProps {
  analyserNodes: AnalyserNode[] // One per channel
  sampleRate?: number
  targetLUFS?: number // -23 LUFS for EBU, -24 LKFS for ATSC
  truePeakLimit?: number // -1 dBTP for EBU, -2 dBTP for ATSC
  toleranceLU?: number // Tolerance in LU for integrated loudness (default: 1)
  orientation?: 'horizontal' | 'vertical'
  compact?: boolean
  showHistory?: boolean // Show mini history graph
  showAlerts?: boolean // Show compliance alerts
  onLoudnessUpdate?: (result: R128LoudnessResult) => void
  onViolation?: (violation: LoudnessViolation) => void
}

// Standard presets
export const LOUDNESS_STANDARDS = {
  EBU_R128: { target: -23, truePeakLimit: -1, label: 'EBU R128' },
  ATSC_A85: { target: -24, truePeakLimit: -2, label: 'ATSC A/85' },
  STREAMING: { target: -14, truePeakLimit: -1, label: 'Streaming' },
  PODCAST: { target: -16, truePeakLimit: -1, label: 'Podcast' },
} as const

export function R128LoudnessMeter({
  analyserNodes,
  sampleRate = 48000,
  targetLUFS = -23,
  truePeakLimit = -1,
  toleranceLU = 1,
  orientation = 'vertical',
  compact = false,
  showHistory = false,
  showAlerts = true,
  onLoudnessUpdate,
  onViolation,
}: R128LoudnessMeterProps) {
  const [result, setResult] = useState<R128LoudnessResult>({
    momentary: -Infinity,
    shortTerm: -Infinity,
    integrated: -Infinity,
    truePeak: -Infinity,
    lra: 0,
    maxMomentary: -Infinity,
    maxShortTerm: -Infinity,
    maxTruePeak: -Infinity,
  })
  const [isRunning, setIsRunning] = useState(false)
  const [violations, setViolations] = useState<LoudnessViolation[]>([])
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_history, setHistory] = useState<{ time: number; momentary: number; shortTerm: number }[]>([])
  const lastViolationRef = useRef<{ peak: number; loud: number; quiet: number }>({
    peak: 0, loud: 0, quiet: 0
  })

  const workerRef = useRef<Worker | null>(null)
  const animationFrameRef = useRef<number>()
  const buffersRef = useRef<Float32Array<ArrayBuffer>[]>([])

  // Initialize Web Worker
  useEffect(() => {
    // Create inline worker since Vite has issues with worker imports
    const workerCode = `
      ${getWorkerCode()}
    `
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    workerRef.current = new Worker(workerUrl)

    workerRef.current.onmessage = (event) => {
      if (event.data.type === 'result') {
        const data = event.data as R128LoudnessResult
        setResult(data)
        onLoudnessUpdate?.(data)

        const now = Date.now()

        // Track history for graph (keep last 60 seconds at ~10 samples/sec)
        if (showHistory && isFinite(data.momentary)) {
          setHistory(prev => {
            const cutoff = now - 60000
            const filtered = prev.filter(h => h.time > cutoff)
            return [...filtered, { time: now, momentary: data.momentary, shortTerm: data.shortTerm }]
          })
        }

        // Check for violations (debounce to every 2 seconds per type)
        if (showAlerts) {
          const debounceMs = 2000

          // True peak violation
          if (data.truePeak > truePeakLimit && now - lastViolationRef.current.peak > debounceMs) {
            lastViolationRef.current.peak = now
            const violation: LoudnessViolation = {
              type: 'PEAK',
              value: data.truePeak,
              threshold: truePeakLimit,
              timestamp: now,
            }
            setViolations(prev => [...prev.slice(-9), violation])
            onViolation?.(violation)
          }

          // Integrated loudness too high
          if (isFinite(data.integrated) && data.integrated > targetLUFS + toleranceLU && now - lastViolationRef.current.loud > debounceMs) {
            lastViolationRef.current.loud = now
            const violation: LoudnessViolation = {
              type: 'LOUD',
              value: data.integrated,
              threshold: targetLUFS + toleranceLU,
              timestamp: now,
            }
            setViolations(prev => [...prev.slice(-9), violation])
            onViolation?.(violation)
          }

          // Integrated loudness too low (only after sufficient measurement time)
          if (isFinite(data.integrated) && data.integrated < targetLUFS - toleranceLU - 3 && now - lastViolationRef.current.quiet > debounceMs * 5) {
            lastViolationRef.current.quiet = now
            const violation: LoudnessViolation = {
              type: 'QUIET',
              value: data.integrated,
              threshold: targetLUFS - toleranceLU,
              timestamp: now,
            }
            setViolations(prev => [...prev.slice(-9), violation])
            onViolation?.(violation)
          }
        }
      }
    }

    return () => {
      workerRef.current?.terminate()
      URL.revokeObjectURL(workerUrl)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [onLoudnessUpdate, showHistory, showAlerts, truePeakLimit, targetLUFS, toleranceLU, onViolation])

  // Set up audio processing loop
  useEffect(() => {
    if (!analyserNodes.length || !workerRef.current) return

    // Initialize buffers
    const bufferSize = analyserNodes[0]?.frequencyBinCount || 2048
    buffersRef.current = analyserNodes.map(() => new Float32Array(new ArrayBuffer(bufferSize * 4)))

    setIsRunning(true)

    const processFrame = () => {
      // Get audio data from all channels - copy the data to avoid buffer issues
      const channels = analyserNodes.map((node, i) => {
        node.getFloatTimeDomainData(buffersRef.current[i])
        // Create a copy of the typed array to send to worker
        return Array.from(buffersRef.current[i])
      })

      // Send to worker for processing
      workerRef.current?.postMessage({
        type: 'process',
        data: channels,
        sampleRate,
      })

      animationFrameRef.current = requestAnimationFrame(processFrame)
    }

    processFrame()

    return () => {
      setIsRunning(false)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [analyserNodes, sampleRate])

  // Reset measurement
  const reset = useCallback(() => {
    workerRef.current?.postMessage({ type: 'reset' })
    setResult({
      momentary: -Infinity,
      shortTerm: -Infinity,
      integrated: -Infinity,
      truePeak: -Infinity,
      lra: 0,
      maxMomentary: -Infinity,
      maxShortTerm: -Infinity,
      maxTruePeak: -Infinity,
    })
    setViolations([])
    setHistory([])
    lastViolationRef.current = { peak: 0, loud: 0, quiet: 0 }
  }, [])

  // Clear a specific violation
  const dismissViolation = useCallback((timestamp: number) => {
    setViolations(prev => prev.filter(v => v.timestamp !== timestamp))
  }, [])

  if (compact) {
    return (
      <CompactR128Meter
        result={result}
        targetLUFS={targetLUFS}
        truePeakLimit={truePeakLimit}
        onReset={reset}
        isRunning={isRunning}
        violations={violations}
        onDismissViolation={dismissViolation}
      />
    )
  }

  if (orientation === 'horizontal') {
    return (
      <HorizontalR128Meter
        result={result}
        targetLUFS={targetLUFS}
        truePeakLimit={truePeakLimit}
        onReset={reset}
        isRunning={isRunning}
      />
    )
  }

  return (
    <VerticalR128Meter
      result={result}
      targetLUFS={targetLUFS}
      truePeakLimit={truePeakLimit}
      onReset={reset}
      isRunning={isRunning}
    />
  )
}

// Compact single-line meter
function CompactR128Meter({
  result,
  targetLUFS,
  truePeakLimit,
  onReset,
  isRunning,
  violations = [],
  onDismissViolation,
}: {
  result: R128LoudnessResult
  targetLUFS: number
  truePeakLimit: number
  onReset: () => void
  isRunning: boolean
  violations?: LoudnessViolation[]
  onDismissViolation?: (timestamp: number) => void
}) {
  const integratedDiff = result.integrated - targetLUFS
  const peakOver = result.truePeak > truePeakLimit
  const latestViolation = violations[violations.length - 1]

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3 rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-mono">
        {/* Status indicator */}
        <div className={`h-2 w-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}`} />

        {/* Integrated */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">I:</span>
          <span className={getIntegratedColor(integratedDiff)}>
            {formatLUFS(result.integrated)}
          </span>
        </div>

        {/* True Peak */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">TP:</span>
          <span className={peakOver ? 'text-red-400' : 'text-zinc-300'}>
            {formatdB(result.truePeak)}
          </span>
        </div>

        {/* LRA */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-500">LRA:</span>
          <span className="text-zinc-300">{result.lra.toFixed(1)} LU</span>
        </div>

        {/* Violation indicator */}
        {violations.length > 0 && (
          <div className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400">{violations.length}</span>
          </div>
        )}

        {/* Reset button */}
        <button
          onClick={onReset}
          className="ml-auto text-zinc-500 hover:text-zinc-300"
          title="Reset measurement"
        >
          ⟲
        </button>
      </div>

      {/* Show latest violation alert */}
      {latestViolation && (
        <ViolationAlert
          violation={latestViolation}
          onDismiss={() => onDismissViolation?.(latestViolation.timestamp)}
        />
      )}
    </div>
  )
}

// Violation alert component
function ViolationAlert({
  violation,
  onDismiss,
}: {
  violation: LoudnessViolation
  onDismiss: () => void
}) {
  const config = {
    PEAK: { label: 'TRUE PEAK EXCEEDED', color: 'bg-red-900/50 border-red-500 text-red-300' },
    LOUD: { label: 'TOO LOUD', color: 'bg-orange-900/50 border-orange-500 text-orange-300' },
    QUIET: { label: 'TOO QUIET', color: 'bg-blue-900/50 border-blue-500 text-blue-300' },
  }[violation.type]

  return (
    <div className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs font-mono ${config.color}`}>
      <div className="flex items-center gap-2">
        <span className="font-bold">{config.label}</span>
        <span>{violation.value.toFixed(1)} {'>'} {violation.threshold.toFixed(1)}</span>
      </div>
      <button onClick={onDismiss} className="opacity-70 hover:opacity-100">×</button>
    </div>
  )
}

// Full vertical meter
function VerticalR128Meter({
  result,
  targetLUFS,
  truePeakLimit,
  onReset,
  isRunning,
}: {
  result: R128LoudnessResult
  targetLUFS: number
  truePeakLimit: number
  onReset: () => void
  isRunning: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-zinc-700 bg-zinc-800 p-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}`} />
          <span className="text-sm font-medium text-zinc-300">EBU R128</span>
        </div>
        <button
          onClick={onReset}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          Reset
        </button>
      </div>

      {/* Meters */}
      <div className="flex gap-2">
        {/* Momentary */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative h-32 w-4 overflow-hidden rounded-sm bg-zinc-900">
            <LevelBar level={result.momentary} targetLUFS={targetLUFS} />
            <TargetLine targetLUFS={targetLUFS} />
          </div>
          <span className="text-[10px] text-zinc-500">M</span>
        </div>

        {/* Short-term */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative h-32 w-4 overflow-hidden rounded-sm bg-zinc-900">
            <LevelBar level={result.shortTerm} targetLUFS={targetLUFS} />
            <TargetLine targetLUFS={targetLUFS} />
          </div>
          <span className="text-[10px] text-zinc-500">S</span>
        </div>

        {/* Integrated */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative h-32 w-5 overflow-hidden rounded-sm bg-zinc-900 border border-zinc-700">
            <LevelBar level={result.integrated} targetLUFS={targetLUFS} />
            <TargetLine targetLUFS={targetLUFS} />
          </div>
          <span className="text-[10px] font-medium text-zinc-400">I</span>
        </div>

        {/* True Peak */}
        <div className="flex flex-col items-center gap-1">
          <div className="relative h-32 w-4 overflow-hidden rounded-sm bg-zinc-900">
            <TruePeakBar level={result.truePeak} limit={truePeakLimit} />
            <TruePeakLimitLine limit={truePeakLimit} />
          </div>
          <span className="text-[10px] text-zinc-500">TP</span>
        </div>
      </div>

      {/* Numeric readouts */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono">
        <div className="flex justify-between">
          <span className="text-zinc-500">Integrated:</span>
          <span className={getIntegratedColor(result.integrated - targetLUFS)}>
            {formatLUFS(result.integrated)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">True Peak:</span>
          <span className={result.truePeak > truePeakLimit ? 'text-red-400' : 'text-zinc-300'}>
            {formatdB(result.truePeak)} dBTP
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">LRA:</span>
          <span className="text-zinc-300">{result.lra.toFixed(1)} LU</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Target:</span>
          <span className="text-cyan-400">{targetLUFS} LUFS</span>
        </div>
      </div>

      {/* Max values */}
      <div className="border-t border-zinc-700 pt-2 text-[10px] font-mono text-zinc-500">
        <div className="flex justify-between">
          <span>Max M: {formatLUFS(result.maxMomentary)}</span>
          <span>Max S: {formatLUFS(result.maxShortTerm)}</span>
          <span className={result.maxTruePeak > truePeakLimit ? 'text-red-400' : ''}>
            Max TP: {formatdB(result.maxTruePeak)}
          </span>
        </div>
      </div>
    </div>
  )
}

// Horizontal meter for channel strips
function HorizontalR128Meter({
  result,
  targetLUFS,
  truePeakLimit,
  onReset,
  isRunning,
}: {
  result: R128LoudnessResult
  targetLUFS: number
  truePeakLimit: number
  onReset: () => void
  isRunning: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-zinc-700 bg-zinc-800 p-2">
      {/* Header row */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isRunning ? 'bg-green-500 animate-pulse' : 'bg-zinc-500'}`} />
          <span className="text-zinc-400">R128</span>
        </div>
        <div className="flex items-center gap-3 font-mono">
          <span className={getIntegratedColor(result.integrated - targetLUFS)}>
            I: {formatLUFS(result.integrated)}
          </span>
          <span className={result.truePeak > truePeakLimit ? 'text-red-400' : 'text-zinc-400'}>
            TP: {formatdB(result.truePeak)}
          </span>
          <button onClick={onReset} className="text-zinc-500 hover:text-zinc-300">
            ⟲
          </button>
        </div>
      </div>

      {/* Horizontal meter */}
      <div className="relative h-3 w-full overflow-hidden rounded-sm bg-zinc-900">
        {/* Scale */}
        <div className="absolute inset-0 flex justify-between px-1 text-[8px] text-zinc-600 items-center">
          <span>-36</span>
          <span>-24</span>
          <span>-18</span>
          <span>-12</span>
          <span>-6</span>
          <span>0</span>
        </div>

        {/* Momentary bar */}
        <div
          className={`h-full transition-all ${getMeterColor(result.momentary, targetLUFS)}`}
          style={{ width: `${levelToPercent(result.momentary)}%` }}
        />

        {/* Target marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-cyan-500"
          style={{ left: `${levelToPercent(targetLUFS)}%` }}
        />
      </div>
    </div>
  )
}

// Helper components
function LevelBar({ level, targetLUFS }: { level: number; targetLUFS: number }) {
  return (
    <div
      className={`absolute bottom-0 w-full transition-all ${getMeterColor(level, targetLUFS)}`}
      style={{ height: `${levelToPercent(level)}%` }}
    />
  )
}

function TruePeakBar({ level, limit }: { level: number; limit: number }) {
  const isOver = level > limit
  return (
    <div
      className={`absolute bottom-0 w-full transition-all ${
        isOver ? 'bg-red-500' : level > limit - 3 ? 'bg-yellow-500' : 'bg-blue-500'
      }`}
      style={{ height: `${peakToPercent(level)}%` }}
    />
  )
}

function TargetLine({ targetLUFS }: { targetLUFS: number }) {
  return (
    <div
      className="absolute left-0 right-0 h-0.5 bg-cyan-500 opacity-70"
      style={{ bottom: `${levelToPercent(targetLUFS)}%` }}
    />
  )
}

function TruePeakLimitLine({ limit }: { limit: number }) {
  return (
    <div
      className="absolute left-0 right-0 h-0.5 bg-red-500 opacity-70"
      style={{ bottom: `${peakToPercent(limit)}%` }}
    />
  )
}

// Utility functions
function levelToPercent(level: number): number {
  // Map -36 to 0 LUFS to 0-100%
  if (level < -36) return 0
  if (level > 0) return 100
  return ((level + 36) / 36) * 100
}

function peakToPercent(level: number): number {
  // Map -20 to +3 dBTP to 0-100%
  if (level < -20) return 0
  if (level > 3) return 100
  return ((level + 20) / 23) * 100
}

function getMeterColor(level: number, target: number): string {
  const diff = level - target
  if (diff > 3) return 'bg-red-500'
  if (diff > 0) return 'bg-yellow-500'
  if (diff > -6) return 'bg-green-500'
  return 'bg-blue-500'
}

function getIntegratedColor(diff: number): string {
  if (!isFinite(diff)) return 'text-zinc-500'
  if (Math.abs(diff) <= 1) return 'text-green-400'
  if (diff > 2) return 'text-red-400'
  if (diff < -3) return 'text-blue-400'
  return 'text-yellow-400'
}

function formatLUFS(value: number): string {
  if (!isFinite(value) || value < -100) return '-∞'
  return value.toFixed(1)
}

function formatdB(value: number): string {
  if (!isFinite(value) || value < -100) return '-∞'
  return value.toFixed(1)
}

// Inline worker code (extracted for bundling compatibility)
function getWorkerCode(): string {
  return `
// K-weighting filter coefficients
function getKWeightingCoefficients(sr) {
  if (sr === 48000) {
    return {
      shelf: { b0: 1.53512485958697, b1: -2.69169618940638, b2: 1.19839281085285, a1: -1.69065929318241, a2: 0.73248077421585 },
      highpass: { b0: 1.0, b1: -2.0, b2: 1.0, a1: -1.99004745483398, a2: 0.99007225036621 }
    };
  }
  return {
    shelf: { b0: 1.5308412300498355, b1: -2.6509799951547297, b2: 1.1690790799215869, a1: -1.6636551132560204, a2: 0.7125954280732254 },
    highpass: { b0: 1.0, b1: -2.0, b2: 1.0, a1: -1.9891696736297957, a2: 0.9891990357870394 }
  };
}

function applyBiquad(samples, coeff, state) {
  const output = new Float32Array(samples.length);
  const { b0, b1, b2, a1, a2 } = coeff;
  let { x1, x2, y1, y2 } = state;
  for (let i = 0; i < samples.length; i++) {
    const x0 = samples[i];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    output[i] = y0;
    x2 = x1; x1 = x0; y2 = y1; y1 = y0;
  }
  state.x1 = x1; state.x2 = x2; state.y1 = y1; state.y2 = y2;
  return output;
}

function meanSquare(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return sum / samples.length;
}

function powerToLUFS(power) {
  if (power <= 0) return -Infinity;
  return -0.691 + 10 * Math.log10(power);
}

function calculateTruePeak(samples) {
  let maxSample = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxSample) maxSample = abs;
  }
  return 20 * Math.log10(Math.max(maxSample, 1e-10)) + 0.5;
}

let sampleRate = 48000;
let shelfStates = [];
let highpassStates = [];
let blockBuffers = [];
let blockSize = 0;
let blockIndex = 0;
let momentaryBlocks = [];
let shortTermBlocks = [];
let gatedBlocks = [];
let maxMomentary = -Infinity;
let maxShortTerm = -Infinity;
let maxTruePeak = -Infinity;

function initializeState(numChannels, sr) {
  sampleRate = sr;
  blockSize = Math.floor(sr * 0.1);
  shelfStates = [];
  highpassStates = [];
  blockBuffers = [];
  for (let ch = 0; ch < numChannels; ch++) {
    shelfStates.push({ x1: 0, x2: 0, y1: 0, y2: 0 });
    highpassStates.push({ x1: 0, x2: 0, y1: 0, y2: 0 });
    blockBuffers.push(new Float32Array(blockSize));
  }
  blockIndex = 0;
  momentaryBlocks = [];
  shortTermBlocks = [];
  gatedBlocks = [];
  maxMomentary = -Infinity;
  maxShortTerm = -Infinity;
  maxTruePeak = -Infinity;
}

function reset() {
  for (const state of shelfStates) { state.x1 = state.x2 = state.y1 = state.y2 = 0; }
  for (const state of highpassStates) { state.x1 = state.x2 = state.y1 = state.y2 = 0; }
  for (const buffer of blockBuffers) { buffer.fill(0); }
  blockIndex = 0;
  momentaryBlocks = [];
  shortTermBlocks = [];
  gatedBlocks = [];
  maxMomentary = -Infinity;
  maxShortTerm = -Infinity;
  maxTruePeak = -Infinity;
}

function processAudio(channels) {
  const numChannels = channels.length;
  const numSamples = channels[0]?.length || 0;
  if (numChannels === 0 || numSamples === 0) {
    return { type: 'result', momentary: -Infinity, shortTerm: -Infinity, integrated: -Infinity, truePeak: -Infinity, lra: 0, maxMomentary, maxShortTerm, maxTruePeak };
  }
  if (shelfStates.length !== numChannels) initializeState(numChannels, sampleRate);

  const coeffs = getKWeightingCoefficients(sampleRate);
  let truePeak = -Infinity;
  const filteredChannels = [];

  for (let ch = 0; ch < numChannels; ch++) {
    let filtered = applyBiquad(channels[ch], coeffs.shelf, shelfStates[ch]);
    filtered = applyBiquad(filtered, coeffs.highpass, highpassStates[ch]);
    filteredChannels.push(filtered);
    const chPeak = calculateTruePeak(channels[ch]);
    if (chPeak > truePeak) truePeak = chPeak;
  }
  if (truePeak > maxTruePeak) maxTruePeak = truePeak;

  let sampleIndex = 0;
  while (sampleIndex < numSamples) {
    const samplesToAdd = Math.min(numSamples - sampleIndex, blockSize - blockIndex);
    for (let ch = 0; ch < numChannels; ch++) {
      for (let i = 0; i < samplesToAdd; i++) {
        blockBuffers[ch][blockIndex + i] = filteredChannels[ch][sampleIndex + i];
      }
    }
    blockIndex += samplesToAdd;
    sampleIndex += samplesToAdd;

    if (blockIndex >= blockSize) {
      let blockPower = 0;
      for (let ch = 0; ch < numChannels; ch++) {
        blockPower += meanSquare(blockBuffers[ch]);
      }
      const blockLoudness = powerToLUFS(blockPower);
      momentaryBlocks.push(blockPower);
      if (momentaryBlocks.length > 4) momentaryBlocks.shift();
      shortTermBlocks.push(blockPower);
      if (shortTermBlocks.length > 30) shortTermBlocks.shift();
      if (blockLoudness > -70) {
        gatedBlocks.push(blockPower);
        if (gatedBlocks.length > 18000) gatedBlocks.shift();
      }
      blockIndex = 0;
    }
  }

  let momentary = -Infinity;
  if (momentaryBlocks.length > 0) {
    momentary = powerToLUFS(momentaryBlocks.reduce((a, b) => a + b, 0) / momentaryBlocks.length);
    if (momentary > maxMomentary) maxMomentary = momentary;
  }

  let shortTerm = -Infinity;
  if (shortTermBlocks.length > 0) {
    shortTerm = powerToLUFS(shortTermBlocks.reduce((a, b) => a + b, 0) / shortTermBlocks.length);
    if (shortTerm > maxShortTerm) maxShortTerm = shortTerm;
  }

  let integrated = -Infinity;
  let lra = 0;
  if (gatedBlocks.length > 0) {
    const ungatedMean = gatedBlocks.reduce((a, b) => a + b, 0) / gatedBlocks.length;
    const ungatedLoudness = powerToLUFS(ungatedMean);
    const relativeThreshold = ungatedLoudness - 10;
    const relativeGatedBlocks = gatedBlocks.filter(p => powerToLUFS(p) > relativeThreshold);
    if (relativeGatedBlocks.length > 0) {
      integrated = powerToLUFS(relativeGatedBlocks.reduce((a, b) => a + b, 0) / relativeGatedBlocks.length);
      const sortedBlocks = [...relativeGatedBlocks].sort((a, b) => a - b);
      const lowIndex = Math.floor(sortedBlocks.length * 0.1);
      const highIndex = Math.floor(sortedBlocks.length * 0.95);
      if (highIndex > lowIndex) {
        lra = powerToLUFS(sortedBlocks[highIndex]) - powerToLUFS(sortedBlocks[lowIndex]);
      }
    }
  }

  return { type: 'result', momentary, shortTerm, integrated, truePeak, lra, maxMomentary, maxShortTerm, maxTruePeak };
}

self.onmessage = (event) => {
  const { type, data, sampleRate: sr } = event.data;
  switch (type) {
    case 'process':
      if (data && sr) {
        if (sr !== sampleRate || shelfStates.length !== data.length) initializeState(data.length, sr);
        const result = processAudio(data);
        self.postMessage(result);
      }
      break;
    case 'reset':
      reset();
      self.postMessage({ type: 'reset' });
      break;
  }
};
  `
}

// Export hook for external use
export function useR128Loudness(analyserNodes: AnalyserNode[], sampleRate = 48000) {
  const [result, setResult] = useState<R128LoudnessResult>({
    momentary: -Infinity,
    shortTerm: -Infinity,
    integrated: -Infinity,
    truePeak: -Infinity,
    lra: 0,
    maxMomentary: -Infinity,
    maxShortTerm: -Infinity,
    maxTruePeak: -Infinity,
  })

  const workerRef = useRef<Worker | null>(null)
  const animationFrameRef = useRef<number>()
  const buffersRef = useRef<Float32Array<ArrayBuffer>[]>([])

  useEffect(() => {
    const workerCode = getWorkerCode()
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    workerRef.current = new Worker(workerUrl)

    workerRef.current.onmessage = (event) => {
      if (event.data.type === 'result') {
        setResult(event.data)
      }
    }

    return () => {
      workerRef.current?.terminate()
      URL.revokeObjectURL(workerUrl)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!analyserNodes.length || !workerRef.current) return

    const bufferSize = analyserNodes[0]?.frequencyBinCount || 2048
    buffersRef.current = analyserNodes.map(() => new Float32Array(new ArrayBuffer(bufferSize * 4)))

    const processFrame = () => {
      const channels = analyserNodes.map((node, i) => {
        node.getFloatTimeDomainData(buffersRef.current[i])
        return Array.from(buffersRef.current[i])
      })
      workerRef.current?.postMessage({ type: 'process', data: channels, sampleRate })
      animationFrameRef.current = requestAnimationFrame(processFrame)
    }

    processFrame()

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [analyserNodes, sampleRate])

  const reset = useCallback(() => {
    workerRef.current?.postMessage({ type: 'reset' })
    setResult({
      momentary: -Infinity,
      shortTerm: -Infinity,
      integrated: -Infinity,
      truePeak: -Infinity,
      lra: 0,
      maxMomentary: -Infinity,
      maxShortTerm: -Infinity,
      maxTruePeak: -Infinity,
    })
  }, [])

  return { result, reset }
}

export default R128LoudnessMeter
