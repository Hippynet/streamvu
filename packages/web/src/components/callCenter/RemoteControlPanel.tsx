/**
 * RemoteControlPanel - Producer interface for remote audio control
 *
 * Allows producers to remotely adjust contributor's audio settings
 * including gain, mute, EQ, compressor, and gate settings.
 */

import { useState, useCallback } from 'react'
import type { RemoteControlState } from '@streamvu/shared'

interface RemoteControlPanelProps {
  /** Target participant ID */
  participantId: string
  /** Target participant name */
  participantName: string
  /** Current state (if known) */
  currentState?: Partial<RemoteControlState>
  /** Set remote gain */
  onSetGain: (participantId: string, gain: number) => Promise<void>
  /** Set remote mute */
  onSetMute: (participantId: string, muted: boolean) => Promise<void>
  /** Set remote EQ */
  onSetEQ: (participantId: string, eq: Partial<RemoteControlState['eq']>) => Promise<void>
  /** Set remote compressor */
  onSetCompressor: (participantId: string, compressor: Partial<RemoteControlState['compressor']>) => Promise<void>
  /** Set remote gate */
  onSetGate: (participantId: string, gate: Partial<RemoteControlState['gate']>) => Promise<void>
  /** Reset remote control */
  onReset: (participantId: string) => Promise<void>
  /** Request state from participant */
  onRequestState?: (participantId: string) => void
  /** Whether the panel is expanded */
  expanded?: boolean
  /** Toggle expanded state */
  onToggleExpanded?: () => void
}

// Default values
const DEFAULT_STATE: Omit<RemoteControlState, 'participantId'> = {
  gain: 1.0,
  muted: false,
  eq: {
    lowGain: 0,
    midGain: 0,
    highGain: 0,
    lowFreq: 80,
    midFreq: 1000,
    highFreq: 8000,
  },
  compressor: {
    threshold: -24,
    ratio: 4,
    attack: 10,
    release: 100,
    makeupGain: 0,
    enabled: false,
  },
  gate: {
    threshold: -50,
    attack: 1,
    hold: 50,
    release: 100,
    enabled: false,
  },
}

export function RemoteControlPanel({
  participantId,
  participantName,
  currentState,
  onSetGain,
  onSetMute,
  onSetEQ,
  onSetCompressor,
  onSetGate,
  onReset,
  onRequestState,
  expanded = false,
  onToggleExpanded,
}: RemoteControlPanelProps) {
  const [activeTab, setActiveTab] = useState<'gain' | 'eq' | 'dynamics'>('gain')
  const [isUpdating, setIsUpdating] = useState(false)

  // Merge current state with defaults
  const state = {
    ...DEFAULT_STATE,
    ...currentState,
    eq: { ...DEFAULT_STATE.eq, ...currentState?.eq },
    compressor: { ...DEFAULT_STATE.compressor, ...currentState?.compressor },
    gate: { ...DEFAULT_STATE.gate, ...currentState?.gate },
  }

  // Convert gain to dB for display
  const gainToDb = (gain: number) => {
    if (gain === 0) return -Infinity
    return 20 * Math.log10(gain)
  }

  const dbToGain = (db: number) => {
    return Math.pow(10, db / 20)
  }

  const handleGainChange = useCallback(async (gain: number) => {
    setIsUpdating(true)
    try {
      await onSetGain(participantId, gain)
    } finally {
      setIsUpdating(false)
    }
  }, [participantId, onSetGain])

  const handleMuteToggle = useCallback(async () => {
    setIsUpdating(true)
    try {
      await onSetMute(participantId, !state.muted)
    } finally {
      setIsUpdating(false)
    }
  }, [participantId, state.muted, onSetMute])

  const handleEQChange = useCallback(async (key: keyof RemoteControlState['eq'], value: number) => {
    setIsUpdating(true)
    try {
      await onSetEQ(participantId, { [key]: value })
    } finally {
      setIsUpdating(false)
    }
  }, [participantId, onSetEQ])

  const handleCompressorChange = useCallback(async (key: keyof RemoteControlState['compressor'], value: number | boolean) => {
    setIsUpdating(true)
    try {
      await onSetCompressor(participantId, { [key]: value })
    } finally {
      setIsUpdating(false)
    }
  }, [participantId, onSetCompressor])

  const handleGateChange = useCallback(async (key: keyof RemoteControlState['gate'], value: number | boolean) => {
    setIsUpdating(true)
    try {
      await onSetGate(participantId, { [key]: value })
    } finally {
      setIsUpdating(false)
    }
  }, [participantId, onSetGate])

  const handleReset = useCallback(async () => {
    setIsUpdating(true)
    try {
      await onReset(participantId)
    } finally {
      setIsUpdating(false)
    }
  }, [participantId, onReset])

  if (!expanded) {
    return (
      <button
        onClick={onToggleExpanded}
        className="flex items-center gap-2 px-2 py-1 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
        title="Remote Control"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        RC
      </button>
    )
  }

  return (
    <div className="border border-gray-700 bg-gray-900 rounded-none shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 bg-gray-950 px-3 py-2">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
              Remote Control
            </div>
            <div className="text-xs font-medium text-white truncate max-w-[150px]">
              {participantName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onRequestState && (
            <button
              onClick={() => onRequestState(participantId)}
              className="p-1 text-gray-500 hover:text-white"
              title="Refresh state"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          )}
          <button
            onClick={handleReset}
            className="p-1 text-gray-500 hover:text-amber-400"
            title="Reset all settings"
            disabled={isUpdating}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
            </svg>
          </button>
          {onToggleExpanded && (
            <button
              onClick={onToggleExpanded}
              className="p-1 text-gray-500 hover:text-white"
              title="Close"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        <button
          onClick={() => setActiveTab('gain')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'gain'
              ? 'bg-gray-800 text-white border-b-2 border-amber-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Gain
        </button>
        <button
          onClick={() => setActiveTab('eq')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'eq'
              ? 'bg-gray-800 text-white border-b-2 border-amber-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          EQ
        </button>
        <button
          onClick={() => setActiveTab('dynamics')}
          className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
            activeTab === 'dynamics'
              ? 'bg-gray-800 text-white border-b-2 border-amber-500'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          Dynamics
        </button>
      </div>

      {/* Content */}
      <div className="p-3">
        {/* Gain Tab */}
        {activeTab === 'gain' && (
          <div className="space-y-4">
            {/* Mute Button */}
            <button
              onClick={handleMuteToggle}
              disabled={isUpdating}
              className={`w-full py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                state.muted
                  ? 'bg-red-600 text-white hover:bg-red-500'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              {state.muted ? '🔇 MUTED' : '🔊 UNMUTED'}
            </button>

            {/* Gain Slider */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Input Gain
                </label>
                <span className="text-xs font-mono text-gray-400">
                  {gainToDb(state.gain).toFixed(1)} dB
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={state.gain}
                onChange={(e) => handleGainChange(parseFloat(e.target.value))}
                disabled={isUpdating}
                className="w-full h-2 bg-gray-700 rounded-none appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>-∞</span>
                <span>0dB</span>
                <span>+6dB</span>
              </div>
            </div>

            {/* Quick Gain Buttons */}
            <div className="flex gap-1">
              {[-6, -3, 0, 3, 6].map((db) => (
                <button
                  key={db}
                  onClick={() => handleGainChange(dbToGain(db))}
                  disabled={isUpdating}
                  className={`flex-1 py-1 text-[10px] font-mono transition-colors ${
                    Math.abs(gainToDb(state.gain) - db) < 0.5
                      ? 'bg-amber-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {db > 0 ? `+${db}` : db}dB
                </button>
              ))}
            </div>
          </div>
        )}

        {/* EQ Tab */}
        {activeTab === 'eq' && (
          <div className="space-y-3">
            {/* Low */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Low ({state.eq.lowFreq}Hz)
                </label>
                <span className="text-xs font-mono text-gray-400">
                  {state.eq.lowGain > 0 ? '+' : ''}{state.eq.lowGain}dB
                </span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={state.eq.lowGain}
                onChange={(e) => handleEQChange('lowGain', parseFloat(e.target.value))}
                disabled={isUpdating}
                className="w-full h-2 bg-gray-700 rounded-none appearance-none cursor-pointer"
              />
            </div>

            {/* Mid */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Mid ({state.eq.midFreq}Hz)
                </label>
                <span className="text-xs font-mono text-gray-400">
                  {state.eq.midGain > 0 ? '+' : ''}{state.eq.midGain}dB
                </span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={state.eq.midGain}
                onChange={(e) => handleEQChange('midGain', parseFloat(e.target.value))}
                disabled={isUpdating}
                className="w-full h-2 bg-gray-700 rounded-none appearance-none cursor-pointer"
              />
            </div>

            {/* High */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  High ({state.eq.highFreq}Hz)
                </label>
                <span className="text-xs font-mono text-gray-400">
                  {state.eq.highGain > 0 ? '+' : ''}{state.eq.highGain}dB
                </span>
              </div>
              <input
                type="range"
                min={-12}
                max={12}
                step={0.5}
                value={state.eq.highGain}
                onChange={(e) => handleEQChange('highGain', parseFloat(e.target.value))}
                disabled={isUpdating}
                className="w-full h-2 bg-gray-700 rounded-none appearance-none cursor-pointer"
              />
            </div>

            {/* Reset EQ Button */}
            <button
              onClick={() => onSetEQ(participantId, DEFAULT_STATE.eq)}
              disabled={isUpdating}
              className="w-full py-1 text-[10px] font-mono uppercase tracking-wider bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
            >
              Reset EQ
            </button>
          </div>
        )}

        {/* Dynamics Tab */}
        {activeTab === 'dynamics' && (
          <div className="space-y-4">
            {/* Compressor */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Compressor
                </span>
                <button
                  onClick={() => handleCompressorChange('enabled', !state.compressor.enabled)}
                  disabled={isUpdating}
                  className={`px-2 py-0.5 text-[9px] font-bold uppercase transition-colors ${
                    state.compressor.enabled
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {state.compressor.enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {state.compressor.enabled && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-gray-500">Thresh</label>
                    <input
                      type="range"
                      min={-60}
                      max={0}
                      value={state.compressor.threshold}
                      onChange={(e) => handleCompressorChange('threshold', parseFloat(e.target.value))}
                      disabled={isUpdating}
                      className="w-full h-1 bg-gray-700 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] text-gray-400">{state.compressor.threshold}dB</span>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-500">Ratio</label>
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={state.compressor.ratio}
                      onChange={(e) => handleCompressorChange('ratio', parseFloat(e.target.value))}
                      disabled={isUpdating}
                      className="w-full h-1 bg-gray-700 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] text-gray-400">{state.compressor.ratio}:1</span>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-500">Attack</label>
                    <input
                      type="range"
                      min={0.1}
                      max={100}
                      value={state.compressor.attack}
                      onChange={(e) => handleCompressorChange('attack', parseFloat(e.target.value))}
                      disabled={isUpdating}
                      className="w-full h-1 bg-gray-700 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] text-gray-400">{state.compressor.attack}ms</span>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-500">Release</label>
                    <input
                      type="range"
                      min={10}
                      max={1000}
                      value={state.compressor.release}
                      onChange={(e) => handleCompressorChange('release', parseFloat(e.target.value))}
                      disabled={isUpdating}
                      className="w-full h-1 bg-gray-700 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] text-gray-400">{state.compressor.release}ms</span>
                  </div>
                </div>
              )}
            </div>

            {/* Gate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                  Noise Gate
                </span>
                <button
                  onClick={() => handleGateChange('enabled', !state.gate.enabled)}
                  disabled={isUpdating}
                  className={`px-2 py-0.5 text-[9px] font-bold uppercase transition-colors ${
                    state.gate.enabled
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {state.gate.enabled ? 'ON' : 'OFF'}
                </button>
              </div>

              {state.gate.enabled && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-gray-500">Thresh</label>
                    <input
                      type="range"
                      min={-100}
                      max={0}
                      value={state.gate.threshold}
                      onChange={(e) => handleGateChange('threshold', parseFloat(e.target.value))}
                      disabled={isUpdating}
                      className="w-full h-1 bg-gray-700 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] text-gray-400">{state.gate.threshold}dB</span>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-500">Attack</label>
                    <input
                      type="range"
                      min={0.1}
                      max={50}
                      value={state.gate.attack}
                      onChange={(e) => handleGateChange('attack', parseFloat(e.target.value))}
                      disabled={isUpdating}
                      className="w-full h-1 bg-gray-700 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] text-gray-400">{state.gate.attack}ms</span>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-500">Hold</label>
                    <input
                      type="range"
                      min={0}
                      max={500}
                      value={state.gate.hold}
                      onChange={(e) => handleGateChange('hold', parseFloat(e.target.value))}
                      disabled={isUpdating}
                      className="w-full h-1 bg-gray-700 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] text-gray-400">{state.gate.hold}ms</span>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-500">Release</label>
                    <input
                      type="range"
                      min={10}
                      max={1000}
                      value={state.gate.release}
                      onChange={(e) => handleGateChange('release', parseFloat(e.target.value))}
                      disabled={isUpdating}
                      className="w-full h-1 bg-gray-700 rounded-none appearance-none cursor-pointer"
                    />
                    <span className="text-[9px] text-gray-400">{state.gate.release}ms</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Loading overlay */}
      {isUpdating && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}

export default RemoteControlPanel
