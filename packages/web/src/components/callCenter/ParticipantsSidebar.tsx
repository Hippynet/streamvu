import { useEffect, useState, useRef, useCallback } from 'react'

const DEFAULT_WIDTH = 224 // w-56
const MIN_WIDTH = 160
const MAX_WIDTH = 400
const COLLAPSED_WIDTH = 48

/** VS Code-style tooltip component for sidebar items */
function SidebarTooltip({ label, visible }: { label: string; visible: boolean }) {
  if (!visible) return null

  return (
    <div
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap"
      role="tooltip"
    >
      <div className="relative rounded bg-gray-800 px-2 py-1 text-xs text-white shadow-lg">
        {label}
        {/* Arrow pointing left */}
        <div className="absolute left-0 top-1/2 -translate-x-full -translate-y-1/2">
          <div className="border-4 border-transparent border-r-gray-800" />
        </div>
      </div>
    </div>
  )
}

interface ParticipantsSidebarProps {
  displayName: string
  localStream: MediaStream | null
  isMuted: boolean
  localIsSpeaking: boolean
  remoteParticipants: Array<{
    participantId: string
    displayName: string
    isSpeaking: boolean
    isMuted: boolean
    stream?: MediaStream
    timeZoneOffset?: number // UTC offset in minutes
  }>
  isHost: boolean
  kickingParticipant: string | null
  onKickParticipant: (participantId: string) => void
  onRegisterAudio: (participantId: string, element: HTMLAudioElement | null) => void
  /** Channel IDs that are currently on-air (routed to PGM and active) */
  onAirChannelIds?: string[]
}

export function ParticipantsSidebar({
  displayName,
  localStream,
  isMuted,
  localIsSpeaking,
  remoteParticipants,
  isHost,
  kickingParticipant,
  onKickParticipant,
  onRegisterAudio,
  onAirChannelIds = [],
}: ParticipantsSidebarProps) {
  // Track current time for displaying participant local times
  const [currentTime, setCurrentTime] = useState(() => new Date())

  // Sidebar width and collapse state with localStorage persistence
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('streamvu-participants-sidebar-width')
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH
  })
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem('streamvu-participants-sidebar-collapsed') === 'true'
  })
  const [isResizing, setIsResizing] = useState(false)
  const [hoveredParticipant, setHoveredParticipant] = useState<string | null>(null)
  const sidebarRef = useRef<HTMLDivElement>(null)

  const handleWidthChange = useCallback((newWidth: number) => {
    const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth))
    setSidebarWidth(clampedWidth)
    localStorage.setItem('streamvu-participants-sidebar-width', String(clampedWidth))
  }, [])

  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const newValue = !prev
      localStorage.setItem('streamvu-participants-sidebar-collapsed', String(newValue))
      return newValue
    })
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing || !sidebarRef.current) return
    const sidebarRect = sidebarRef.current.getBoundingClientRect()
    const newWidth = e.clientX - sidebarRect.left
    handleWidthChange(newWidth)
  }, [isResizing, handleWidthChange])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  // Global mouse listeners for drag
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  // Update time every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000) // Update every minute
    return () => clearInterval(interval)
  }, [])

  const currentWidth = isCollapsed ? COLLAPSED_WIDTH : sidebarWidth

  return (
    <div
      ref={sidebarRef}
      className={`relative flex h-full flex-col border-r border-gray-800 bg-gray-950 ${
        isResizing ? '' : 'transition-all duration-200'
      }`}
      style={{ width: currentWidth }}
    >
      {/* Resize Handle (right edge) */}
      {!isCollapsed && (
        <div
          onMouseDown={handleMouseDown}
          className={`
            absolute right-0 top-0 h-full w-1 cursor-ew-resize z-10
            hover:bg-blue-500/50 active:bg-blue-500/70
            ${isResizing ? 'bg-blue-500/70' : 'bg-transparent'}
          `}
          title="Drag to resize"
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-2">
        {!isCollapsed ? (
          <>
            <div className="flex items-center gap-1.5">
              {/* Participants icon */}
              <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
              </svg>
              <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
                Participants
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono text-gray-600">
                {remoteParticipants.length + 1}
              </span>
              <button
                onClick={toggleCollapse}
                className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                title="Collapse sidebar"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={toggleCollapse}
            className="mx-auto rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300"
            title="Expand sidebar"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* Participants List */}
      <div className="flex-1 overflow-y-auto">
        {isCollapsed ? (
          // Collapsed view - just avatars with tooltips
          <div className="flex flex-col items-center gap-1 py-2">
            {/* Local participant avatar */}
            <div
              className="relative"
              onMouseEnter={() => setHoveredParticipant('local')}
              onMouseLeave={() => setHoveredParticipant(null)}
            >
              <div
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xs font-semibold text-white bg-primary-600 ${
                  onAirChannelIds.includes('local')
                    ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-gray-950'
                    : localIsSpeaking && !isMuted
                    ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-gray-950'
                    : ''
                }`}
              >
                {displayName.charAt(0).toUpperCase()}
              </div>
              <SidebarTooltip label={`${displayName} (You)`} visible={hoveredParticipant === 'local'} />
            </div>
            {/* Remote participant avatars */}
            {remoteParticipants.map((participant) => (
              <div
                key={participant.participantId}
                className="relative"
                onMouseEnter={() => setHoveredParticipant(participant.participantId)}
                onMouseLeave={() => setHoveredParticipant(null)}
              >
                <div
                  className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-xs font-semibold text-white bg-gray-700 ${
                    onAirChannelIds.includes(participant.participantId)
                      ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-gray-950'
                      : participant.isSpeaking
                      ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-gray-950'
                      : ''
                  }`}
                >
                  {participant.displayName.charAt(0).toUpperCase()}
                </div>
                <SidebarTooltip label={participant.displayName} visible={hoveredParticipant === participant.participantId} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* Local participant (You) */}
            <ParticipantRow
              displayName={displayName}
              isLocal
              isSpeaking={localIsSpeaking && !isMuted}
              isMuted={isMuted}
              stream={localStream || undefined}
              isOnAir={onAirChannelIds.includes('local')}
            />

            {/* Remote participants */}
            {remoteParticipants.map((participant) => (
              <ParticipantRow
                key={participant.participantId}
                participantId={participant.participantId}
                displayName={participant.displayName}
                isSpeaking={participant.isSpeaking}
                isMuted={participant.isMuted}
                stream={participant.stream}
                isHost={isHost}
                isKicking={kickingParticipant === participant.participantId}
                onKick={onKickParticipant}
                onRegisterAudio={onRegisterAudio}
                isOnAir={onAirChannelIds.includes(participant.participantId)}
                timeZoneOffset={participant.timeZoneOffset}
                currentTime={currentTime}
              />
            ))}

            {/* Empty state */}
            {remoteParticipants.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-gray-600">
                Waiting for others to join...
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

interface ParticipantRowProps {
  participantId?: string
  displayName: string
  isLocal?: boolean
  isSpeaking: boolean
  isMuted: boolean
  stream?: MediaStream
  isHost?: boolean
  isKicking?: boolean
  onKick?: (participantId: string) => void
  onRegisterAudio?: (participantId: string, element: HTMLAudioElement | null) => void
  /** True if this participant is on-air (routed to PGM in mixer) */
  isOnAir?: boolean
  /** Participant's UTC offset in minutes (for displaying their local time) */
  timeZoneOffset?: number
  /** Current time for calculating participant's local time (updated via interval) */
  currentTime?: Date
}

function ParticipantRow({
  participantId,
  displayName,
  isLocal,
  isSpeaking,
  isMuted,
  stream,
  isHost,
  isKicking,
  onKick,
  onRegisterAudio,
  isOnAir = false,
  timeZoneOffset,
  currentTime,
}: ParticipantRowProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [showKickConfirm, setShowKickConfirm] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)

  // Monitor audio levels
  useEffect(() => {
    if (!stream) return

    const audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    const analyser = audioContext.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    let animationId: number

    const checkLevel = () => {
      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(dataArray)
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length
      setAudioLevel(avg / 255)
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
  }, [stream])

  // Register audio element for output device management
  useEffect(() => {
    if (participantId && audioRef.current && !isLocal) {
      onRegisterAudio?.(participantId, audioRef.current)
      return () => {
        onRegisterAudio?.(participantId, null)
      }
    }
  }, [participantId, isLocal, onRegisterAudio])

  // Set up audio playback for remote streams
  useEffect(() => {
    if (stream && audioRef.current && !isLocal) {
      const audio = audioRef.current
      audio.srcObject = stream

      const playAudio = async () => {
        try {
          await audio.play()
        } catch (err) {
          const handleInteraction = async () => {
            try {
              await audio.play()
              document.removeEventListener('click', handleInteraction)
            } catch {
              // Ignore
            }
          }
          document.addEventListener('click', handleInteraction, { once: true })
        }
      }

      playAudio()
    }
  }, [stream, isLocal])

  const handleKick = () => {
    if (participantId && onKick) {
      onKick(participantId)
      setShowKickConfirm(false)
    }
  }

  // Clean display name (remove "(You)" suffix if present for avatar)
  const cleanName = displayName.replace(' (You)', '')

  // Calculate participant's local time based on their timezone offset
  const getParticipantLocalTime = (): string | null => {
    if (typeof timeZoneOffset !== 'number' || !currentTime) return null
    // Calculate the participant's local time
    // timeZoneOffset is in minutes from UTC (e.g., -300 for EST)
    // We need to convert the current UTC time to their local time
    const utcTime = currentTime.getTime() + (currentTime.getTimezoneOffset() * 60 * 1000)
    const participantTime = new Date(utcTime - (timeZoneOffset * 60 * 1000))
    return participantTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const participantLocalTime = getParticipantLocalTime()

  return (
    <div
      className={`group relative flex items-center gap-3 px-3 py-2 transition-all hover:bg-gray-900/50 ${
        isOnAir
          ? 'bg-red-950/40 border-l-2 border-red-500'
          : isSpeaking
          ? 'bg-green-950/30'
          : ''
      }`}
    >
      {/* Hidden audio element for playback */}
      {stream && !isLocal && <audio ref={audioRef} autoPlay playsInline />}

      {/* Avatar with status */}
      <div className="relative flex-shrink-0">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white ${
            isLocal ? 'bg-primary-600' : 'bg-gray-700'
          } ${
            isOnAir
              ? 'ring-2 ring-red-500 ring-offset-1 ring-offset-gray-950 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
              : isSpeaking
              ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-gray-950'
              : ''
          }`}
        >
          {cleanName.charAt(0).toUpperCase()}
        </div>

        {/* Status indicator - show ON AIR indicator when on air */}
        {isOnAir ? (
          <div className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 border-2 border-gray-950 animate-pulse" />
        ) : (
          <div
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-gray-950 ${
              isMuted ? 'bg-red-500' : isSpeaking ? 'bg-green-500' : 'bg-gray-600'
            }`}
          />
        )}
      </div>

      {/* Name and audio level */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-white">
            {cleanName}
          </span>
          {isLocal && (
            <span className="text-[9px] font-mono text-primary-400">(you)</span>
          )}
          {isOnAir && (
            <span className="flex-shrink-0 rounded bg-red-600 px-1 py-0.5 text-[8px] font-bold text-white animate-pulse shadow-[0_0_6px_rgba(220,38,38,0.6)]">
              ON AIR
            </span>
          )}
          {/* Local time display */}
          {participantLocalTime && !isLocal && (
            <span className="ml-auto flex-shrink-0 text-[10px] font-mono text-gray-500" title="Participant's local time">
              {participantLocalTime}
            </span>
          )}
        </div>

        {/* Audio level bar */}
        {stream && (
          <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-800">
            <div
              className={`h-full transition-all duration-75 ${
                audioLevel > 0.1 ? 'bg-green-500' : 'bg-gray-700'
              }`}
              style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Muted icon */}
      {isMuted && (
        <div className="flex-shrink-0 text-red-400" title="Muted">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.757 3.63 8.25 4.51 8.25H6.75z" />
          </svg>
        </div>
      )}

      {/* Host kick controls */}
      {isHost && !isLocal && participantId && (
        <div className="flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          {showKickConfirm ? (
            <div className="flex items-center gap-1">
              <button
                onClick={handleKick}
                disabled={isKicking}
                className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {isKicking ? '...' : 'Yes'}
              </button>
              <button
                onClick={() => setShowKickConfirm(false)}
                className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-600"
              >
                No
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowKickConfirm(true)}
              className="rounded p-1 text-gray-500 hover:bg-red-900/50 hover:text-red-400"
              title="Remove participant"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
