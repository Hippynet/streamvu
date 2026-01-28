import { useState, useEffect, useRef } from 'react'
import { TestToneButton } from './TestSignalGenerator'

type AudioChannel = 'program' | 'talkback'

interface AudioDevice {
  deviceId: string
  label: string
  kind: MediaDeviceKind
}

interface ProfessionalAudioControlsProps {
  // Connection state
  isConnected: boolean
  isMuted: boolean
  onToggleMute: () => void
  onLeave: () => void

  // Audio devices
  audioInputDevices: AudioDevice[]
  selectedInputDevice: string | null
  onSelectInputDevice: (deviceId: string) => void

  audioOutputDevices: AudioDevice[]
  selectedProgramOutput: string | null
  onSelectProgramOutput: (deviceId: string) => void

  selectedTalkbackOutput: string | null
  onSelectTalkbackOutput: (deviceId: string) => void

  selectedHeadphoneOutput?: string | null
  onSelectHeadphoneOutput?: (deviceId: string) => void

  // Local audio stream for level monitoring
  localStream?: MediaStream | null

  // Channel routing
  participantChannels?: Map<string, AudioChannel>
  onSetAllToProgram?: () => void
  onSetAllToTalkback?: () => void

  // Settings
  isHost?: boolean
  roomName?: string
}

// Clock component for broadcast timecode
function BroadcastClock() {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] font-mono uppercase text-gray-600">Local</span>
      <span className="text-sm font-mono tabular-nums text-white">
        {time.toLocaleTimeString('en-GB', { hour12: false })}
      </span>
    </div>
  )
}

/**
 * Professional audio control panel for broadcast/OB environments
 * Provides clear, intuitive controls for multi-site contribution
 */
export function ProfessionalAudioControls({
  isConnected,
  isMuted,
  onToggleMute,
  onLeave,
  audioInputDevices,
  selectedInputDevice,
  onSelectInputDevice,
  audioOutputDevices,
  selectedProgramOutput,
  onSelectProgramOutput,
  selectedTalkbackOutput,
  onSelectTalkbackOutput,
  selectedHeadphoneOutput: _selectedHeadphoneOutput,
  onSelectHeadphoneOutput: _onSelectHeadphoneOutput,
  localStream,
  onSetAllToProgram,
  onSetAllToTalkback,
  isHost,
  roomName,
}: ProfessionalAudioControlsProps) {
  const [inputLevel, setInputLevel] = useState(0)
  const [peakHold, setPeakHold] = useState(0)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const peakHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Monitor input audio level
  useEffect(() => {
    if (!localStream) return

    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(localStream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.3
    source.connect(analyser)

    let animationId: number

    const checkLevel = () => {
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(dataArray)

      // Calculate RMS
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length)
      const level = rms / 255
      setInputLevel(level)

      // Peak hold
      if (level > peakHold) {
        setPeakHold(level)
        if (peakHoldTimerRef.current) {
          clearTimeout(peakHoldTimerRef.current)
        }
        peakHoldTimerRef.current = setTimeout(() => {
          setPeakHold(0)
        }, 2000)
      }

      animationId = requestAnimationFrame(checkLevel)
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume()
    }

    checkLevel()

    return () => {
      cancelAnimationFrame(animationId)
      source.disconnect()
      audioContext.close()
    }
  }, [localStream, peakHold])

  // Format device label (truncate long names)
  const formatDeviceLabel = (label: string): string => {
    if (label.length > 30) {
      return label.substring(0, 27) + '...'
    }
    return label
  }

  return (
    <div className="border-t border-gray-800 bg-gray-950">
      {/* Compact Control Bar */}
      <div className="flex h-12 items-center gap-1 px-2">
        {/* Clock */}
        <div className="flex-shrink-0 border-r border-gray-800 px-3">
          <BroadcastClock />
        </div>

        {/* Connection Status */}
        <div className="flex-shrink-0 border-r border-gray-800 px-2">
          <div className={`flex items-center gap-1.5 ${isConnected ? 'text-green-500' : 'text-red-500'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-[9px] font-mono uppercase">{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
        </div>

        {/* Input Section */}
        <div className="flex items-center gap-2 border-r border-gray-800 px-2">
          <div className="flex flex-col">
            <span className="text-[8px] font-mono uppercase text-gray-600">INPUT</span>
            <select
              value={selectedInputDevice || ''}
              onChange={(e) => onSelectInputDevice(e.target.value)}
              disabled={!isConnected}
              className="h-6 w-36 border border-gray-800 bg-gray-900 px-1 text-[10px] text-white focus:border-gray-600 focus:outline-none disabled:opacity-50"
            >
              {audioInputDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {formatDeviceLabel(device.label)}
                </option>
              ))}
            </select>
          </div>

          {/* Compact Level Meter */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[8px] font-mono uppercase text-gray-600">LEVEL</span>
            <div className="relative h-4 w-24 overflow-hidden bg-gray-900">
              <div className="absolute inset-0 flex items-center gap-px p-px">
                {Array.from({ length: 16 }).map((_, i) => {
                  const threshold = i / 16
                  const isActive = inputLevel > threshold
                  let bgColor = 'bg-gray-800'
                  if (isActive) {
                    if (i >= 14) bgColor = 'bg-red-500'
                    else if (i >= 11) bgColor = 'bg-yellow-500'
                    else bgColor = 'bg-green-500'
                  }
                  return <div key={i} className={`h-full flex-1 ${bgColor}`} />
                })}
              </div>
              {peakHold > 0 && (
                <div className="absolute top-0 h-full w-px bg-white" style={{ left: `${peakHold * 100}%` }} />
              )}
            </div>
          </div>
        </div>

        {/* MUTE Button - Prominent but compact */}
        <div className="flex-shrink-0 px-2">
          <button
            onClick={onToggleMute}
            disabled={!isConnected}
            className={`flex h-8 items-center gap-1.5 px-3 text-xs font-bold uppercase transition-all ${
              isMuted
                ? 'bg-red-600 text-white shadow-[0_0_12px_rgba(220,38,38,0.5)] hover:bg-red-500'
                : 'bg-green-600 text-white shadow-[0_0_12px_rgba(34,197,94,0.4)] hover:bg-green-500'
            } disabled:opacity-50 disabled:shadow-none`}
            title={isMuted ? 'Click to unmute' : 'Click to mute'}
          >
            {isMuted ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
                </svg>
                MUTED
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
                LIVE
              </>
            )}
          </button>
        </div>

        {/* Output Section */}
        <div className="flex items-center gap-3 border-l border-gray-800 px-2">
          {/* Program Output */}
          <div className="flex flex-col">
            <span className="flex items-center gap-1 text-[8px] font-mono uppercase text-gray-500">
              <span className="h-1 w-1 rounded-full bg-gray-500" />
              PGM OUT
            </span>
            <select
              value={selectedProgramOutput || ''}
              onChange={(e) => onSelectProgramOutput(e.target.value)}
              disabled={!isConnected}
              className="h-6 w-32 border border-gray-800 bg-gray-900 px-1 text-[10px] text-white focus:border-gray-600 focus:outline-none disabled:opacity-50"
            >
              {audioOutputDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {formatDeviceLabel(device.label)}
                </option>
              ))}
            </select>
          </div>

          {/* Talkback Output */}
          <div className="flex flex-col">
            <span className="flex items-center gap-1 text-[8px] font-mono uppercase text-yellow-600">
              <span className="h-1 w-1 rounded-full bg-yellow-500" />
              TB/IFB
            </span>
            <select
              value={selectedTalkbackOutput || ''}
              onChange={(e) => onSelectTalkbackOutput(e.target.value)}
              disabled={!isConnected}
              className="h-6 w-32 border border-yellow-900/50 bg-yellow-950/30 px-1 text-[10px] text-white focus:border-yellow-700 focus:outline-none disabled:opacity-50"
            >
              <option value="">Same as PGM</option>
              {audioOutputDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {formatDeviceLabel(device.label)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-1 border-l border-gray-800 pl-2">
          {/* Test Tone */}
          <TestToneButton />

          {/* Settings Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`flex h-7 w-7 items-center justify-center transition-colors ${
              showAdvanced
                ? 'bg-gray-700 text-white'
                : 'bg-gray-900 text-gray-500 hover:bg-gray-800 hover:text-gray-300'
            }`}
            title="Settings"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Leave Button */}
          <button
            onClick={onLeave}
            className="flex h-7 items-center gap-1 bg-red-900/50 px-2 text-[10px] font-medium uppercase text-red-400 transition-colors hover:bg-red-900/70"
            title="Leave room"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Leave
          </button>
        </div>
      </div>

      {/* Advanced Settings Panel - Compact */}
      {showAdvanced && (
        <div className="flex items-center gap-4 border-t border-gray-800 bg-gray-900/50 px-3 py-1.5">
          {/* Quick Channel Routing */}
          {isHost && (onSetAllToProgram || onSetAllToTalkback) && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-mono uppercase text-gray-600">Route All:</span>
              {onSetAllToProgram && (
                <button
                  onClick={onSetAllToProgram}
                  className="bg-gray-800 px-1.5 py-0.5 text-[9px] font-mono text-gray-400 hover:bg-gray-700 hover:text-white"
                >
                  PGM
                </button>
              )}
              {onSetAllToTalkback && (
                <button
                  onClick={onSetAllToTalkback}
                  className="bg-yellow-950/50 px-1.5 py-0.5 text-[9px] font-mono text-yellow-500 hover:bg-yellow-900/50"
                >
                  TB
                </button>
              )}
            </div>
          )}

          {/* Room Info */}
          {roomName && (
            <div className="ml-auto flex items-center gap-1.5 text-[9px] font-mono">
              <span className="text-gray-600">ROOM:</span>
              <span className="text-gray-400">{roomName}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compact version for smaller screens or simplified view
 */
export function CompactAudioControls({
  isConnected,
  isMuted,
  onToggleMute,
  onLeave,
  audioInputDevices,
  selectedInputDevice,
  onSelectInputDevice,
  audioOutputDevices,
  selectedProgramOutput,
  onSelectProgramOutput,
}: {
  isConnected: boolean
  isMuted: boolean
  onToggleMute: () => void
  onLeave: () => void
  audioInputDevices: AudioDevice[]
  selectedInputDevice: string | null
  onSelectInputDevice: (deviceId: string) => void
  audioOutputDevices: AudioDevice[]
  selectedProgramOutput: string | null
  onSelectProgramOutput: (deviceId: string) => void
}) {
  return (
    <div className="flex items-center justify-center gap-3 border-t border-gray-700 bg-gray-900 px-4 py-3">
      {/* Input Selection */}
      {audioInputDevices.length > 1 && (
        <select
          value={selectedInputDevice || ''}
          onChange={(e) => onSelectInputDevice(e.target.value)}
          disabled={!isConnected}
          className="h-10 rounded-lg bg-gray-700 px-3 text-sm text-white disabled:opacity-50"
        >
          {audioInputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label.length > 20 ? device.label.substring(0, 17) + '...' : device.label}
            </option>
          ))}
        </select>
      )}

      {/* Mute Button */}
      <button
        onClick={onToggleMute}
        disabled={!isConnected}
        className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${
          isMuted
            ? 'bg-red-500 hover:bg-red-600'
            : 'bg-green-600 hover:bg-green-500'
        } disabled:opacity-50`}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? (
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        ) : (
          <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
        )}
      </button>

      {/* Output Selection */}
      {audioOutputDevices.length > 1 && (
        <select
          value={selectedProgramOutput || ''}
          onChange={(e) => onSelectProgramOutput(e.target.value)}
          disabled={!isConnected}
          className="h-10 rounded-lg bg-gray-700 px-3 text-sm text-white disabled:opacity-50"
        >
          {audioOutputDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label.length > 20 ? device.label.substring(0, 17) + '...' : device.label}
            </option>
          ))}
        </select>
      )}

      {/* Leave Button */}
      <button
        onClick={onLeave}
        className="flex h-10 items-center gap-2 rounded-lg bg-red-500 px-4 font-medium text-white transition-all hover:bg-red-600"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
        </svg>
        Leave
      </button>
    </div>
  )
}

/**
 * Audio routing diagram for visual reference
 */
export function AudioRoutingDiagram({
  hasProgram,
  hasTalkback,
  hasHeadphones,
}: {
  hasProgram: boolean
  hasTalkback: boolean
  hasHeadphones: boolean
}) {
  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-4">
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">Audio Routing</h4>
      <div className="flex items-center justify-center gap-4 text-xs">
        {/* Input */}
        <div className="flex flex-col items-center gap-1">
          <div className="rounded bg-blue-600/20 p-2 text-blue-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
            </svg>
          </div>
          <span className="text-gray-400">Input</span>
        </div>

        {/* Arrow */}
        <svg className="h-4 w-8 text-gray-600" fill="none" viewBox="0 0 32 16">
          <path d="M0 8h24m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="2" />
        </svg>

        {/* Processing */}
        <div className="flex flex-col items-center gap-1">
          <div className="rounded bg-purple-600/20 p-2 text-purple-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
            </svg>
          </div>
          <span className="text-gray-400">Mixer</span>
        </div>

        {/* Arrow */}
        <svg className="h-4 w-8 text-gray-600" fill="none" viewBox="0 0 32 16">
          <path d="M0 8h24m0 0l-6-6m6 6l-6 6" stroke="currentColor" strokeWidth="2" />
        </svg>

        {/* Outputs */}
        <div className="flex gap-2">
          <div className={`flex flex-col items-center gap-1 ${hasProgram ? 'opacity-100' : 'opacity-30'}`}>
            <div className="rounded bg-primary-600/20 p-2 text-primary-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424" />
              </svg>
            </div>
            <span className="text-gray-400">PGM</span>
          </div>

          <div className={`flex flex-col items-center gap-1 ${hasTalkback ? 'opacity-100' : 'opacity-30'}`}>
            <div className="rounded bg-yellow-600/20 p-2 text-yellow-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09" />
              </svg>
            </div>
            <span className="text-gray-400">TB</span>
          </div>

          {hasHeadphones && (
            <div className="flex flex-col items-center gap-1">
              <div className="rounded bg-gray-600/20 p-2 text-gray-400">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" />
                </svg>
              </div>
              <span className="text-gray-400">HP</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
