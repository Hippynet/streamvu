import { useState } from 'react'
import { LeftActivityBar, type LeftPanelId } from './LeftActivityBar'
import { LeftSidebarPanel } from './LeftSidebarPanel'
import { ParticipantsPanel } from './panels/ParticipantsPanel'
import { SettingsPanel } from './panels/SettingsPanel'

interface LeftSidebarProps {
  // Participants panel props
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
    timeZoneOffset?: number
  }>
  isHost: boolean
  kickingParticipant: string | null
  onKickParticipant: (participantId: string) => void
  onRegisterAudio: (participantId: string, element: HTMLAudioElement | null) => void
  onAirChannelIds?: string[]
}

const PANEL_TITLES: Record<LeftPanelId, string> = {
  participants: 'Participants',
  settings: 'Settings',
}

export function LeftSidebar({
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
}: LeftSidebarProps) {
  const [activePanel, setActivePanel] = useState<LeftPanelId | null>('participants')

  // Sidebar width with localStorage persistence
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('streamvu-left-sidebar-width')
    return saved ? parseInt(saved, 10) : 256
  })

  const handleWidthChange = (newWidth: number) => {
    setSidebarWidth(newWidth)
    localStorage.setItem('streamvu-left-sidebar-width', String(newWidth))
  }

  const handlePanelClick = (panelId: LeftPanelId) => {
    setActivePanel(prev => (prev === panelId ? null : panelId))
  }

  const participantCount = remoteParticipants.length + 1 // +1 for local

  const renderPanelContent = () => {
    if (!activePanel) return null

    switch (activePanel) {
      case 'participants':
        return (
          <ParticipantsPanel
            displayName={displayName}
            localStream={localStream}
            isMuted={isMuted}
            localIsSpeaking={localIsSpeaking}
            remoteParticipants={remoteParticipants}
            isHost={isHost}
            kickingParticipant={kickingParticipant}
            onKickParticipant={onKickParticipant}
            onRegisterAudio={onRegisterAudio}
            onAirChannelIds={onAirChannelIds}
          />
        )

      case 'settings':
        return <SettingsPanel />

      default:
        return null
    }
  }

  return (
    <div className="flex h-full">
      {/* Activity Bar */}
      <LeftActivityBar
        activePanel={activePanel}
        onPanelClick={handlePanelClick}
        participantCount={participantCount}
      />

      {/* Expandable Panel */}
      <LeftSidebarPanel
        title={activePanel ? PANEL_TITLES[activePanel] : ''}
        isOpen={activePanel !== null}
        width={sidebarWidth}
        onWidthChange={handleWidthChange}
      >
        {renderPanelContent()}
      </LeftSidebarPanel>
    </div>
  )
}
