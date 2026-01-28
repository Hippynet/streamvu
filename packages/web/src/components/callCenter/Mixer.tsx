import { useState, useCallback, useRef, useEffect } from 'react'
import { MixerChannel } from './MixerChannel'
import { LoudnessMeter } from './LoudnessMeter'
import { ChannelProcessorPanel, PROCESSING_PRESETS } from './ChannelProcessorPanel'
import { MixerLayoutSwitcherCompact } from './MixerLayoutSwitcher'
import { useLayoutStore } from '../../stores/layoutStore'
import type { ChannelProcessingSettings } from '../../hooks/useChannelProcessing'
import { DEFAULT_PROCESSING } from '../../hooks/useChannelProcessing'

type AudioChannel = 'program' | 'talkback'

interface Participant {
  participantId: string
  displayName: string
  stream?: MediaStream
  isMuted?: boolean
}

interface MixerSettings {
  volume: number
  pan: number
  muted: boolean
  solo: boolean
}

interface MixerProps {
  localDisplayName: string
  remoteParticipants: Participant[]
  isOpen: boolean
  onClose: () => void
  onSettingsChange?: (participantId: string, settings: Partial<MixerSettings>) => void
  // Channel routing
  participantChannels?: Map<string, AudioChannel>
  onChannelChange?: (participantId: string, channel: AudioChannel) => void
  // Processing
  onProcessingChange?: (participantId: string, settings: Partial<ChannelProcessingSettings>) => void
}

export function Mixer({
  localDisplayName,
  remoteParticipants,
  isOpen,
  onClose,
  onSettingsChange,
  participantChannels,
  onChannelChange,
  onProcessingChange,
}: MixerProps) {
  // Layout preferences
  const { currentLayout } = useLayoutStore()

  // Track mixer settings per participant
  const [mixerSettings, setMixerSettings] = useState<Record<string, MixerSettings>>({})

  // Track processing settings per participant
  const [processingSettings, setProcessingSettings] = useState<Record<string, ChannelProcessingSettings>>({})
  const [processingBypass, setProcessingBypass] = useState<Record<string, boolean>>({})

  // Track which channel's processor panel is open
  const [openProcessorPanel, setOpenProcessorPanel] = useState<string | null>(null)

  // Master section for loudness metering
  const [masterAnalyser, setMasterAnalyser] = useState<AnalyserNode | null>(null)
  const masterContextRef = useRef<AudioContext | null>(null)

  // Track which channels are solo'd
  const soloedChannels = Object.values(mixerSettings).filter((s) => s.solo)
  const hasSoloActive = soloedChannels.length > 0

  const getSettings = useCallback((participantId: string): MixerSettings => {
    return mixerSettings[participantId] || {
      volume: 1.0,
      pan: 0,
      muted: false,
      solo: false,
    }
  }, [mixerSettings])

  const updateSettings = useCallback((participantId: string, updates: Partial<MixerSettings>) => {
    setMixerSettings((prev) => ({
      ...prev,
      [participantId]: {
        ...getSettings(participantId),
        ...updates,
      },
    }))
    onSettingsChange?.(participantId, updates)
  }, [getSettings, onSettingsChange])

  // Reset all channels
  const handleResetAll = useCallback(() => {
    const resetSettings: Record<string, MixerSettings> = {}
    remoteParticipants.forEach((p) => {
      resetSettings[p.participantId] = {
        volume: 1.0,
        pan: 0,
        muted: false,
        solo: false,
      }
    })
    setMixerSettings(resetSettings)
  }, [remoteParticipants])

  // Clear all solos
  const handleClearSolos = useCallback(() => {
    setMixerSettings((prev) => {
      const updated = { ...prev }
      Object.keys(updated).forEach((id) => {
        updated[id] = { ...updated[id], solo: false }
      })
      return updated
    })
  }, [])

  // Get processing settings for a participant
  const getProcessingSettings = useCallback((participantId: string): ChannelProcessingSettings => {
    return processingSettings[participantId] || DEFAULT_PROCESSING
  }, [processingSettings])

  // Update processing settings for a participant
  const updateProcessingSettings = useCallback((participantId: string, updates: Partial<ChannelProcessingSettings>) => {
    setProcessingSettings((prev) => ({
      ...prev,
      [participantId]: {
        ...getProcessingSettings(participantId),
        ...updates,
      },
    }))
    onProcessingChange?.(participantId, updates)
  }, [getProcessingSettings, onProcessingChange])

  // Reset processing for a participant
  const resetProcessingSettings = useCallback((participantId: string) => {
    setProcessingSettings((prev) => ({
      ...prev,
      [participantId]: DEFAULT_PROCESSING,
    }))
    onProcessingChange?.(participantId, DEFAULT_PROCESSING)
  }, [onProcessingChange])

  // Toggle processing bypass for a participant
  const toggleProcessingBypass = useCallback((participantId: string) => {
    setProcessingBypass((prev) => ({
      ...prev,
      [participantId]: !prev[participantId],
    }))
  }, [])

  // Apply preset to a participant
  const applyPreset = useCallback((participantId: string, presetName: string) => {
    const preset = PROCESSING_PRESETS[presetName]
    if (preset) {
      const fullSettings = { ...DEFAULT_PROCESSING, ...preset }
      setProcessingSettings((prev) => ({
        ...prev,
        [participantId]: fullSettings,
      }))
      onProcessingChange?.(participantId, fullSettings)
    }
  }, [onProcessingChange])

  // Set up master analyser
  useEffect(() => {
    if (!isOpen) return

    const audioContext = new AudioContext()
    masterContextRef.current = audioContext
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 2048
    setMasterAnalyser(analyser)

    return () => {
      audioContext.close()
      setMasterAnalyser(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />

      {/* Mixer Panel */}
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-4xl flex-col rounded-t-xl border border-gray-700 bg-gray-900 shadow-2xl sm:rounded-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-white">Audio Mixer</h2>
            <span className="rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-400">
              {remoteParticipants.length + 1} channels
            </span>
            {hasSoloActive && (
              <span className="rounded bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-400">
                Solo active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <MixerLayoutSwitcherCompact className="mr-2" />
            {hasSoloActive && (
              <button
                onClick={handleClearSolos}
                className="rounded bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-500"
              >
                Clear Solos
              </button>
            )}
            <button
              onClick={handleResetAll}
              className="rounded bg-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-600"
            >
              Reset All
            </button>
            <button
              onClick={onClose}
              className="rounded p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Channels */}
          <div className="flex-1 overflow-x-auto overflow-y-auto p-4">
            <div className="flex gap-3">
              {/* Local channel (display only, no audio processing) */}
              <div
                className="flex flex-col items-center rounded-lg border border-primary-600 bg-gray-800 p-3"
                style={{ width: currentLayout.channelWidth }}
              >
                <div className="mb-2 w-full truncate text-center text-sm font-medium text-white" title={localDisplayName}>
                  {localDisplayName}
                </div>
                <span className="text-xs text-primary-400">(You)</span>

                {/* Placeholder VU meter */}
                <div
                  className="my-3 flex w-6 flex-col-reverse gap-0.5 rounded bg-gray-900 p-1"
                  style={{ height: currentLayout.meterHeight }}
                >
                  {Array.from({ length: Math.floor(currentLayout.meterHeight / 16) }).map((_, i) => (
                    <div key={i} className="h-3 w-full rounded-sm bg-gray-700" />
                  ))}
                </div>

                {/* Local volume indicator */}
                <div className="text-center text-xs text-gray-500">
                  <p>Local mic</p>
                  <p>100%</p>
                </div>
              </div>

              {/* Remote participant channels */}
              {remoteParticipants.map((participant) => {
                const settings = getSettings(participant.participantId)
                const channel = participantChannels?.get(participant.participantId) || 'program'
                const isProcessorOpen = openProcessorPanel === participant.participantId
                return (
                  <div key={participant.participantId} className="flex flex-col gap-2">
                    <MixerChannel
                      participantId={participant.participantId}
                      displayName={participant.displayName}
                      stream={participant.stream}
                      initialVolume={settings.volume}
                      initialPan={settings.pan}
                      initialMuted={settings.muted}
                      initialSolo={settings.solo}
                      soloActive={hasSoloActive && !settings.solo}
                      channel={channel}
                      onVolumeChange={(volume) => updateSettings(participant.participantId, { volume })}
                      onPanChange={(pan) => updateSettings(participant.participantId, { pan })}
                      onMuteChange={(muted) => updateSettings(participant.participantId, { muted })}
                      onSoloChange={(solo) => updateSettings(participant.participantId, { solo })}
                      onChannelChange={(newChannel) => onChannelChange?.(participant.participantId, newChannel)}
                      // Layout configuration from store
                      channelWidth={currentLayout.channelWidth}
                      meterHeight={currentLayout.meterHeight}
                      showPan={currentLayout.showPan}
                    />
                    {/* Processing toggle button */}
                    <button
                      onClick={() => setOpenProcessorPanel(isProcessorOpen ? null : participant.participantId)}
                      className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                        isProcessorOpen
                          ? 'bg-primary-600 text-white'
                          : processingBypass[participant.participantId]
                          ? 'bg-yellow-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      <svg className="mx-auto h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                      </svg>
                    </button>
                  </div>
                )
              })}

              {/* Empty state */}
              {remoteParticipants.length === 0 && (
                <div className="flex h-64 flex-1 items-center justify-center text-gray-500">
                  <div className="text-center">
                    <svg className="mx-auto h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                    </svg>
                    <p className="mt-2">No other participants</p>
                    <p className="text-sm">Waiting for others to join...</p>
                  </div>
                </div>
              )}

              {/* Master Section */}
              <div className="ml-4 flex flex-col gap-2 border-l border-gray-700 pl-4">
                <div className="text-center text-sm font-medium text-white">Master</div>
                <LoudnessMeter
                  analyserNode={masterAnalyser}
                  targetLUFS={-14}
                  showPeakHold
                  size="md"
                />
              </div>
            </div>
          </div>

          {/* Processing Panel (slide out) */}
          {openProcessorPanel && (
            <div className="w-80 flex-shrink-0 overflow-y-auto border-l border-gray-700 bg-gray-850 p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-white">
                  Processing: {remoteParticipants.find(p => p.participantId === openProcessorPanel)?.displayName}
                </h3>
                <button
                  onClick={() => setOpenProcessorPanel(null)}
                  className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Preset selector */}
              <div className="mb-3">
                <label className="mb-1 block text-xs text-gray-400">Presets</label>
                <select
                  className="w-full rounded bg-gray-700 px-2 py-1.5 text-sm text-white"
                  onChange={(e) => {
                    if (e.target.value && openProcessorPanel) {
                      applyPreset(openProcessorPanel, e.target.value)
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select preset...</option>
                  {Object.keys(PROCESSING_PRESETS).map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>

              <ChannelProcessorPanel
                settings={getProcessingSettings(openProcessorPanel)}
                onUpdateSettings={(updates) => updateProcessingSettings(openProcessorPanel, updates)}
                onResetSettings={() => resetProcessingSettings(openProcessorPanel)}
                bypass={processingBypass[openProcessorPanel] || false}
                onBypassChange={() => toggleProcessingBypass(openProcessorPanel)}
                levels={{ input: -20, output: -18, gainReduction: 2 }} // Placeholder - real values from hook
                channelName={remoteParticipants.find(p => p.participantId === openProcessorPanel)?.displayName}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 px-4 py-2">
          <p className="text-xs text-gray-500">
            Tip: Use Solo (S) to listen to only that participant. Mute (M) to silence them. Click the sliders icon to access per-channel processing.
          </p>
        </div>
      </div>
    </div>
  )
}
