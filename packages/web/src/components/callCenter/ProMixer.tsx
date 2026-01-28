/**
 * ProMixer - Professional Broadcast-Style Audio Mixer
 *
 * A dense, configurable, and powerful mixing console for broadcast workflows.
 * Inspired by Studer, Calrec, and professional broadcast software.
 *
 * Features:
 * - Per-channel: Gain, HPF, 3-band EQ, Compressor, Aux sends, Pan, Fader, M/S/PFL
 * - Master section: Program/Talkback buses, meters, limiter
 * - Monitor section: Source select, dim, cut
 * - Bus routing: PGM, TB, AUX 1-4
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import useAudioEngine, {
  type BusType,
  type ChannelSettings as AudioEngineChannelSettings,
  type DuckingSourceType,
  type DuckingSettings,
} from '../../hooks/useAudioEngine'
import { R128LoudnessMeter, LOUDNESS_STANDARDS } from './R128LoudnessMeter'
import { useMixerStore, type PersistedChannelSettings } from '../../stores/mixerStore'

// ============================================================================
// TYPES
// ============================================================================

export type BusAssignment = BusType

export interface ChannelEQ {
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

export interface ChannelCompressor {
  enabled: boolean
  threshold: number // -40 to 0 dB
  ratio: number // 1:1 to 20:1
  attack: number // 0.1 to 100 ms
  release: number // 10 to 1000 ms
  makeupGain: number // 0 to 20 dB
}

export interface ChannelGate {
  enabled: boolean
  threshold: number // -60 to 0 dB - below this level, gate closes
  attack: number // 1 to 50 ms - how fast gate opens
  hold: number // 0 to 500 ms - how long gate stays open after signal drops
  release: number // 10 to 1000 ms - how fast gate closes
  range: number // -80 to 0 dB - how much to attenuate when closed (0 = no attenuation)
}

export interface ChannelState {
  id: string
  label: string
  color?: string
  inputGain: number // -20 to +20 dB
  eq: ChannelEQ
  gate: ChannelGate
  compressor: ChannelCompressor
  ducking: DuckingSettings // Voice-activated ducking settings
  auxSends: [number, number, number, number] // AUX 1-4 levels (0-1)
  pan: number // -1 to +1
  fader: number // 0 to 1.5 (unity = 1.0, +6dB = ~1.5)
  mute: boolean
  solo: boolean
  pfl: boolean // Pre-Fader Listen
  busAssignment: BusAssignment[]
  // Runtime state
  inputLevel: number
  outputLevel: number
  gainReduction: number
}

export interface MasterState {
  pgmFader: number
  pgmMute: boolean
  tbFader: number
  tbMute: boolean
  auxMasters: [number, number, number, number]
  limiterEnabled: boolean
  limiterThreshold: number
  monitorSource: 'PGM' | 'TB' | 'PFL' | 'AUX1' | 'AUX2'
  monitorDim: boolean
  monitorCut: boolean
  monitorLevel: number
  // Runtime levels
  pgmLevelL: number
  pgmLevelR: number
  tbLevelL: number
  tbLevelR: number
}

/** Interface for external control of the mixer (keyboard shortcuts, automation) */
export interface ProMixerControls {
  /** Toggle mute for a channel by index (0-based) */
  toggleChannelMute: (channelIndex: number) => void
  /** Toggle solo for a channel by index (0-based) */
  toggleChannelSolo: (channelIndex: number) => void
  /** Clear all channel solos */
  clearAllSolos: () => void
  /** Toggle master PGM mute */
  toggleMasterMute: () => void
  /** Get the current channel count */
  getChannelCount: () => number
  /** Update bus routing for a channel */
  updateChannelRouting: (channelId: string, busType: BusType, enabled: boolean) => void
  /** Get all channel states for routing matrix */
  getChannelStates: () => Record<string, ChannelState>
  /** Update aux send level for a channel */
  updateAuxSend: (channelId: string, busType: BusType, level: number) => void
}

interface ProMixerProps {
  /** Room ID for persisting mixer state */
  roomId?: string
  channels: Array<{
    id: string
    label: string
    stream?: MediaStream
    isLocal?: boolean
    color?: string
  }>
  onChannelChange?: (channelId: string, state: Partial<ChannelState>) => void
  onMasterChange?: (state: Partial<MasterState>) => void
  /** Callback when on-air channels change (channels routed to PGM and not muted) */
  onOnAirChange?: (onAirChannelIds: string[]) => void
  /** Callback to receive mixer control interface for keyboard shortcuts etc */
  onControlsReady?: (controls: ProMixerControls) => void
  /** Callback to receive audio engine functions for bus output production */
  onAudioEngineReady?: (audioEngine: {
    getBusOutputStream: (busType: BusType) => MediaStream | null
    isInitialized: () => boolean
  }) => void
  /** When true, mixer is always visible and embedded in layout (not a modal) */
  embedded?: boolean
  /** For modal mode: whether the modal is open */
  isOpen?: boolean
  /** For modal mode: callback when modal is closed */
  onClose?: () => void
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_EQ: ChannelEQ = {
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

const DEFAULT_COMPRESSOR: ChannelCompressor = {
  enabled: false,
  threshold: -20,
  ratio: 4,
  attack: 10,
  release: 100,
  makeupGain: 0,
}

const DEFAULT_GATE: ChannelGate = {
  enabled: false,
  threshold: -40,
  attack: 5,
  hold: 100,
  release: 100,
  range: -60,
}

const DEFAULT_DUCKING: DuckingSettings = {
  sourceType: 'voice' as DuckingSourceType,
  enabled: false,
  amount: -12,
  threshold: 0.1,
  attack: 10,
  release: 500,
}

const DEFAULT_CHANNEL: Omit<ChannelState, 'id' | 'label'> = {
  inputGain: 0,
  eq: DEFAULT_EQ,
  gate: DEFAULT_GATE,
  compressor: DEFAULT_COMPRESSOR,
  ducking: DEFAULT_DUCKING,
  auxSends: [0, 0, 0, 0],
  pan: 0,
  fader: 1.0,
  mute: false,
  solo: false,
  pfl: false,
  busAssignment: ['PGM'],
  inputLevel: 0,
  outputLevel: 0,
  gainReduction: 0,
}

const DEFAULT_MASTER: MasterState = {
  pgmFader: 1.0,
  pgmMute: false,
  tbFader: 1.0,
  tbMute: false,
  auxMasters: [0.8, 0.8, 0.8, 0.8],
  limiterEnabled: true,
  limiterThreshold: -3,
  monitorSource: 'PGM',
  monitorDim: false,
  monitorCut: false,
  monitorLevel: 0.8,
  pgmLevelL: 0,
  pgmLevelR: 0,
  tbLevelL: 0,
  tbLevelR: 0,
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function linearToDb(linear: number): number {
  if (linear <= 0) return -Infinity
  return 20 * Math.log10(linear)
}

function formatDb(db: number): string {
  if (db <= -60) return '-∞'
  return db.toFixed(1)
}

function faderToDb(fader: number): number {
  // Fader 0 = -∞, 0.75 = -10dB, 1.0 = 0dB (unity), 1.5 = +6dB
  if (fader <= 0) return -Infinity
  if (fader <= 0.75) {
    // -∞ to -10dB (exponential)
    return -10 - (1 - fader / 0.75) * 50
  }
  if (fader <= 1.0) {
    // -10dB to 0dB (linear)
    return (fader - 0.75) / 0.25 * 10 - 10
  }
  // 0dB to +6dB
  return (fader - 1.0) / 0.5 * 6
}

// ============================================================================
// METER COMPONENT
// ============================================================================

interface PPMMeterProps {
  level: number // 0 to 1
  peakHold?: number
  width?: number
  height?: number
  orientation?: 'vertical' | 'horizontal'
  showScale?: boolean
  label?: string
}

function PPMMeter({
  level,
  peakHold,
  width = 12,
  height = 200,
  orientation = 'vertical',
  showScale = false,
  label
}: PPMMeterProps) {
  const [peak, setPeak] = useState(0)
  const peakTimeoutRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (level > peak) {
      setPeak(level)
      if (peakTimeoutRef.current) clearTimeout(peakTimeoutRef.current)
      peakTimeoutRef.current = setTimeout(() => setPeak(0), 2000)
    }
  }, [level, peak])

  const displayPeak = peakHold !== undefined ? peakHold : peak
  const isVertical = orientation === 'vertical'

  // PPM scale markers in dB
  const markers = [-40, -30, -20, -18, -14, -10, -6, -3, 0, 3, 6]

  const levelToPercent = (db: number) => {
    // Map -60dB to 0%, +6dB to 100%
    const minDb = -60
    const maxDb = 6
    return Math.max(0, Math.min(100, ((db - minDb) / (maxDb - minDb)) * 100))
  }

  const levelDb = linearToDb(level)
  const peakDb = linearToDb(displayPeak)
  const fillPercent = levelToPercent(levelDb)
  const peakPercent = levelToPercent(peakDb)

  // Color stops for broadcast PPM
  const getColor = (percent: number) => {
    if (percent > 85) return '#ef4444' // Red > 0dB
    if (percent > 75) return '#f59e0b' // Amber > -6dB
    if (percent > 60) return '#eab308' // Yellow > -14dB
    return '#22c55e' // Green
  }

  return (
    <div className={`flex ${isVertical ? 'flex-col' : 'flex-row'} items-center gap-1`}>
      {label && (
        <span className="text-[9px] font-mono text-gray-500 uppercase">{label}</span>
      )}
      <div
        className="relative bg-black"
        style={{
          width: isVertical ? width : height,
          height: isVertical ? height : width,
        }}
      >
        {/* Scale markers */}
        {showScale && (
          <div className={`absolute ${isVertical ? 'right-full mr-1' : 'bottom-full mb-1'} flex ${isVertical ? 'flex-col-reverse justify-between h-full' : 'flex-row justify-between w-full'}`}>
            {markers.map(db => (
              <span
                key={db}
                className="text-[8px] font-mono text-gray-600"
                style={{
                  position: 'absolute',
                  ...(isVertical
                    ? { bottom: `${levelToPercent(db)}%`, transform: 'translateY(50%)' }
                    : { left: `${levelToPercent(db)}%`, transform: 'translateX(-50%)' }
                  )
                }}
              >
                {db > 0 ? `+${db}` : db}
              </span>
            ))}
          </div>
        )}

        {/* Meter segments */}
        <div className="absolute inset-0 flex flex-col-reverse">
          {/* Green zone: -60 to -14dB */}
          <div
            className="bg-green-500/90 transition-all duration-75"
            style={{ height: `${Math.min(fillPercent, 60)}%` }}
          />
          {/* Yellow zone: -14 to -6dB */}
          {fillPercent > 60 && (
            <div
              className="bg-yellow-500/90 transition-all duration-75"
              style={{ height: `${Math.min(fillPercent - 60, 15)}%` }}
            />
          )}
          {/* Amber zone: -6 to 0dB */}
          {fillPercent > 75 && (
            <div
              className="bg-amber-500/90 transition-all duration-75"
              style={{ height: `${Math.min(fillPercent - 75, 10)}%` }}
            />
          )}
          {/* Red zone: > 0dB */}
          {fillPercent > 85 && (
            <div
              className="bg-red-500/90 transition-all duration-75"
              style={{ height: `${fillPercent - 85}%` }}
            />
          )}
        </div>

        {/* Peak hold indicator */}
        {displayPeak > 0.001 && (
          <div
            className="absolute left-0 right-0 h-[2px] transition-all duration-100"
            style={{
              bottom: `${peakPercent}%`,
              backgroundColor: getColor(peakPercent)
            }}
          />
        )}

        {/* Grid lines */}
        <div className="absolute inset-0 pointer-events-none">
          {[60, 75, 85].map(p => (
            <div
              key={p}
              className="absolute left-0 right-0 border-t border-gray-800"
              style={{ bottom: `${p}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STEREO METER COMPONENT
// ============================================================================

interface StereoMeterProps {
  levelL: number
  levelR: number
  height?: number
  label?: string
}

function StereoMeter({ levelL, levelR, height = 200, label }: StereoMeterProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      {label && (
        <span className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      )}
      <div className="flex gap-[2px]">
        <PPMMeter level={levelL} width={10} height={height} />
        <PPMMeter level={levelR} width={10} height={height} />
      </div>
      <div className="flex gap-1 text-[8px] font-mono text-gray-600">
        <span>L</span>
        <span>R</span>
      </div>
    </div>
  )
}

// ============================================================================
// GAIN REDUCTION METER
// ============================================================================

interface GRMeterProps {
  reduction: number // 0 to 20 dB
  width?: number
  height?: number
}

function GRMeter({ reduction, width = 8, height = 40 }: GRMeterProps) {
  const percent = Math.min(reduction / 20, 1) * 100

  return (
    <div
      className="relative bg-black"
      style={{ width, height }}
    >
      {/* Fill from top (gain reduction shows as bar from top) */}
      <div
        className="absolute top-0 left-0 right-0 bg-amber-500/80 transition-all duration-75"
        style={{ height: `${percent}%` }}
      />
      {/* Grid */}
      <div className="absolute inset-0 pointer-events-none">
        {[25, 50, 75].map(p => (
          <div
            key={p}
            className="absolute left-0 right-0 border-t border-gray-800"
            style={{ top: `${p}%` }}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// FADER COMPONENT
// ============================================================================

interface FaderProps {
  value: number // 0 to 1.5
  onChange: (value: number) => void
  height?: number
  showDb?: boolean
  muted?: boolean
  color?: string
}

function Fader({
  value,
  onChange,
  height = 180,
  showDb = true,
  muted = false,
  color = '#3b82f6'
}: FaderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    updateValue(e)
  }

  const updateValue = useCallback((e: MouseEvent | React.MouseEvent) => {
    if (!trackRef.current) return
    const rect = trackRef.current.getBoundingClientRect()
    const y = (rect.bottom - e.clientY) / rect.height
    const newValue = Math.max(0, Math.min(1.5, y * 1.5))
    onChange(newValue)
  }, [onChange])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => updateValue(e)
    const handleMouseUp = () => setIsDragging(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, updateValue])

  const db = faderToDb(value)
  const percent = (value / 1.5) * 100

  // Fader scale markers
  const markers = [
    { db: 6, pos: 100 },
    { db: 3, pos: 90 },
    { db: 0, pos: 66.67 },  // Unity at 1.0
    { db: -5, pos: 55 },
    { db: -10, pos: 50 },  // At 0.75
    { db: -20, pos: 35 },
    { db: -30, pos: 20 },
    { db: -40, pos: 10 },
    { db: -Infinity, pos: 0 },
  ]

  return (
    <div className="flex items-end gap-1">
      {/* Scale */}
      <div className="relative h-full" style={{ height }}>
        {markers.slice(0, -1).map(({ db, pos }) => (
          <div
            key={db}
            className="absolute right-0 flex items-center"
            style={{ bottom: `${pos}%`, transform: 'translateY(50%)' }}
          >
            <span className="text-[8px] font-mono text-gray-600 pr-1">
              {db > 0 ? `+${db}` : db === 0 ? 'U' : db}
            </span>
            <div className="w-1 h-[1px] bg-gray-600" />
          </div>
        ))}
      </div>

      {/* Fader track */}
      <div
        ref={trackRef}
        className="relative w-6 bg-gray-900 cursor-ns-resize select-none"
        style={{ height }}
        onMouseDown={handleMouseDown}
      >
        {/* Fill */}
        <div
          className={`absolute bottom-0 left-0 right-0 transition-colors ${muted ? 'bg-gray-700' : ''}`}
          style={{
            height: `${percent}%`,
            backgroundColor: muted ? undefined : color,
            opacity: 0.3
          }}
        />

        {/* Unity line */}
        <div
          className="absolute left-0 right-0 h-[2px] bg-white/30"
          style={{ bottom: '66.67%' }}
        />

        {/* Fader cap */}
        <div
          className="absolute left-0 right-0 h-6 bg-gradient-to-b from-gray-300 to-gray-500 border border-gray-400 shadow-md"
          style={{
            bottom: `calc(${percent}% - 12px)`,
            borderRadius: '2px'
          }}
        >
          {/* Grip lines */}
          <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 space-y-[2px]">
            <div className="h-[1px] bg-gray-600" />
            <div className="h-[1px] bg-gray-600" />
            <div className="h-[1px] bg-gray-600" />
          </div>
        </div>
      </div>

      {/* dB readout */}
      {showDb && (
        <div className="w-8 text-right">
          <span className={`text-[10px] font-mono ${muted ? 'text-red-500' : db > -3 ? 'text-amber-400' : 'text-gray-400'}`}>
            {formatDb(db)}
          </span>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// KNOB COMPONENT
// ============================================================================

interface KnobProps {
  value: number
  min: number
  max: number
  onChange: (value: number) => void
  size?: number
  label?: string
  formatValue?: (value: number) => string
  bipolar?: boolean
  color?: string
}

function Knob({
  value,
  min,
  max,
  onChange,
  size = 32,
  label,
  formatValue,
  bipolar = false,
  color = '#3b82f6'
}: KnobProps) {
  const knobRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const startYRef = useRef(0)
  const startValueRef = useRef(0)

  const percent = (value - min) / (max - min)
  const angle = -135 + percent * 270 // -135 to +135 degrees

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    startYRef.current = e.clientY
    startValueRef.current = value
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = (startYRef.current - e.clientY) / 100
      const range = max - min
      const newValue = Math.max(min, Math.min(max, startValueRef.current + delta * range))
      onChange(newValue)
    }

    const handleMouseUp = () => setIsDragging(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, min, max, onChange])

  const displayValue = formatValue ? formatValue(value) : value.toFixed(1)

  return (
    <div className="flex flex-col items-center gap-0.5">
      {label && (
        <span className="text-[8px] font-mono text-gray-500 uppercase">{label}</span>
      )}
      <div
        ref={knobRef}
        className="relative cursor-ns-resize select-none"
        style={{ width: size, height: size }}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => onChange(bipolar ? (min + max) / 2 : min)}
      >
        <svg viewBox="0 0 40 40" className="w-full h-full">
          {/* Background arc */}
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="#1f2937"
            strokeWidth="3"
            strokeDasharray="85 100"
            strokeLinecap="butt"
            transform="rotate(135 20 20)"
          />
          {/* Active arc */}
          {bipolar ? (
            // Bipolar: fills from center
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeDasharray={`${Math.abs(percent - 0.5) * 85} 100`}
              strokeLinecap="butt"
              transform={`rotate(${percent > 0.5 ? 270 : 270 - (0.5 - percent) * 270} 20 20)`}
            />
          ) : (
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeDasharray={`${percent * 85} 100`}
              strokeLinecap="butt"
              transform="rotate(135 20 20)"
            />
          )}
          {/* Center */}
          <circle cx="20" cy="20" r="10" fill="#111827" />
          {/* Indicator line */}
          <line
            x1="20"
            y1="12"
            x2="20"
            y2="6"
            stroke="#e5e7eb"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${angle} 20 20)`}
          />
          {/* Center dot for bipolar */}
          {bipolar && (
            <circle cx="20" cy="4" r="1.5" fill="#6b7280" transform="rotate(0 20 20)" />
          )}
        </svg>
      </div>
      <span className="text-[9px] font-mono text-gray-400">{displayValue}</span>
    </div>
  )
}

// ============================================================================
// BUTTON COMPONENT
// ============================================================================

interface MixerButtonProps {
  label: string
  active: boolean
  onClick: () => void
  variant?: 'mute' | 'solo' | 'pfl' | 'default' | 'on-air'
  size?: 'sm' | 'md'
}

function MixerButton({ label, active, onClick, variant = 'default', size = 'sm' }: MixerButtonProps) {
  const baseClasses = 'font-mono font-bold uppercase transition-colors select-none'
  const sizeClasses = size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-1'

  const variantClasses = {
    mute: active
      ? 'bg-red-600 text-white shadow-[0_0_8px_rgba(220,38,38,0.5)]'
      : 'bg-gray-800 text-gray-500 hover:bg-gray-700',
    solo: active
      ? 'bg-yellow-500 text-black shadow-[0_0_8px_rgba(234,179,8,0.5)]'
      : 'bg-gray-800 text-gray-500 hover:bg-gray-700',
    pfl: active
      ? 'bg-green-600 text-white shadow-[0_0_8px_rgba(22,163,74,0.5)]'
      : 'bg-gray-800 text-gray-500 hover:bg-gray-700',
    'on-air': active
      ? 'bg-red-600 text-white animate-pulse shadow-[0_0_12px_rgba(220,38,38,0.7)]'
      : 'bg-gray-800 text-gray-500',
    default: active
      ? 'bg-primary-600 text-white'
      : 'bg-gray-800 text-gray-500 hover:bg-gray-700',
  }

  return (
    <button
      onClick={onClick}
      className={`${baseClasses} ${sizeClasses} ${variantClasses[variant]}`}
    >
      {label}
    </button>
  )
}

// ============================================================================
// BUS ASSIGNMENT COMPONENT
// ============================================================================

interface BusAssignmentProps {
  assignments: BusAssignment[]
  onChange: (assignments: BusAssignment[]) => void
}

function BusAssignment({ assignments, onChange }: BusAssignmentProps) {
  const buses: BusAssignment[] = ['PGM', 'TB', 'AUX1', 'AUX2', 'AUX3', 'AUX4']

  const toggle = (bus: BusAssignment) => {
    if (assignments.includes(bus)) {
      onChange(assignments.filter(b => b !== bus))
    } else {
      onChange([...assignments, bus])
    }
  }

  return (
    <div className="grid grid-cols-2 gap-[2px]">
      {buses.map(bus => (
        <button
          key={bus}
          onClick={() => toggle(bus)}
          className={`text-[7px] font-mono font-bold px-1 py-0.5 transition-colors ${
            assignments.includes(bus)
              ? bus === 'PGM'
                ? 'bg-red-600 text-white'
                : bus === 'TB'
                ? 'bg-yellow-600 text-black'
                : 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-600 hover:bg-gray-700'
          }`}
        >
          {bus}
        </button>
      ))}
    </div>
  )
}

// ============================================================================
// EQ SECTION COMPONENT
// ============================================================================

interface EQSectionProps {
  eq: ChannelEQ
  onChange: (eq: Partial<ChannelEQ>) => void
  compact?: boolean
}

function EQSection({ eq, onChange, compact = true }: EQSectionProps) {
  if (compact) {
    return (
      <div className="flex flex-col gap-0.5 p-1 bg-gray-900/50">
        <div className="flex items-center justify-between">
          <span className="text-[7px] font-mono text-gray-500">EQ</span>
          <MixerButton
            label="HPF"
            active={eq.hpfEnabled}
            onClick={() => onChange({ hpfEnabled: !eq.hpfEnabled })}
            size="sm"
          />
        </div>
        <div className="flex gap-0.5 justify-center">
          <Knob
            value={eq.lowGain}
            min={-15}
            max={15}
            onChange={v => onChange({ lowGain: v })}
            size={18}
            label="L"
            formatValue={() => ''}
            bipolar
            color="#22c55e"
          />
          <Knob
            value={eq.midGain}
            min={-15}
            max={15}
            onChange={v => onChange({ midGain: v })}
            size={18}
            label="M"
            formatValue={() => ''}
            bipolar
            color="#eab308"
          />
          <Knob
            value={eq.highGain}
            min={-15}
            max={15}
            onChange={v => onChange({ highGain: v })}
            size={18}
            label="H"
            formatValue={() => ''}
            bipolar
            color="#3b82f6"
          />
        </div>
      </div>
    )
  }

  // Full EQ section for expanded view
  return (
    <div className="p-2 bg-gray-900/50 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-gray-400 font-bold">EQUALIZER</span>
        <MixerButton
          label="HPF"
          active={eq.hpfEnabled}
          onClick={() => onChange({ hpfEnabled: !eq.hpfEnabled })}
        />
      </div>

      {eq.hpfEnabled && (
        <Knob
          value={eq.hpfFreq}
          min={20}
          max={500}
          onChange={v => onChange({ hpfFreq: v })}
          size={28}
          label="HPF FREQ"
          formatValue={v => `${v.toFixed(0)}Hz`}
        />
      )}

      <div className="space-y-2">
        {/* Low band */}
        <div className="flex items-center gap-2">
          <Knob
            value={eq.lowGain}
            min={-15}
            max={15}
            onChange={v => onChange({ lowGain: v })}
            size={28}
            label="GAIN"
            formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
            bipolar
            color="#22c55e"
          />
          <Knob
            value={eq.lowFreq}
            min={60}
            max={500}
            onChange={v => onChange({ lowFreq: v })}
            size={28}
            label="LO FREQ"
            formatValue={v => `${v.toFixed(0)}`}
            color="#22c55e"
          />
        </div>

        {/* Mid band */}
        <div className="flex items-center gap-2">
          <Knob
            value={eq.midGain}
            min={-15}
            max={15}
            onChange={v => onChange({ midGain: v })}
            size={28}
            label="GAIN"
            formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
            bipolar
            color="#eab308"
          />
          <Knob
            value={eq.midFreq}
            min={200}
            max={8000}
            onChange={v => onChange({ midFreq: v })}
            size={28}
            label="MID FREQ"
            formatValue={v => v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${v.toFixed(0)}`}
            color="#eab308"
          />
          <Knob
            value={eq.midQ}
            min={0.5}
            max={8}
            onChange={v => onChange({ midQ: v })}
            size={28}
            label="Q"
            formatValue={v => v.toFixed(1)}
            color="#eab308"
          />
        </div>

        {/* High band */}
        <div className="flex items-center gap-2">
          <Knob
            value={eq.highGain}
            min={-15}
            max={15}
            onChange={v => onChange({ highGain: v })}
            size={28}
            label="GAIN"
            formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
            bipolar
            color="#3b82f6"
          />
          <Knob
            value={eq.highFreq}
            min={2000}
            max={16000}
            onChange={v => onChange({ highFreq: v })}
            size={28}
            label="HI FREQ"
            formatValue={v => `${(v/1000).toFixed(1)}k`}
            color="#3b82f6"
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// COMPRESSOR SECTION COMPONENT
// ============================================================================

interface CompressorSectionProps {
  comp: ChannelCompressor
  onChange: (comp: Partial<ChannelCompressor>) => void
  gainReduction: number
  compact?: boolean
}

function CompressorSection({ comp, onChange, gainReduction, compact = true }: CompressorSectionProps) {
  if (compact) {
    return (
      <div className="flex flex-col gap-0.5 p-1 bg-gray-900/50">
        <div className="flex items-center justify-between">
          <span className="text-[7px] font-mono text-gray-500">DYN</span>
          <MixerButton
            label="IN"
            active={comp.enabled}
            onClick={() => onChange({ enabled: !comp.enabled })}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-0.5 justify-center">
          <Knob
            value={comp.threshold}
            min={-40}
            max={0}
            onChange={v => onChange({ threshold: v })}
            size={18}
            label="T"
            formatValue={() => ''}
          />
          <Knob
            value={comp.ratio}
            min={1}
            max={20}
            onChange={v => onChange({ ratio: v })}
            size={18}
            label="R"
            formatValue={() => ''}
          />
          <GRMeter reduction={gainReduction} width={5} height={24} />
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 bg-gray-900/50 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-gray-400 font-bold">DYNAMICS</span>
        <MixerButton
          label="IN"
          active={comp.enabled}
          onClick={() => onChange({ enabled: !comp.enabled })}
        />
      </div>

      <div className="flex gap-2">
        <div className="space-y-1">
          <Knob
            value={comp.threshold}
            min={-40}
            max={0}
            onChange={v => onChange({ threshold: v })}
            size={32}
            label="THRESHOLD"
            formatValue={v => `${v.toFixed(0)}dB`}
          />
          <Knob
            value={comp.ratio}
            min={1}
            max={20}
            onChange={v => onChange({ ratio: v })}
            size={32}
            label="RATIO"
            formatValue={v => `${v.toFixed(1)}:1`}
          />
        </div>
        <div className="space-y-1">
          <Knob
            value={comp.attack}
            min={0.1}
            max={100}
            onChange={v => onChange({ attack: v })}
            size={32}
            label="ATTACK"
            formatValue={v => `${v.toFixed(1)}ms`}
          />
          <Knob
            value={comp.release}
            min={10}
            max={1000}
            onChange={v => onChange({ release: v })}
            size={32}
            label="RELEASE"
            formatValue={v => `${v.toFixed(0)}ms`}
          />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[8px] font-mono text-gray-500">GR</span>
          <GRMeter reduction={gainReduction} width={10} height={60} />
          <span className="text-[9px] font-mono text-amber-400">
            {gainReduction > 0 ? `-${gainReduction.toFixed(1)}` : '0'}
          </span>
        </div>
      </div>

      <Knob
        value={comp.makeupGain}
        min={0}
        max={20}
        onChange={v => onChange({ makeupGain: v })}
        size={32}
        label="MAKEUP"
        formatValue={v => `+${v.toFixed(1)}dB`}
      />
    </div>
  )
}

// ============================================================================
// GATE SECTION COMPONENT
// ============================================================================

interface GateSectionProps {
  gate: ChannelGate
  onChange: (gate: Partial<ChannelGate>) => void
  compact?: boolean
}

function GateSection({ gate, onChange, compact = true }: GateSectionProps) {
  if (compact) {
    return (
      <div className="flex flex-col gap-0.5 p-1 bg-gray-900/50">
        <div className="flex items-center justify-between">
          <span className="text-[7px] font-mono text-gray-500">GATE</span>
          <MixerButton
            label="IN"
            active={gate.enabled}
            onClick={() => onChange({ enabled: !gate.enabled })}
            size="sm"
          />
        </div>
        <div className="flex items-center gap-0.5 justify-center">
          <Knob
            value={gate.threshold}
            min={-60}
            max={0}
            onChange={v => onChange({ threshold: v })}
            size={18}
            label="T"
            formatValue={() => ''}
          />
          <Knob
            value={gate.range}
            min={-80}
            max={0}
            onChange={v => onChange({ range: v })}
            size={18}
            label="R"
            formatValue={() => ''}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="p-2 bg-gray-900/50 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-mono text-gray-400 font-bold">NOISE GATE</span>
        <MixerButton
          label="IN"
          active={gate.enabled}
          onClick={() => onChange({ enabled: !gate.enabled })}
        />
      </div>

      <div className="flex gap-2">
        <div className="space-y-1">
          <Knob
            value={gate.threshold}
            min={-60}
            max={0}
            onChange={v => onChange({ threshold: v })}
            size={32}
            label="THRESHOLD"
            formatValue={v => `${v.toFixed(0)}dB`}
          />
          <Knob
            value={gate.range}
            min={-80}
            max={0}
            onChange={v => onChange({ range: v })}
            size={32}
            label="RANGE"
            formatValue={v => `${v.toFixed(0)}dB`}
          />
        </div>
        <div className="space-y-1">
          <Knob
            value={gate.attack}
            min={1}
            max={50}
            onChange={v => onChange({ attack: v })}
            size={32}
            label="ATTACK"
            formatValue={v => `${v.toFixed(0)}ms`}
          />
          <Knob
            value={gate.hold}
            min={0}
            max={500}
            onChange={v => onChange({ hold: v })}
            size={32}
            label="HOLD"
            formatValue={v => `${v.toFixed(0)}ms`}
          />
        </div>
        <div className="space-y-1">
          <Knob
            value={gate.release}
            min={10}
            max={1000}
            onChange={v => onChange({ release: v })}
            size={32}
            label="RELEASE"
            formatValue={v => `${v.toFixed(0)}ms`}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// CHANNEL STRIP COMPONENT
// ============================================================================

interface ChannelStripProps {
  channel: ChannelState
  onChange: (updates: Partial<ChannelState>) => void
  soloActive: boolean
  expanded?: boolean
  onExpandToggle?: () => void
}

function ChannelStrip({
  channel,
  onChange,
  soloActive,
  expanded = false,
  onExpandToggle
}: ChannelStripProps) {
  const channelColor = channel.color || '#3b82f6'

  // Determine effective mute state (muted if soloed elsewhere)
  const effectivelyMuted = channel.mute || (soloActive && !channel.solo)

  return (
    <div
      className={`flex flex-col bg-gray-850 border-r border-gray-800 h-full ${expanded ? 'w-48' : 'w-16'}`}
    >
      {/* Channel label / scribble strip - fixed top */}
      <div
        className="h-5 flex-shrink-0 flex items-center justify-center px-1 cursor-pointer"
        style={{ backgroundColor: channelColor }}
        onClick={onExpandToggle}
      >
        <span className="text-[9px] font-mono font-bold text-white truncate">
          {channel.label}
        </span>
      </div>

      {/* Scrollable controls area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {/* Input gain */}
        <div className="p-1 border-b border-gray-800 flex justify-center">
          <Knob
            value={channel.inputGain}
            min={-20}
            max={20}
            onChange={v => onChange({ inputGain: v })}
            size={expanded ? 28 : 22}
            label="GAIN"
            formatValue={v => `${v > 0 ? '+' : ''}${v.toFixed(0)}`}
            bipolar
          />
        </div>

        {/* EQ Section */}
        <div className="border-b border-gray-800">
          <EQSection
            eq={channel.eq}
            onChange={eq => onChange({ eq: { ...channel.eq, ...eq } })}
            compact={!expanded}
          />
        </div>

        {/* Gate Section */}
        <div className="border-b border-gray-800">
          <GateSection
            gate={channel.gate}
            onChange={gate => onChange({ gate: { ...channel.gate, ...gate } })}
            compact={!expanded}
          />
        </div>

        {/* Compressor Section */}
        <div className="border-b border-gray-800">
          <CompressorSection
            comp={channel.compressor}
            onChange={comp => onChange({ compressor: { ...channel.compressor, ...comp } })}
            gainReduction={channel.gainReduction}
            compact={!expanded}
          />
        </div>

        {/* Aux Sends */}
        <div className="p-1 border-b border-gray-800">
          <span className="text-[7px] font-mono text-gray-500 block mb-0.5">AUX</span>
          <div className={`grid ${expanded ? 'grid-cols-4' : 'grid-cols-2'} gap-0.5`}>
            {channel.auxSends.map((level, i) => (
              <Knob
                key={i}
                value={level}
                min={0}
                max={1}
                onChange={v => {
                  const newSends = [...channel.auxSends] as [number, number, number, number]
                  newSends[i] = v
                  onChange({ auxSends: newSends })
                }}
                size={expanded ? 20 : 16}
                label={`${i + 1}`}
                formatValue={() => ''}
                color="#6366f1"
              />
            ))}
          </div>
        </div>

        {/* Pan */}
        <div className="p-1 border-b border-gray-800 flex justify-center">
          <Knob
            value={channel.pan}
            min={-1}
            max={1}
            onChange={v => onChange({ pan: v })}
            size={expanded ? 28 : 22}
            label="PAN"
            formatValue={v => v === 0 ? 'C' : v < 0 ? `${Math.round(Math.abs(v) * 100)}L` : `${Math.round(v * 100)}R`}
            bipolar
          />
        </div>

        {/* Bus Assignment */}
        <div className="p-1 border-b border-gray-800">
          <span className="text-[7px] font-mono text-gray-500 block mb-0.5">BUS</span>
          <BusAssignment
            assignments={channel.busAssignment}
            onChange={busAssignment => onChange({ busAssignment })}
          />
        </div>
      </div>

      {/* Fixed bottom: Meter + Fader + Buttons */}
      <div className="flex-shrink-0 border-t border-gray-700">
        {/* Meter + Fader section */}
        <div className="flex items-stretch p-1 gap-1" style={{ height: 140 }}>
          {/* Input level meter with label */}
          <div className="flex flex-col items-center">
            <span className="text-[7px] font-mono text-gray-500 mb-0.5">IN</span>
            <PPMMeter level={channel.inputLevel} width={10} height={120} />
          </div>

          {/* Fader */}
          <div className="flex-1 flex justify-center">
            <Fader
              value={channel.fader}
              onChange={v => onChange({ fader: v })}
              height={120}
              muted={effectivelyMuted}
              color={channelColor}
              showDb={false}
            />
          </div>

          {/* Output level meter with label */}
          <div className="flex flex-col items-center">
            <span className="text-[7px] font-mono text-gray-500 mb-0.5">OUT</span>
            <PPMMeter level={channel.outputLevel} width={10} height={120} />
          </div>
        </div>

        {/* M / S / PFL buttons */}
        <div className="p-1 flex gap-0.5 justify-center border-t border-gray-800">
          <MixerButton
            label="M"
            active={channel.mute}
            onClick={() => onChange({ mute: !channel.mute })}
            variant="mute"
          />
          <MixerButton
            label="S"
            active={channel.solo}
            onClick={() => onChange({ solo: !channel.solo })}
            variant="solo"
          />
          <MixerButton
            label="PFL"
            active={channel.pfl}
            onClick={() => onChange({ pfl: !channel.pfl })}
            variant="pfl"
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MASTER SECTION COMPONENT
// ============================================================================

interface MasterSectionProps {
  master: MasterState
  onChange: (updates: Partial<MasterState>) => void
  hasSolo: boolean
  hasPFL: boolean
  pgmAnalysers?: AnalyserNode[]
  showR128Meter?: boolean
  onToggleR128Meter?: () => void
  loudnessStandard?: keyof typeof LOUDNESS_STANDARDS
}

function MasterSection({
  master,
  onChange,
  hasSolo,
  hasPFL,
  pgmAnalysers,
  showR128Meter,
  onToggleR128Meter,
  loudnessStandard = 'EBU_R128',
}: MasterSectionProps) {
  const standard = LOUDNESS_STANDARDS[loudnessStandard]

  return (
    <div className="flex bg-gray-900 border-l-2 border-red-600 h-full flex-shrink-0">
      {/* R128 Loudness Meter (optional) */}
      {showR128Meter && pgmAnalysers && (
        <div className="w-24 flex flex-col border-r border-gray-800 h-full">
          <div className="h-5 flex-shrink-0 flex items-center justify-between bg-blue-600 px-1">
            <span className="text-[9px] font-mono font-bold text-white">LUFS</span>
            <button
              onClick={onToggleR128Meter}
              className="text-[8px] text-blue-200 hover:text-white"
            >
              ×
            </button>
          </div>
          <div className="flex-1 min-h-0 p-1">
            <R128LoudnessMeter
              analyserNodes={pgmAnalysers}
              targetLUFS={standard.target}
              truePeakLimit={standard.truePeakLimit}
              orientation="vertical"
              compact={true}
            />
          </div>
          <div className="p-1 border-t border-gray-800 flex-shrink-0">
            <span className="text-[7px] font-mono text-gray-500 block text-center">{standard.label}</span>
          </div>
        </div>
      )}

      {/* Program Bus */}
      <div className="w-20 flex flex-col border-r border-gray-800 h-full">
        <div className="h-5 flex-shrink-0 flex items-center justify-center bg-red-600">
          <span className="text-[9px] font-mono font-bold text-white">PGM</span>
        </div>

        {/* Limiter - compact */}
        <div className="p-1 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[7px] font-mono text-gray-500">LIM</span>
            <MixerButton
              label="IN"
              active={master.limiterEnabled}
              onClick={() => onChange({ limiterEnabled: !master.limiterEnabled })}
              size="sm"
            />
          </div>
        </div>

        {/* Meters + Fader - fixed height */}
        <div className="flex-1 flex items-stretch p-1 gap-1 min-h-0">
          <StereoMeter
            levelL={master.pgmLevelL}
            levelR={master.pgmLevelR}
            height={140}
          />
          <Fader
            value={master.pgmFader}
            onChange={v => onChange({ pgmFader: v })}
            height={140}
            muted={master.pgmMute}
            color="#dc2626"
            showDb={false}
          />
        </div>

        {/* Mute + On Air */}
        <div className="p-1 flex flex-col gap-0.5 items-center border-t border-gray-800 flex-shrink-0">
          <MixerButton
            label="MUTE"
            active={master.pgmMute}
            onClick={() => onChange({ pgmMute: !master.pgmMute })}
            variant="mute"
            size="sm"
          />
          <MixerButton
            label="ON AIR"
            active={!master.pgmMute && master.pgmFader > 0}
            onClick={() => {}}
            variant="on-air"
            size="sm"
          />
        </div>
      </div>

      {/* Talkback Bus */}
      <div className="w-16 flex flex-col border-r border-gray-800 h-full">
        <div className="h-5 flex-shrink-0 flex items-center justify-center bg-yellow-600">
          <span className="text-[9px] font-mono font-bold text-black">TB</span>
        </div>

        <div className="flex-1 flex items-stretch p-1 gap-0.5 min-h-0">
          <StereoMeter
            levelL={master.tbLevelL}
            levelR={master.tbLevelR}
            height={140}
          />
          <Fader
            value={master.tbFader}
            onChange={v => onChange({ tbFader: v })}
            height={140}
            muted={master.tbMute}
            color="#ca8a04"
            showDb={false}
          />
        </div>

        <div className="p-1 flex justify-center border-t border-gray-800 flex-shrink-0">
          <MixerButton
            label="M"
            active={master.tbMute}
            onClick={() => onChange({ tbMute: !master.tbMute })}
            variant="mute"
          />
        </div>
      </div>

      {/* Monitor Section */}
      <div className="w-20 flex flex-col h-full">
        <div className="h-5 flex-shrink-0 flex items-center justify-center bg-gray-700">
          <span className="text-[9px] font-mono font-bold text-white">MON</span>
        </div>

        {/* Source select */}
        <div className="p-1 border-b border-gray-800 flex-shrink-0">
          <span className="text-[7px] font-mono text-gray-500 block mb-0.5">SRC</span>
          <div className="grid grid-cols-2 gap-[1px]">
            {(['PGM', 'TB', 'PFL', 'AUX1'] as const).map(src => (
              <button
                key={src}
                onClick={() => onChange({ monitorSource: src })}
                className={`text-[7px] font-mono font-bold px-0.5 py-0.5 ${
                  master.monitorSource === src
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-800 text-gray-500 hover:bg-gray-700'
                }`}
              >
                {src}
              </button>
            ))}
          </div>
          {/* PFL indicator */}
          {hasPFL && (
            <div className="mt-0.5 text-center">
              <span className="text-[8px] font-mono text-green-400 animate-pulse">PFL</span>
            </div>
          )}
          {/* Solo indicator */}
          {hasSolo && (
            <div className="mt-0.5 text-center">
              <span className="text-[8px] font-mono text-yellow-400 animate-pulse">SOLO</span>
            </div>
          )}
        </div>

        {/* Monitor level */}
        <div className="flex-1 flex flex-col items-center justify-center p-1 min-h-0">
          <Knob
            value={master.monitorLevel}
            min={0}
            max={1}
            onChange={v => onChange({ monitorLevel: v })}
            size={36}
            label="LEVEL"
            formatValue={v => `${Math.round(v * 100)}%`}
          />
        </div>

        {/* Dim / Cut */}
        <div className="p-1 flex gap-0.5 justify-center border-t border-gray-800 flex-shrink-0">
          <MixerButton
            label="DIM"
            active={master.monitorDim}
            onClick={() => onChange({ monitorDim: !master.monitorDim })}
            size="sm"
          />
          <MixerButton
            label="CUT"
            active={master.monitorCut}
            onClick={() => onChange({ monitorCut: !master.monitorCut })}
            variant="mute"
            size="sm"
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN MIXER COMPONENT
// ============================================================================

export function ProMixer({
  roomId,
  channels: inputChannels,
  onChannelChange,
  onMasterChange,
  onOnAirChange,
  onControlsReady,
  onAudioEngineReady,
  embedded = false,
  isOpen = true,
  onClose
}: ProMixerProps) {
  // Channel states (UI state that syncs with audio engine)
  const [channelStates, setChannelStates] = useState<Record<string, ChannelState>>({})
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)

  // Master state
  const [masterState, setMasterState] = useState<MasterState>(DEFAULT_MASTER)
  const [showR128Meter, setShowR128Meter] = useState(false)
  const [pgmAnalysers, setPgmAnalysers] = useState<AnalyserNode[] | null>(null)

  // Session state persistence
  const { getRoomState, saveRoomState } = useMixerStore()
  const savedStateLoadedRef = useRef(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track which channels have been added to the audio engine
  const addedChannelsRef = useRef<Set<string>>(new Set())

  // Real audio engine for processing
  const audioEngine = useAudioEngine()

  // Get PGM bus analysers for R128 metering when audio engine is initialized
  // Use a stable dependency - the function reference is stable from useCallback
  const isAudioInitialized = audioEngine.isInitialized()
  useEffect(() => {
    if (isAudioInitialized) {
      const analysers = audioEngine.getBusAnalysers('PGM')
      setPgmAnalysers(analysers)
    }
  }, [isAudioInitialized, audioEngine.getBusAnalysers])

  // Stable key for inputChannels to avoid re-running effect on every render
  const inputChannelsKey = inputChannels.map(ch => `${ch.id}:${ch.label}:${ch.color}`).join('|')

  // Initialize channel states for new channels
  useEffect(() => {
    setChannelStates(prev => {
      const updates: Record<string, ChannelState> = {}
      let hasChanges = false

      inputChannels.forEach(ch => {
        const existing = prev[ch.id]
        if (!existing) {
          // New channel - add default state
          updates[ch.id] = {
            ...DEFAULT_CHANNEL,
            id: ch.id,
            label: ch.label,
            color: ch.color,
          }
          hasChanges = true
        } else if (existing.label !== ch.label || existing.color !== ch.color) {
          // Existing channel with changed label/color - update
          updates[ch.id] = {
            ...existing,
            label: ch.label,
            color: ch.color,
          }
          hasChanges = true
        }
      })

      if (!hasChanges) {
        return prev // No changes, return same reference
      }

      return { ...prev, ...updates }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputChannelsKey])

  // Ref to hold channelStates for use in effects without triggering re-runs
  const channelStatesRef = useRef(channelStates)
  channelStatesRef.current = channelStates

  // Load saved session state when mixer opens for a room
  useEffect(() => {
    if (!roomId || savedStateLoadedRef.current) return

    const savedState = getRoomState(roomId)
    if (!savedState) return

    // Apply saved channel settings
    setChannelStates(prev => {
      const updated = { ...prev }
      let hasChanges = false

      Object.entries(savedState.channels).forEach(([channelId, saved]) => {
        if (updated[channelId]) {
          // Convert busRouting object to busAssignment array
          const busAssignment: BusAssignment[] = []
          if (saved.busRouting.pgm) busAssignment.push('PGM')
          if (saved.busRouting.tb) busAssignment.push('TB')
          if (saved.busRouting.aux1) busAssignment.push('AUX1')
          if (saved.busRouting.aux2) busAssignment.push('AUX2')
          if (saved.busRouting.aux3) busAssignment.push('AUX3')
          if (saved.busRouting.aux4) busAssignment.push('AUX4')

          // Merge saved settings with current channel (preserving id, label, color)
          updated[channelId] = {
            ...updated[channelId],
            inputGain: saved.inputGain,
            eq: saved.eq,
            gate: saved.gate || DEFAULT_GATE, // Backwards compatibility
            compressor: saved.compressor,
            pan: saved.pan,
            fader: saved.fader,
            mute: saved.mute,
            pfl: saved.pfl,
            busAssignment,
            auxSends: saved.auxSends,
          }
          hasChanges = true
        }
      })

      if (!hasChanges) return prev
      return updated
    })

    // Apply saved master settings
    setMasterState(prev => ({
      ...prev,
      pgmFader: savedState.master.pgmFader,
      tbFader: savedState.master.tbFader,
      pgmMute: savedState.master.pgmMute,
      tbMute: savedState.master.tbMute,
    }))

    savedStateLoadedRef.current = true
    console.log('[ProMixer] Loaded saved session state for room', roomId)
  }, [roomId, getRoomState])

  // Save session state when channel settings change (debounced)
  useEffect(() => {
    if (!roomId || !savedStateLoadedRef.current) return
    if (Object.keys(channelStates).length === 0) return

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce save to avoid excessive writes
    saveTimeoutRef.current = setTimeout(() => {
      const channelsToSave: Record<string, PersistedChannelSettings> = {}

      Object.entries(channelStates).forEach(([id, ch]) => {
        // Convert busAssignment array to busRouting object
        const busRouting = {
          pgm: ch.busAssignment.includes('PGM'),
          tb: ch.busAssignment.includes('TB'),
          aux1: ch.busAssignment.includes('AUX1'),
          aux2: ch.busAssignment.includes('AUX2'),
          aux3: ch.busAssignment.includes('AUX3'),
          aux4: ch.busAssignment.includes('AUX4'),
        }

        channelsToSave[id] = {
          inputGain: ch.inputGain,
          eq: ch.eq,
          gate: ch.gate,
          compressor: ch.compressor,
          pan: ch.pan,
          fader: ch.fader,
          mute: ch.mute,
          pfl: ch.pfl,
          busRouting,
          auxSends: ch.auxSends,
        }
      })

      saveRoomState(roomId, {
        channels: channelsToSave,
        master: {
          pgmFader: masterState.pgmFader,
          tbFader: masterState.tbFader,
          pgmMute: masterState.pgmMute,
          tbMute: masterState.tbMute,
        },
        lastSaved: Date.now(),
      })
    }, 1000) // Save 1 second after last change

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [roomId, channelStates, masterState, saveRoomState])

  // Initialize audio engine and add/remove channels
  // Use refs to avoid re-running on every channelStates/audioEngine change
  useEffect(() => {
    if (!isOpen && !embedded) return

    // Initialize the audio engine
    audioEngine.initialize()

    // Add channels with streams to the audio engine
    inputChannels.forEach(ch => {
      if (ch.stream && !ch.isLocal && !addedChannelsRef.current.has(ch.id)) {
        // Convert UI channel state to audio engine format - read from ref to get current state
        const uiState = channelStatesRef.current[ch.id]
        let initialSettings: Partial<AudioEngineChannelSettings> | undefined

        if (uiState) {
          initialSettings = {
            inputGain: uiState.inputGain,
            eq: {
              hpfEnabled: uiState.eq.hpfEnabled,
              hpfFreq: uiState.eq.hpfFreq,
              lowGain: uiState.eq.lowGain,
              lowFreq: uiState.eq.lowFreq,
              midGain: uiState.eq.midGain,
              midFreq: uiState.eq.midFreq,
              midQ: uiState.eq.midQ,
              highGain: uiState.eq.highGain,
              highFreq: uiState.eq.highFreq,
            },
            compressor: {
              enabled: uiState.compressor.enabled,
              threshold: uiState.compressor.threshold,
              ratio: uiState.compressor.ratio,
              attack: uiState.compressor.attack / 1000, // ms to seconds
              release: uiState.compressor.release / 1000, // ms to seconds
              makeupGain: uiState.compressor.makeupGain,
            },
            gate: {
              enabled: uiState.gate.enabled,
              threshold: uiState.gate.threshold,
              attack: uiState.gate.attack / 1000, // ms to seconds
              hold: uiState.gate.hold, // ms (kept as ms)
              release: uiState.gate.release / 1000, // ms to seconds
              range: uiState.gate.range,
            },
            pan: uiState.pan,
            fader: uiState.fader,
            mute: uiState.mute,
            solo: uiState.solo,
            pfl: uiState.pfl,
            busAssignment: uiState.busAssignment,
            auxSends: {
              PGM: { level: 0, preFader: false },
              TB: { level: 0, preFader: false },
              AUX1: { level: uiState.auxSends[0], preFader: true },
              AUX2: { level: uiState.auxSends[1], preFader: true },
              AUX3: { level: uiState.auxSends[2], preFader: true },
              AUX4: { level: uiState.auxSends[3], preFader: true },
            },
          }
        }

        audioEngine.addChannel(ch.id, ch.stream, initialSettings)
        addedChannelsRef.current.add(ch.id)
        console.log(`[ProMixer] Added channel to audio engine: ${ch.label}`)
      }
    })

    // Remove channels that no longer exist
    const currentIds = new Set(inputChannels.map(ch => ch.id))
    addedChannelsRef.current.forEach(id => {
      if (!currentIds.has(id)) {
        audioEngine.removeChannel(id)
        addedChannelsRef.current.delete(id)
        console.log(`[ProMixer] Removed channel from audio engine: ${id}`)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, embedded, inputChannelsKey]) // Use stable key instead of inputChannels/channelStates

  // Update channel and bus levels from audio engine using interval polling
  // Use refs to avoid dependency on frequently-changing audioEngine object
  const prevChannelLevelsRef = useRef<Map<string, { input: number; output: number; gainReduction: number }>>(new Map())
  const prevBusLevelsRef = useRef<{ pgmL: number; pgmR: number; tbL: number; tbR: number }>({ pgmL: 0, pgmR: 0, tbL: 0, tbR: 0 })
  const audioEngineRef = useRef(audioEngine)
  audioEngineRef.current = audioEngine // Always keep ref updated

  useEffect(() => {
    if (!isOpen && !embedded) return

    const updateLevels = () => {
      const engine = audioEngineRef.current

      // Update channel levels
      if (engine.channelLevels.size > 0) {
        setChannelStates(prev => {
          const next = { ...prev }
          let hasChanges = false

          engine.channelLevels.forEach((levels, channelId) => {
            if (next[channelId]) {
              const prevLevels = prevChannelLevelsRef.current.get(channelId)

              // Only update if values have changed significantly
              if (
                !prevLevels ||
                Math.abs(prevLevels.input - levels.input) > 0.01 ||
                Math.abs(prevLevels.output - levels.output) > 0.01 ||
                Math.abs(prevLevels.gainReduction - levels.gainReduction) > 0.1
              ) {
                next[channelId] = {
                  ...next[channelId],
                  inputLevel: levels.input,
                  outputLevel: levels.output,
                  gainReduction: levels.gainReduction,
                }
                prevChannelLevelsRef.current.set(channelId, { ...levels })
                hasChanges = true
              }
            }
          })

          return hasChanges ? next : prev
        })
      }

      // Update bus levels
      const pgmLevels = engine.busLevels.get('PGM')
      const tbLevels = engine.busLevels.get('TB')
      const prevBus = prevBusLevelsRef.current

      if (pgmLevels || tbLevels) {
        const pgmL = pgmLevels?.left ?? 0
        const pgmR = pgmLevels?.right ?? 0
        const tbL = tbLevels?.left ?? 0
        const tbR = tbLevels?.right ?? 0

        // Only update if changed significantly
        if (
          Math.abs(prevBus.pgmL - pgmL) > 0.01 ||
          Math.abs(prevBus.pgmR - pgmR) > 0.01 ||
          Math.abs(prevBus.tbL - tbL) > 0.01 ||
          Math.abs(prevBus.tbR - tbR) > 0.01
        ) {
          prevBusLevelsRef.current = { pgmL, pgmR, tbL, tbR }
          setMasterState(masterPrev => ({
            ...masterPrev,
            pgmLevelL: pgmL * masterPrev.pgmFader,
            pgmLevelR: pgmR * masterPrev.pgmFader,
            tbLevelL: tbL * masterPrev.tbFader,
            tbLevelR: tbR * masterPrev.tbFader,
          }))
        }
      }
    }

    // Poll at 20fps (50ms) - matches audio engine throttle
    const intervalId = setInterval(updateLevels, 50)
    return () => clearInterval(intervalId)
  }, [isOpen, embedded]) // Removed audioEngine dependencies - using ref instead

  // Check for solo/PFL active
  const hasSolo = useMemo(() =>
    Object.values(channelStates).some(ch => ch.solo),
    [channelStates]
  )
  const hasPFL = useMemo(() =>
    Object.values(channelStates).some(ch => ch.pfl),
    [channelStates]
  )

  // Track which channels are "on-air" (routed to PGM and not muted)
  // Also consider the master PGM bus state
  const onAirChannelIds = useMemo(() => {
    if (masterState.pgmMute || masterState.pgmFader <= 0) {
      return [] // Master is muted, nothing is on-air
    }
    return Object.values(channelStates)
      .filter(ch =>
        ch.busAssignment.includes('PGM') &&
        !ch.mute &&
        ch.fader > 0 &&
        !(hasSolo && !ch.solo) // If solo is active, only soloed channels are on-air
      )
      .map(ch => ch.id)
  }, [channelStates, masterState.pgmMute, masterState.pgmFader, hasSolo])

  // Notify parent when on-air channels change
  useEffect(() => {
    onOnAirChange?.(onAirChannelIds)
  }, [onAirChannelIds, onOnAirChange])

  // Handle channel state changes - sync to audio engine
  const handleChannelChange = useCallback((id: string, updates: Partial<ChannelState>) => {
    setChannelStates(prev => {
      const newState = { ...prev[id], ...updates }

      // If this channel is in the audio engine, update it
      if (addedChannelsRef.current.has(id)) {
        // Convert UI updates to audio engine format
        const engineUpdates: Partial<AudioEngineChannelSettings> = {}

        if (updates.inputGain !== undefined) {
          engineUpdates.inputGain = updates.inputGain
        }

        if (updates.eq) {
          engineUpdates.eq = {
            hpfEnabled: newState.eq.hpfEnabled,
            hpfFreq: newState.eq.hpfFreq,
            lowGain: newState.eq.lowGain,
            lowFreq: newState.eq.lowFreq,
            midGain: newState.eq.midGain,
            midFreq: newState.eq.midFreq,
            midQ: newState.eq.midQ,
            highGain: newState.eq.highGain,
            highFreq: newState.eq.highFreq,
          }
        }

        if (updates.compressor) {
          engineUpdates.compressor = {
            enabled: newState.compressor.enabled,
            threshold: newState.compressor.threshold,
            ratio: newState.compressor.ratio,
            attack: newState.compressor.attack / 1000, // ms to seconds
            release: newState.compressor.release / 1000, // ms to seconds
            makeupGain: newState.compressor.makeupGain,
          }
        }

        if (updates.gate) {
          engineUpdates.gate = {
            enabled: newState.gate.enabled,
            threshold: newState.gate.threshold,
            attack: newState.gate.attack / 1000, // ms to seconds
            hold: newState.gate.hold, // ms (kept as ms)
            release: newState.gate.release / 1000, // ms to seconds
            range: newState.gate.range,
          }
        }

        if (updates.pan !== undefined) {
          engineUpdates.pan = updates.pan
        }

        if (updates.fader !== undefined) {
          engineUpdates.fader = updates.fader
        }

        if (updates.mute !== undefined) {
          engineUpdates.mute = updates.mute
        }

        if (updates.solo !== undefined) {
          engineUpdates.solo = updates.solo
        }

        if (updates.pfl !== undefined) {
          engineUpdates.pfl = updates.pfl
        }

        if (updates.busAssignment) {
          engineUpdates.busAssignment = updates.busAssignment
        }

        if (updates.auxSends) {
          engineUpdates.auxSends = {
            PGM: { level: 0, preFader: false },
            TB: { level: 0, preFader: false },
            AUX1: { level: updates.auxSends[0], preFader: true },
            AUX2: { level: updates.auxSends[1], preFader: true },
            AUX3: { level: updates.auxSends[2], preFader: true },
            AUX4: { level: updates.auxSends[3], preFader: true },
          }
        }

        if (updates.ducking) {
          engineUpdates.ducking = newState.ducking
        }

        // Apply to audio engine
        if (Object.keys(engineUpdates).length > 0) {
          audioEngine.updateChannel(id, engineUpdates)
        }
      }

      return { ...prev, [id]: newState }
    })
    onChannelChange?.(id, updates)
  }, [onChannelChange, audioEngine])

  // Handle master state changes - sync to audio engine buses
  const handleMasterChange = useCallback((updates: Partial<MasterState>) => {
    setMasterState(prev => {
      const newState = { ...prev, ...updates }

      // Sync PGM bus settings
      if (updates.pgmFader !== undefined || updates.pgmMute !== undefined || updates.limiterEnabled !== undefined || updates.limiterThreshold !== undefined) {
        audioEngine.updateBus('PGM', {
          fader: newState.pgmFader,
          mute: newState.pgmMute,
          limiterEnabled: newState.limiterEnabled,
          limiterThreshold: newState.limiterThreshold,
        })
      }

      // Sync TB bus settings
      if (updates.tbFader !== undefined || updates.tbMute !== undefined) {
        audioEngine.updateBus('TB', {
          fader: newState.tbFader,
          mute: newState.tbMute,
        })
      }

      // Sync AUX masters
      if (updates.auxMasters) {
        const auxBuses: BusType[] = ['AUX1', 'AUX2', 'AUX3', 'AUX4']
        auxBuses.forEach((bus, i) => {
          audioEngine.updateBus(bus, {
            fader: updates.auxMasters![i],
          })
        })
      }

      return newState
    })
    onMasterChange?.(updates)
  }, [onMasterChange, audioEngine])

  // Reset all channels
  const handleResetAll = () => {
    const resetStates: Record<string, ChannelState> = {}
    Object.entries(channelStates).forEach(([id, ch]) => {
      resetStates[id] = {
        ...DEFAULT_CHANNEL,
        id: ch.id,
        label: ch.label,
        color: ch.color,
      }

      // Reset in audio engine too
      if (addedChannelsRef.current.has(id)) {
        audioEngine.updateChannel(id, {
          inputGain: DEFAULT_CHANNEL.inputGain,
          eq: DEFAULT_CHANNEL.eq,
          compressor: {
            ...DEFAULT_CHANNEL.compressor,
            attack: DEFAULT_CHANNEL.compressor.attack / 1000,
            release: DEFAULT_CHANNEL.compressor.release / 1000,
          },
          pan: DEFAULT_CHANNEL.pan,
          fader: DEFAULT_CHANNEL.fader,
          mute: DEFAULT_CHANNEL.mute,
          solo: DEFAULT_CHANNEL.solo,
          pfl: DEFAULT_CHANNEL.pfl,
          busAssignment: DEFAULT_CHANNEL.busAssignment,
        })
      }
    })
    setChannelStates(resetStates)
    setMasterState(DEFAULT_MASTER)

    // Reset buses too
    audioEngine.updateBus('PGM', { fader: 1.0, mute: false })
    audioEngine.updateBus('TB', { fader: 1.0, mute: false })
  }

  // Clear all solos
  const handleClearSolos = useCallback(() => {
    setChannelStates(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        next[id] = { ...next[id], solo: false }
        // Sync to audio engine
        if (addedChannelsRef.current.has(id)) {
          audioEngine.updateChannel(id, { solo: false })
        }
      })
      return next
    })
  }, [audioEngine])

  // Toggle channel mute by index (for keyboard shortcuts)
  const toggleChannelMuteByIndex = useCallback((index: number) => {
    const channelIds = Object.keys(channelStates)
    if (index >= 0 && index < channelIds.length) {
      const id = channelIds[index]
      const currentMute = channelStates[id]?.mute ?? false
      handleChannelChange(id, { mute: !currentMute })
    }
  }, [channelStates, handleChannelChange])

  // Toggle channel solo by index (for keyboard shortcuts)
  const toggleChannelSoloByIndex = useCallback((index: number) => {
    const channelIds = Object.keys(channelStates)
    if (index >= 0 && index < channelIds.length) {
      const id = channelIds[index]
      const currentSolo = channelStates[id]?.solo ?? false
      handleChannelChange(id, { solo: !currentSolo })
    }
  }, [channelStates, handleChannelChange])

  // Toggle master PGM mute (for keyboard shortcuts)
  const toggleMasterMute = useCallback(() => {
    handleMasterChange({ pgmMute: !masterState.pgmMute })
  }, [masterState.pgmMute, handleMasterChange])

  // Update channel bus routing (for routing matrix)
  const updateChannelRouting = useCallback((channelId: string, busType: BusType, enabled: boolean) => {
    const channel = channelStates[channelId]
    if (!channel) return

    const currentAssignments = channel.busAssignment
    let newAssignments: BusAssignment[]

    if (enabled) {
      // Add bus to assignment if not already present
      if (!currentAssignments.includes(busType)) {
        newAssignments = [...currentAssignments, busType]
      } else {
        return // Already assigned
      }
    } else {
      // Remove bus from assignment
      newAssignments = currentAssignments.filter(b => b !== busType)
    }

    handleChannelChange(channelId, { busAssignment: newAssignments })
  }, [channelStates, handleChannelChange])

  // Get all channel states (for routing matrix)
  const getChannelStates = useCallback(() => channelStates, [channelStates])

  // Update aux send level (for routing matrix)
  const updateAuxSend = useCallback((channelId: string, busType: BusType, level: number) => {
    const channel = channelStates[channelId]
    if (!channel) return

    // Map bus type to auxSends array index
    const busToIndex: Record<BusType, number | null> = {
      PGM: null, // PGM doesn't use auxSends
      TB: null,  // TB doesn't use auxSends
      AUX1: 0,
      AUX2: 1,
      AUX3: 2,
      AUX4: 3,
    }

    const index = busToIndex[busType]
    if (index === null) return // PGM/TB don't have send levels

    const newAuxSends = [...channel.auxSends] as [number, number, number, number]
    newAuxSends[index] = level
    handleChannelChange(channelId, { auxSends: newAuxSends })
  }, [channelStates, handleChannelChange])

  // Expose control interface to parent
  useEffect(() => {
    if (onControlsReady) {
      onControlsReady({
        toggleChannelMute: toggleChannelMuteByIndex,
        toggleChannelSolo: toggleChannelSoloByIndex,
        clearAllSolos: handleClearSolos,
        toggleMasterMute,
        getChannelCount: () => Object.keys(channelStates).length,
        updateChannelRouting,
        getChannelStates,
        updateAuxSend,
      })
    }
  }, [onControlsReady, toggleChannelMuteByIndex, toggleChannelSoloByIndex, handleClearSolos, toggleMasterMute, channelStates, updateChannelRouting, getChannelStates, updateAuxSend])

  // Expose audio engine functions for bus output production
  useEffect(() => {
    if (onAudioEngineReady && audioEngine.isInitialized()) {
      onAudioEngineReady({
        getBusOutputStream: audioEngine.getBusOutputStream,
        isInitialized: audioEngine.isInitialized,
        isRunning: audioEngine.isRunning,
      })
    }
  }, [onAudioEngineReady, audioEngine])

  // Don't render if modal mode and not open
  if (!embedded && !isOpen) return null

  return (
    <div className={embedded
      ? "flex flex-col h-full bg-gray-950"
      : "fixed inset-0 z-50 flex flex-col bg-gray-950"
    }>
      {/* Header - compact for embedded mode */}
      <div className={`flex items-center justify-between px-3 bg-gray-900 border-b border-gray-800 ${embedded ? 'h-8' : 'h-10'}`}>
        <div className="flex items-center gap-3">
          <h1 className={`font-mono font-bold text-white tracking-wider ${embedded ? 'text-xs' : 'text-sm'}`}>
            {embedded ? 'MIXER' : 'PRO MIXER'}
          </h1>
          <span className="text-[10px] font-mono text-gray-500 bg-gray-800 px-2 py-0.5">
            {inputChannels.length} CH
          </span>
          {hasSolo && (
            <span className="text-[10px] font-mono text-yellow-400 bg-yellow-500/20 px-2 py-0.5 animate-pulse">
              SOLO
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasSolo && (
            <button
              onClick={handleClearSolos}
              className="text-[10px] font-mono font-bold text-yellow-400 bg-yellow-600/20 px-2 py-1 hover:bg-yellow-600/30"
            >
              CLR SOLO
            </button>
          )}
          <button
            onClick={handleResetAll}
            className="text-[10px] font-mono font-bold text-gray-400 bg-gray-800 px-2 py-1 hover:bg-gray-700"
          >
            RESET
          </button>
          {!embedded && onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main mixer area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Channel strips (scrollable) */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full">
            {inputChannels.map(ch => {
              const state = channelStates[ch.id]
              if (!state) return null
              return (
                <ChannelStrip
                  key={ch.id}
                  channel={state}
                  onChange={updates => handleChannelChange(ch.id, updates)}
                  soloActive={hasSolo && !state.solo}
                  expanded={expandedChannel === ch.id}
                  onExpandToggle={() => setExpandedChannel(
                    expandedChannel === ch.id ? null : ch.id
                  )}
                />
              )
            })}

            {/* Empty state */}
            {inputChannels.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-gray-600">
                <div className="text-center">
                  <svg className="w-16 h-16 mx-auto mb-2 opacity-50" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="font-mono text-sm">NO INPUT CHANNELS</p>
                  <p className="font-mono text-xs text-gray-700">Waiting for participants...</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Master section (fixed right) */}
        <MasterSection
          master={masterState}
          onChange={handleMasterChange}
          hasSolo={hasSolo}
          hasPFL={hasPFL}
          pgmAnalysers={pgmAnalysers ?? undefined}
          showR128Meter={showR128Meter}
          onToggleR128Meter={() => setShowR128Meter(prev => !prev)}
        />
      </div>

      {/* Footer - hidden in embedded mode */}
      {!embedded && (
        <div className="h-6 flex items-center justify-between px-3 bg-gray-900 border-t border-gray-800">
          <span className="text-[9px] font-mono text-gray-600">
            STREAMVU PRO MIXER v1.0
          </span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowR128Meter(prev => !prev)}
              className={`text-[9px] font-mono px-2 py-0.5 rounded ${
                showR128Meter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-500 hover:bg-gray-700 hover:text-gray-300'
              }`}
            >
              R128 LUFS
            </button>
            <span className="text-[9px] font-mono text-gray-600">
              Click channel name to expand • Double-click knobs to reset
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProMixer
