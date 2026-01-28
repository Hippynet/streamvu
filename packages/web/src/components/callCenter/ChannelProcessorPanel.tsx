import { useState, useCallback } from 'react'
import type { ChannelProcessingSettings } from '../../hooks/useChannelProcessing'
import { DEFAULT_PROCESSING } from '../../hooks/useChannelProcessing'

interface ChannelProcessorPanelProps {
  settings: ChannelProcessingSettings
  onUpdateSettings: (settings: Partial<ChannelProcessingSettings>) => void
  onResetSettings: () => void
  bypass: boolean
  onBypassChange: (bypass: boolean) => void
  levels: {
    input: number
    output: number
    gainReduction: number
  }
  channelName?: string
}

type ProcessorSection = 'highpass' | 'eq' | 'compressor' | 'limiter' | 'gate' | 'output'

export function ChannelProcessorPanel({
  settings,
  onUpdateSettings,
  onResetSettings,
  bypass,
  onBypassChange,
  levels,
  channelName = 'Channel',
}: ChannelProcessorPanelProps) {
  const [expandedSection, setExpandedSection] = useState<ProcessorSection | null>('eq')

  const toggleSection = useCallback((section: ProcessorSection) => {
    setExpandedSection((prev) => (prev === section ? null : section))
  }, [])

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-700 bg-gray-800 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-white">{channelName} Processing</h3>
          <button
            onClick={() => onBypassChange(!bypass)}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              bypass
                ? 'bg-yellow-600 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            {bypass ? 'BYPASSED' : 'BYPASS'}
          </button>
        </div>
        <button
          onClick={onResetSettings}
          className="text-xs text-gray-500 hover:text-gray-300"
        >
          Reset
        </button>
      </div>

      {/* Level Meters */}
      <div className="flex items-center gap-4 rounded bg-gray-900 p-2">
        <LevelMeter label="IN" level={levels.input} />
        <LevelMeter label="OUT" level={levels.output} />
        <GainReductionMeter level={levels.gainReduction} />
      </div>

      {/* Processing Sections */}
      <div className="space-y-2">
        {/* High-Pass Filter */}
        <ProcessorSectionHeader
          title="High-Pass Filter"
          enabled={settings.highPassEnabled}
          onToggle={() => onUpdateSettings({ highPassEnabled: !settings.highPassEnabled })}
          expanded={expandedSection === 'highpass'}
          onExpandToggle={() => toggleSection('highpass')}
        />
        {expandedSection === 'highpass' && (
          <div className="rounded bg-gray-900 p-3">
            <div className="flex items-center gap-4">
              <label className="text-xs text-gray-400">Frequency</label>
              <input
                type="range"
                min={20}
                max={1000}
                value={settings.highPassFrequency}
                onChange={(e) => onUpdateSettings({ highPassFrequency: Number(e.target.value) })}
                className="flex-1 accent-primary-500"
                disabled={!settings.highPassEnabled}
              />
              <span className="w-16 text-right text-xs text-gray-300">
                {settings.highPassFrequency} Hz
              </span>
            </div>
          </div>
        )}

        {/* EQ */}
        <ProcessorSectionHeader
          title="3-Band EQ"
          enabled={settings.eqEnabled}
          onToggle={() => onUpdateSettings({ eqEnabled: !settings.eqEnabled })}
          expanded={expandedSection === 'eq'}
          onExpandToggle={() => toggleSection('eq')}
        />
        {expandedSection === 'eq' && (
          <div className="space-y-3 rounded bg-gray-900 p-3">
            {/* Low Shelf */}
            <EQBand
              label="Low"
              frequency={settings.eqLowFrequency}
              gain={settings.eqLowGain}
              onFrequencyChange={(v) => onUpdateSettings({ eqLowFrequency: v })}
              onGainChange={(v) => onUpdateSettings({ eqLowGain: v })}
              freqMin={30}
              freqMax={400}
              disabled={!settings.eqEnabled}
            />
            {/* Mid Peak */}
            <EQBand
              label="Mid"
              frequency={settings.eqMidFrequency}
              gain={settings.eqMidGain}
              q={settings.eqMidQ}
              onFrequencyChange={(v) => onUpdateSettings({ eqMidFrequency: v })}
              onGainChange={(v) => onUpdateSettings({ eqMidGain: v })}
              onQChange={(v) => onUpdateSettings({ eqMidQ: v })}
              freqMin={200}
              freqMax={8000}
              disabled={!settings.eqEnabled}
            />
            {/* High Shelf */}
            <EQBand
              label="High"
              frequency={settings.eqHighFrequency}
              gain={settings.eqHighGain}
              onFrequencyChange={(v) => onUpdateSettings({ eqHighFrequency: v })}
              onGainChange={(v) => onUpdateSettings({ eqHighGain: v })}
              freqMin={2000}
              freqMax={16000}
              disabled={!settings.eqEnabled}
            />
          </div>
        )}

        {/* Compressor */}
        <ProcessorSectionHeader
          title="Compressor"
          enabled={settings.compressorEnabled}
          onToggle={() => onUpdateSettings({ compressorEnabled: !settings.compressorEnabled })}
          expanded={expandedSection === 'compressor'}
          onExpandToggle={() => toggleSection('compressor')}
        />
        {expandedSection === 'compressor' && (
          <div className="space-y-3 rounded bg-gray-900 p-3">
            <div className="grid grid-cols-2 gap-3">
              <ParameterSlider
                label="Threshold"
                value={settings.compressorThreshold}
                min={-60}
                max={0}
                unit="dB"
                onChange={(v) => onUpdateSettings({ compressorThreshold: v })}
                disabled={!settings.compressorEnabled}
              />
              <ParameterSlider
                label="Ratio"
                value={settings.compressorRatio}
                min={1}
                max={20}
                step={0.5}
                unit=":1"
                onChange={(v) => onUpdateSettings({ compressorRatio: v })}
                disabled={!settings.compressorEnabled}
              />
              <ParameterSlider
                label="Attack"
                value={settings.compressorAttack}
                min={0.1}
                max={100}
                step={0.1}
                unit="ms"
                onChange={(v) => onUpdateSettings({ compressorAttack: v })}
                disabled={!settings.compressorEnabled}
              />
              <ParameterSlider
                label="Release"
                value={settings.compressorRelease}
                min={10}
                max={1000}
                unit="ms"
                onChange={(v) => onUpdateSettings({ compressorRelease: v })}
                disabled={!settings.compressorEnabled}
              />
              <ParameterSlider
                label="Knee"
                value={settings.compressorKnee}
                min={0}
                max={30}
                unit="dB"
                onChange={(v) => onUpdateSettings({ compressorKnee: v })}
                disabled={!settings.compressorEnabled}
              />
            </div>
          </div>
        )}

        {/* Limiter */}
        <ProcessorSectionHeader
          title="Limiter"
          enabled={settings.limiterEnabled}
          onToggle={() => onUpdateSettings({ limiterEnabled: !settings.limiterEnabled })}
          expanded={expandedSection === 'limiter'}
          onExpandToggle={() => toggleSection('limiter')}
        />
        {expandedSection === 'limiter' && (
          <div className="rounded bg-gray-900 p-3">
            <ParameterSlider
              label="Threshold"
              value={settings.limiterThreshold}
              min={-20}
              max={0}
              step={0.1}
              unit="dB"
              onChange={(v) => onUpdateSettings({ limiterThreshold: v })}
              disabled={!settings.limiterEnabled}
            />
          </div>
        )}

        {/* Gate */}
        <ProcessorSectionHeader
          title="Noise Gate"
          enabled={settings.gateEnabled}
          onToggle={() => onUpdateSettings({ gateEnabled: !settings.gateEnabled })}
          expanded={expandedSection === 'gate'}
          onExpandToggle={() => toggleSection('gate')}
        />
        {expandedSection === 'gate' && (
          <div className="space-y-3 rounded bg-gray-900 p-3">
            <div className="grid grid-cols-2 gap-3">
              <ParameterSlider
                label="Threshold"
                value={settings.gateThreshold}
                min={-80}
                max={-20}
                unit="dB"
                onChange={(v) => onUpdateSettings({ gateThreshold: v })}
                disabled={!settings.gateEnabled}
              />
              <ParameterSlider
                label="Attack"
                value={settings.gateAttack}
                min={0.1}
                max={50}
                step={0.1}
                unit="ms"
                onChange={(v) => onUpdateSettings({ gateAttack: v })}
                disabled={!settings.gateEnabled}
              />
              <ParameterSlider
                label="Release"
                value={settings.gateRelease}
                min={10}
                max={500}
                unit="ms"
                onChange={(v) => onUpdateSettings({ gateRelease: v })}
                disabled={!settings.gateEnabled}
              />
            </div>
          </div>
        )}

        {/* Output Gain */}
        <ProcessorSectionHeader
          title="Output"
          enabled={true}
          expanded={expandedSection === 'output'}
          onExpandToggle={() => toggleSection('output')}
        />
        {expandedSection === 'output' && (
          <div className="rounded bg-gray-900 p-3">
            <ParameterSlider
              label="Gain"
              value={settings.outputGain}
              min={-20}
              max={20}
              step={0.5}
              unit="dB"
              onChange={(v) => onUpdateSettings({ outputGain: v })}
            />
          </div>
        )}
      </div>
    </div>
  )
}

// Sub-components

interface ProcessorSectionHeaderProps {
  title: string
  enabled: boolean
  onToggle?: () => void
  expanded: boolean
  onExpandToggle: () => void
}

function ProcessorSectionHeader({
  title,
  enabled,
  onToggle,
  expanded,
  onExpandToggle,
}: ProcessorSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between rounded bg-gray-750 px-3 py-2">
      <button
        onClick={onExpandToggle}
        className="flex flex-1 items-center gap-2 text-left"
      >
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className={`text-sm font-medium ${enabled ? 'text-white' : 'text-gray-500'}`}>
          {title}
        </span>
      </button>
      {onToggle && (
        <button
          onClick={onToggle}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            enabled
              ? 'bg-green-600 text-white'
              : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
          }`}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      )}
    </div>
  )
}

interface LevelMeterProps {
  label: string
  level: number // dB
}

function LevelMeter({ label, level }: LevelMeterProps) {
  // Convert dB to percentage (0 dB = 100%, -60 dB = 0%)
  const percentage = Math.max(0, Math.min(100, ((level + 60) / 60) * 100))
  const isClipping = level > -1

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-gray-500">{label}</span>
      <div className="relative h-24 w-3 overflow-hidden rounded-sm bg-gray-700">
        <div
          className={`absolute bottom-0 w-full transition-all ${
            isClipping ? 'bg-red-500' : level > -12 ? 'bg-yellow-500' : 'bg-green-500'
          }`}
          style={{ height: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-400">{level.toFixed(0)}</span>
    </div>
  )
}

interface GainReductionMeterProps {
  level: number // dB of reduction (positive value)
}

function GainReductionMeter({ level }: GainReductionMeterProps) {
  // GR is shown inverted (0 = no reduction, goes up as reduction increases)
  const percentage = Math.min(100, (level / 20) * 100)

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs text-gray-500">GR</span>
      <div className="relative h-24 w-3 overflow-hidden rounded-sm bg-gray-700">
        <div
          className="absolute top-0 w-full bg-orange-500 transition-all"
          style={{ height: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-400">-{level.toFixed(0)}</span>
    </div>
  )
}

interface EQBandProps {
  label: string
  frequency: number
  gain: number
  q?: number
  onFrequencyChange: (value: number) => void
  onGainChange: (value: number) => void
  onQChange?: (value: number) => void
  freqMin: number
  freqMax: number
  disabled?: boolean
}

function EQBand({
  label,
  frequency,
  gain,
  q,
  onFrequencyChange,
  onGainChange,
  onQChange,
  freqMin,
  freqMax,
  disabled,
}: EQBandProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-400">{label}</span>
        <span className="text-xs text-gray-500">
          {frequency >= 1000 ? `${(frequency / 1000).toFixed(1)}k` : frequency} Hz
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <input
            type="range"
            min={freqMin}
            max={freqMax}
            value={frequency}
            onChange={(e) => onFrequencyChange(Number(e.target.value))}
            className="w-full accent-primary-500"
            disabled={disabled}
          />
        </div>
        <div className="w-20">
          <input
            type="range"
            min={-15}
            max={15}
            step={0.5}
            value={gain}
            onChange={(e) => onGainChange(Number(e.target.value))}
            className="w-full accent-primary-500"
            disabled={disabled}
          />
          <div className="text-center text-xs text-gray-400">
            {gain > 0 ? '+' : ''}{gain.toFixed(1)} dB
          </div>
        </div>
        {onQChange && (
          <div className="w-16">
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={q}
              onChange={(e) => onQChange(Number(e.target.value))}
              className="w-full accent-primary-500"
              disabled={disabled}
            />
            <div className="text-center text-xs text-gray-400">Q: {q?.toFixed(1)}</div>
          </div>
        )}
      </div>
    </div>
  )
}

interface ParameterSliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit: string
  onChange: (value: number) => void
  disabled?: boolean
}

function ParameterSlider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  disabled,
}: ParameterSliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-gray-400">{label}</label>
        <span className="text-xs text-gray-300">
          {value.toFixed(step < 1 ? 1 : 0)} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary-500"
        disabled={disabled}
      />
    </div>
  )
}

// Preset system
export const PROCESSING_PRESETS: Record<string, Partial<ChannelProcessingSettings>> = {
  'Vocal - Natural': {
    highPassEnabled: true,
    highPassFrequency: 80,
    eqEnabled: true,
    eqLowGain: -2,
    eqMidFrequency: 2500,
    eqMidGain: 2,
    eqMidQ: 1.5,
    eqHighGain: 1,
    compressorEnabled: true,
    compressorThreshold: -20,
    compressorRatio: 3,
    compressorAttack: 10,
    compressorRelease: 150,
    limiterEnabled: true,
    limiterThreshold: -1,
  },
  'Vocal - Broadcast': {
    highPassEnabled: true,
    highPassFrequency: 100,
    eqEnabled: true,
    eqLowGain: -4,
    eqMidFrequency: 3000,
    eqMidGain: 3,
    eqMidQ: 2,
    eqHighGain: 2,
    compressorEnabled: true,
    compressorThreshold: -18,
    compressorRatio: 4,
    compressorAttack: 5,
    compressorRelease: 100,
    limiterEnabled: true,
    limiterThreshold: -0.5,
    outputGain: 2,
  },
  'Podcast': {
    highPassEnabled: true,
    highPassFrequency: 120,
    eqEnabled: true,
    eqLowGain: -3,
    eqMidFrequency: 2000,
    eqMidGain: 1,
    eqMidQ: 1,
    eqHighGain: 0,
    compressorEnabled: true,
    compressorThreshold: -24,
    compressorRatio: 3,
    compressorAttack: 15,
    compressorRelease: 200,
    gateEnabled: true,
    gateThreshold: -45,
    gateAttack: 5,
    gateRelease: 100,
    limiterEnabled: true,
    limiterThreshold: -1,
  },
  'Music': {
    highPassEnabled: false,
    eqEnabled: false,
    compressorEnabled: false,
    gateEnabled: false,
    limiterEnabled: true,
    limiterThreshold: -0.3,
    outputGain: 0,
  },
  'Clean': {
    ...DEFAULT_PROCESSING,
  },
}
