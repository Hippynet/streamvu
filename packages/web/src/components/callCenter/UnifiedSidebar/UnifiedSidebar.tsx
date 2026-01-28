import { useState, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../../../stores/authStore'
import { getWsUrl } from '../../../config'
import type { AudioSource } from '@streamvu/shared'
import { ActivityBar, type SidebarPanelId } from './ActivityBar'
import { SidebarPanel } from './SidebarPanel'
import { IOPanel } from './panels/IOPanel'
import { RecordingPanel } from '../RecordingPanel'
import { IFBPanel } from '../IFBPanel'
import { SRTOutputPanel } from '../SRTOutputPanel'
import { GreenRoom } from '../GreenRoom'
import { WHIPStreamManager } from '../WHIPStreamManager'
import { RoomSwitcher } from '../RoomSwitcher'
import { RemoteControlPanel } from '../RemoteControlPanel'
import { Multiviewer } from '../Multiviewer'
import { AudioRoutingMatrix, type RoutingSource, type SourceRouting, type OutputDestination } from '../AudioRoutingMatrix'
import { useRemoteControl } from '../../../hooks/useRemoteControl'
import type { BusType } from '../../../hooks/useAudioEngine'

interface AudioSourcePlaybackState {
  audioLevel: number
  isPlaying: boolean
  error: string | null
}

interface UnifiedSidebarProps {
  roomId: string
  roomName: string
  isHost: boolean
  currentUserId: string
  currentUserName: string
  participantId?: string
  participants: Array<{ participantId: string; displayName: string; userId?: string | null }>

  // Sources panel props (host only)
  sources?: AudioSource[]
  playbackState?: Map<string, AudioSourcePlaybackState>
  onStartSource?: (sourceId: string) => void
  onStopSource?: (sourceId: string) => void
  onAddSource?: () => void
  sourcesRefreshKey?: number

  // Outputs panel props (host only)
  onAddOutput?: () => void
  outputsRefreshKey?: number

  // Audio routing props (host only)
  routingSources?: RoutingSource[]
  routing?: Record<string, SourceRouting>
  routingOutputs?: OutputDestination[]
  onRoutingChange?: (sourceId: string, busType: BusType, enabled: boolean) => void
  onAuxLevelChange?: (sourceId: string, busType: BusType, level: number) => void
  onPreFaderToggle?: (sourceId: string, busType: BusType, preFader: boolean) => void
  onOutputBusChange?: (outputId: string, busSource: BusType) => void
}

const PANEL_TITLES: Record<SidebarPanelId, string> = {
  io: 'Sources & Outputs',
  routing: 'Audio Routing',
  recording: 'Recording',
  ifb: 'IFB',
  srt: 'SRT Sources',
  greenroom: 'Green Room',
  roomswitcher: 'Room Switcher',
  remotecontrol: 'Remote Control',
  whip: 'WHIP Ingest',
  multiviewer: 'Multiviewer',
}

export function UnifiedSidebar({
  roomId,
  roomName,
  isHost,
  currentUserId: _currentUserId,
  currentUserName: _currentUserName,
  participantId,
  participants,
  // Sources
  sources,
  playbackState,
  onStartSource,
  onStopSource,
  onAddSource,
  sourcesRefreshKey,
  // Outputs
  onAddOutput,
  outputsRefreshKey,
  // Audio routing
  routingSources,
  routing,
  routingOutputs,
  onRoutingChange,
  onAuxLevelChange,
  onPreFaderToggle,
  onOutputBusChange,
}: UnifiedSidebarProps) {
  const tokens = useAuthStore((state) => state.tokens)
  const [activePanel, setActivePanel] = useState<SidebarPanelId | null>('io')
  const socketRef = useRef<Socket | null>(null)

  // Remote control state
  const [selectedRemoteParticipant, setSelectedRemoteParticipant] = useState<{
    id: string
    name: string
  } | null>(null)

  // Sidebar width with localStorage persistence
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('streamvu-sidebar-width')
    return saved ? parseInt(saved, 10) : 288 // Default to w-72
  })

  const handleWidthChange = (newWidth: number) => {
    setSidebarWidth(newWidth)
    localStorage.setItem('streamvu-sidebar-width', String(newWidth))
  }

  // Create socket for panels that need real-time updates
  useEffect(() => {
    if (!tokens?.accessToken || !roomId) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    socketRef.current = socket

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [tokens?.accessToken, roomId])

  // Remote control hook for producer controls
  const remoteControl = useRemoteControl({
    socket: socketRef.current,
    roomId,
    participantId: participantId || null,
  })

  const handlePanelClick = (panelId: SidebarPanelId) => {
    setActivePanel(prev => (prev === panelId ? null : panelId))
  }

  // Status indicators
  const hasActiveSources = sources?.some(s => s.isActive) || false
  const isRecording = false // TODO: get from recording state

  const renderPanelContent = () => {
    if (!activePanel) return null

    switch (activePanel) {
      case 'io':
        return (
          <IOPanel
            roomId={roomId}
            isHost={isHost}
            sources={sources}
            playbackState={playbackState}
            onStartSource={onStartSource}
            onStopSource={onStopSource}
            onAddSource={onAddSource}
            sourcesRefreshKey={sourcesRefreshKey}
            onAddOutput={onAddOutput}
            outputsRefreshKey={outputsRefreshKey}
          />
        )

      case 'routing':
        return (
          <AudioRoutingMatrix
            sources={routingSources || []}
            routing={routing || {}}
            outputs={routingOutputs || []}
            onRoutingChange={onRoutingChange || (() => {})}
            onAuxLevelChange={onAuxLevelChange || (() => {})}
            onPreFaderToggle={onPreFaderToggle || (() => {})}
            onOutputChange={onOutputBusChange}
            embedded
          />
        )

      case 'recording':
        return (
          <div className="h-full overflow-y-auto p-3">
            <RecordingPanel
              roomId={roomId}
              isHost={isHost}
              participants={participants}
            />
          </div>
        )

      case 'ifb':
        return (
          <div className="h-full overflow-y-auto p-3">
            <IFBPanel
              roomId={roomId}
              isHost={isHost}
              participantId={participantId || ''}
              participants={participants}
            />
          </div>
        )

      case 'srt':
        return (
          <div className="h-full overflow-y-auto p-3">
            <SRTOutputPanel
              roomId={roomId}
              isHost={isHost}
            />
          </div>
        )

      case 'greenroom':
        return (
          <div className="h-full overflow-y-auto p-3">
            <GreenRoom
              socket={socketRef.current}
              liveRoomId={roomId}
              liveRoomName={roomName}
              isProducer={isHost}
            />
          </div>
        )

      case 'roomswitcher':
        return (
          <div className="h-full overflow-y-auto p-3">
            <RoomSwitcher
              socket={socketRef.current}
              liveRoomId={roomId}
              liveRoomName={roomName}
              liveParticipants={participants.map(p => ({
                id: p.participantId,
                displayName: p.displayName,
                isConnected: true,
              }))}
              isProducer={isHost}
            />
          </div>
        )

      case 'remotecontrol':
        return (
          <div className="h-full overflow-y-auto p-3">
            {!selectedRemoteParticipant ? (
              // Participant selection
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-wider text-gray-500">Select Participant</p>
                {participants.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-500">No participants connected</p>
                ) : (
                  <div className="space-y-1">
                    {participants.map(p => (
                      <button
                        key={p.participantId}
                        onClick={() => setSelectedRemoteParticipant({ id: p.participantId, name: p.displayName })}
                        className="flex w-full items-center gap-2 rounded border border-gray-700 bg-gray-800 px-3 py-2 text-left text-sm text-gray-300 transition-colors hover:bg-gray-700 hover:text-white"
                      >
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        {p.displayName}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              // Remote control panel for selected participant
              <div>
                <button
                  onClick={() => setSelectedRemoteParticipant(null)}
                  className="mb-3 flex items-center gap-1 text-xs text-gray-400 transition-colors hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                  Back to participants
                </button>
                <RemoteControlPanel
                  participantId={selectedRemoteParticipant.id}
                  participantName={selectedRemoteParticipant.name}
                  currentState={remoteControl.state}
                  onSetGain={remoteControl.setRemoteGain}
                  onSetMute={remoteControl.setRemoteMute}
                  onSetEQ={remoteControl.setRemoteEQ}
                  onSetCompressor={remoteControl.setRemoteCompressor}
                  onSetGate={remoteControl.setRemoteGate}
                  onReset={remoteControl.resetRemoteControl}
                  onRequestState={remoteControl.requestState}
                  expanded={true}
                />
              </div>
            )}
          </div>
        )

      case 'whip':
        return (
          <div className="h-full overflow-y-auto p-3">
            <WHIPStreamManager
              roomId={roomId}
              socket={socketRef.current}
              isProducer={isHost}
            />
          </div>
        )

      case 'multiviewer':
        return (
          <div className="h-full overflow-hidden">
            <Multiviewer
              participants={participants.map(p => ({
                id: p.participantId,
                name: p.displayName,
                audioLevel: 0, // Would be populated from audio engine
                isOnAir: false, // Would be populated from PGM routing
                isMuted: false,
                isSpeaking: false,
                connectionQuality: 'good' as const,
              }))}
              layout="grid-3x3"
              showClock
              showTimecode
              showAudioMeters
              showLabels
            />
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="flex h-full">
      {/* Expandable Panel */}
      <SidebarPanel
        title={activePanel ? PANEL_TITLES[activePanel] : ''}
        isOpen={activePanel !== null}
        width={sidebarWidth}
        onWidthChange={handleWidthChange}
      >
        {renderPanelContent()}
      </SidebarPanel>

      {/* Activity Bar */}
      <ActivityBar
        activePanel={activePanel}
        isHost={isHost}
        onPanelClick={handlePanelClick}
        hasActiveSources={hasActiveSources}
        isRecording={isRecording}
      />
    </div>
  )
}
