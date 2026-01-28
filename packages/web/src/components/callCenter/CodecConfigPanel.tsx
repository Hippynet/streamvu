import { useState } from 'react'
import type { CodecConfig, AudioCodec } from '../../hooks/useCodecConfig'
import { CODEC_INFO, CODEC_PRESETS } from '../../hooks/useCodecConfig'

interface CodecConfigPanelProps {
  config: CodecConfig
  onConfigChange: (updates: Partial<CodecConfig>) => void
  onApplyPreset: (presetName: string) => void
  onReset: () => void
  estimatedBandwidth?: number
  errors?: string[]
  disabled?: boolean
}

export function CodecConfigPanel({
  config,
  onConfigChange,
  onApplyPreset,
  onReset,
  estimatedBandwidth,
  errors = [],
  disabled = false,
}: CodecConfigPanelProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const codecInfo = CODEC_INFO[config.codec]

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Audio Codec Configuration</h3>
        <button
          onClick={onReset}
          className="text-xs text-gray-400 hover:text-gray-200"
          disabled={disabled}
        >
          Reset to Default
        </button>
      </div>

      {/* Preset selector */}
      <div className="mb-4">
        <label className="mb-1 block text-xs text-gray-400">Preset</label>
        <select
          className="w-full rounded bg-gray-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          onChange={(e) => e.target.value && onApplyPreset(e.target.value)}
          disabled={disabled}
          defaultValue=""
        >
          <option value="">Select preset...</option>
          {Object.keys(CODEC_PRESETS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Codec selection */}
      <div className="mb-4">
        <label className="mb-1 block text-xs text-gray-400">Codec</label>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(CODEC_INFO) as AudioCodec[]).map((codec) => {
            const info = CODEC_INFO[codec]
            const isSelected = config.codec === codec
            return (
              <button
                key={codec}
                onClick={() => onConfigChange({ codec })}
                disabled={disabled}
                className={`rounded border p-2 text-left transition-colors ${
                  isSelected
                    ? 'border-primary-500 bg-primary-900/30'
                    : 'border-gray-600 hover:border-gray-500'
                } ${disabled ? 'opacity-50' : ''}`}
              >
                <div className="text-sm font-medium text-white">{info.name}</div>
                <div className="mt-1 text-xs text-gray-400">{info.description.substring(0, 50)}...</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Basic settings */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        {/* Bitrate */}
        <div>
          <label className="mb-1 block text-xs text-gray-400">
            Bitrate: {config.bitrate} kbps
          </label>
          <input
            type="range"
            min={codecInfo.minBitrate}
            max={codecInfo.maxBitrate}
            value={config.bitrate}
            onChange={(e) => onConfigChange({ bitrate: Number(e.target.value) })}
            disabled={disabled || codecInfo.minBitrate === codecInfo.maxBitrate}
            className="w-full accent-primary-500"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{codecInfo.minBitrate}</span>
            <span>{codecInfo.maxBitrate}</span>
          </div>
        </div>

        {/* Sample rate */}
        <div>
          <label className="mb-1 block text-xs text-gray-400">Sample Rate</label>
          <select
            value={config.sampleRate}
            onChange={(e) => onConfigChange({ sampleRate: Number(e.target.value) })}
            disabled={disabled || codecInfo.sampleRates.length === 1}
            className="w-full rounded bg-gray-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {codecInfo.sampleRates.map((rate) => (
              <option key={rate} value={rate}>
                {rate >= 1000 ? `${rate / 1000} kHz` : `${rate} Hz`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Channels */}
      <div className="mb-4">
        <label className="mb-1 block text-xs text-gray-400">Channels</label>
        <div className="flex gap-2">
          <button
            onClick={() => onConfigChange({ channels: 1 })}
            disabled={disabled}
            className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors ${
              config.channels === 1
                ? 'bg-primary-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            } ${disabled ? 'opacity-50' : ''}`}
          >
            Mono
          </button>
          <button
            onClick={() => onConfigChange({ channels: 2 })}
            disabled={disabled || !codecInfo.supportsStereo}
            className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors ${
              config.channels === 2
                ? 'bg-primary-600 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            } ${disabled || !codecInfo.supportsStereo ? 'opacity-50' : ''}`}
          >
            Stereo
          </button>
        </div>
      </div>

      {/* Feature toggles */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <ToggleSwitch
          label="FEC (Error Correction)"
          checked={config.fecEnabled}
          onChange={(v) => onConfigChange({ fecEnabled: v })}
          disabled={disabled || !codecInfo.supportsFec}
          description="Helps recover from packet loss"
        />
        <ToggleSwitch
          label="DTX (Silence Suppression)"
          checked={config.dtxEnabled}
          onChange={(v) => onConfigChange({ dtxEnabled: v })}
          disabled={disabled || !codecInfo.supportsDtx}
          description="Reduces bandwidth when silent"
        />
        <ToggleSwitch
          label="CBR (Constant Bitrate)"
          checked={config.cbrEnabled}
          onChange={(v) => onConfigChange({ cbrEnabled: v })}
          disabled={disabled || !codecInfo.supportsVbr}
          description="Fixed bitrate vs variable"
        />
      </div>

      {/* Advanced settings toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="mb-3 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
      >
        <svg
          className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Advanced Settings
      </button>

      {/* Advanced settings */}
      {showAdvanced && (
        <div className="space-y-4 rounded bg-gray-750 p-3">
          {/* Frame size */}
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              Frame Size: {config.frameSize} ms
            </label>
            <select
              value={config.frameSize}
              onChange={(e) => onConfigChange({ frameSize: Number(e.target.value) })}
              disabled={disabled}
              className="w-full rounded bg-gray-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {[2.5, 5, 10, 20, 40, 60].map((size) => (
                <option key={size} value={size}>
                  {size} ms {size === 20 ? '(recommended)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Smaller = lower latency, larger = better efficiency
            </p>
          </div>

          {/* Complexity */}
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              Complexity: {config.complexity}
            </label>
            <input
              type="range"
              min={0}
              max={10}
              value={config.complexity}
              onChange={(e) => onConfigChange({ complexity: Number(e.target.value) })}
              disabled={disabled}
              className="w-full accent-primary-500"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Fast (0)</span>
              <span>Best (10)</span>
            </div>
          </div>

          {/* Packet loss percentage for FEC */}
          {config.fecEnabled && (
            <div>
              <label className="mb-1 block text-xs text-gray-400">
                Expected Packet Loss: {config.packetLossPercentage}%
              </label>
              <input
                type="range"
                min={0}
                max={50}
                value={config.packetLossPercentage}
                onChange={(e) => onConfigChange({ packetLossPercentage: Number(e.target.value) })}
                disabled={disabled}
                className="w-full accent-primary-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Higher values increase FEC overhead but improve loss recovery
              </p>
            </div>
          )}
        </div>
      )}

      {/* Estimated bandwidth */}
      {estimatedBandwidth !== undefined && (
        <div className="mt-4 flex items-center justify-between rounded bg-gray-750 px-3 py-2">
          <span className="text-xs text-gray-400">Estimated Bandwidth</span>
          <span className="text-sm font-medium text-white">{estimatedBandwidth} kbps</span>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mt-4 rounded bg-red-900/30 p-3">
          <div className="mb-1 text-xs font-medium text-red-400">Configuration Errors:</div>
          {errors.map((error, i) => (
            <div key={i} className="text-xs text-red-300">
              • {error}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Toggle switch component
interface ToggleSwitchProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  description?: string
}

function ToggleSwitch({ label, checked, onChange, disabled, description }: ToggleSwitchProps) {
  return (
    <div className={`flex items-start gap-2 ${disabled ? 'opacity-50' : ''}`}>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative mt-0.5 h-5 w-9 flex-shrink-0 rounded-full transition-colors ${
          checked ? 'bg-primary-600' : 'bg-gray-600'
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
      <div className="flex-1">
        <div className="text-xs font-medium text-gray-300">{label}</div>
        {description && <div className="text-xs text-gray-500">{description}</div>}
      </div>
    </div>
  )
}

// Compact codec indicator for display in mixer/participant tiles
export function CodecIndicator({
  codec,
  bitrate,
  sampleRate,
  channels,
}: {
  codec: AudioCodec
  bitrate: number
  sampleRate: number
  channels: 1 | 2
}) {
  const info = CODEC_INFO[codec]

  return (
    <div className="inline-flex items-center gap-1 rounded bg-gray-700 px-1.5 py-0.5 text-xs">
      <span className="font-medium text-white">{info.name}</span>
      <span className="text-gray-400">
        {bitrate}k/{sampleRate >= 1000 ? `${sampleRate / 1000}k` : sampleRate}
        {channels === 2 ? '/st' : '/mo'}
      </span>
    </div>
  )
}
