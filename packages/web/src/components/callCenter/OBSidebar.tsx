import { useState } from 'react'
import type { RoomCue, CueType, ChatMessage, ChatMessageType, RoomTimer, TimerType, Rundown, RundownItem, RundownItemType } from '@streamvu/shared'
import { CuePanel } from './CuePanel'
import { CueDisplay, CueIndicator } from './CueDisplay'
import { RundownPanel, RundownCompact } from './RundownPanel'
import { ChatPanel } from './ChatPanel'
import { TimerPanel, TimerCompact } from './TimerPanel'
import { RecordingPanel } from './RecordingPanel'
import { IFBPanel } from './IFBPanel'
import { SRTOutputPanel } from './SRTOutputPanel'

type OBTab = 'cue' | 'rundown' | 'chat' | 'timers' | 'recording' | 'ifb' | 'srt'

interface OBSidebarProps {
  roomId: string
  isHost: boolean
  currentUserId: string
  currentUserName: string
  participantId?: string
  participants: Array<{ participantId: string; displayName: string; userId?: string | null }>
  // Cue system
  currentCue: RoomCue | null
  onSendCue: (cueType: CueType, cueText?: string, targetParticipantId?: string) => void
  onClearCue: (targetParticipantId?: string) => void
  // Chat system
  messages: ChatMessage[]
  onSendMessage: (content: string, recipientId?: string, type?: ChatMessageType) => void
  // Timer system
  timers: RoomTimer[]
  onCreateTimer: (name: string, type: TimerType, durationMs?: number) => void
  onStartTimer: (timerId: string) => void
  onPauseTimer: (timerId: string) => void
  onResetTimer: (timerId: string) => void
  onDeleteTimer: (timerId: string) => void
  // Rundown system
  rundown: Rundown | null
  rundownLoading: boolean
  onSetCurrentItem: (itemId: string) => void
  onAddRundownItem?: (item: { title: string; durationSec?: number; notes?: string; type?: RundownItemType }) => void
  onUpdateRundownItem?: (itemId: string, updates: Partial<RundownItem>) => void
  onDeleteRundownItem?: (itemId: string) => void
  onCreateRundown?: (name: string) => void
}

const TABS: { id: OBTab; label: string; icon: React.ReactNode }[] = [
  {
    id: 'cue',
    label: 'Cue',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    id: 'rundown',
    label: 'Rundown',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    id: 'chat',
    label: 'Chat',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    id: 'timers',
    label: 'Timers',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'recording',
    label: 'Record',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <circle cx="12" cy="12" r="8" stroke="currentColor" fill="none" />
        <circle cx="12" cy="12" r="4" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'ifb',
    label: 'IFB',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
      </svg>
    ),
  },
  {
    id: 'srt',
    label: 'SRT',
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
]

export function OBSidebar({
  roomId,
  isHost,
  currentUserId,
  currentUserName,
  participantId,
  participants,
  // Cue
  currentCue,
  onSendCue,
  onClearCue,
  // Chat
  messages,
  onSendMessage,
  // Timers
  timers,
  onCreateTimer,
  onStartTimer,
  onPauseTimer,
  onResetTimer,
  onDeleteTimer,
  // Rundown
  rundown,
  rundownLoading: _rundownLoading,
  onSetCurrentItem,
  onAddRundownItem,
  onUpdateRundownItem,
  onDeleteRundownItem,
  onCreateRundown,
}: OBSidebarProps) {
  const [activeTab, setActiveTab] = useState<OBTab>('cue')

  // Count unread chat messages (simple implementation - could be enhanced)
  const unreadCount = 0 // TODO: implement proper unread tracking

  return (
    <div className="flex h-full flex-col bg-gray-900">
      {/* Tab Bar - scrollable on narrow screens */}
      <div className="flex overflow-x-auto border-b border-gray-700 scrollbar-thin scrollbar-thumb-gray-600">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            className={`
              flex flex-shrink-0 flex-col items-center justify-center gap-0.5 px-3 py-2 text-[10px] font-medium transition-colors
              ${activeTab === tab.id
                ? 'border-b-2 border-primary-500 bg-gray-800/50 text-primary-400'
                : 'text-gray-400 hover:bg-gray-800/30 hover:text-gray-200'
              }
            `}
          >
            {tab.icon}
            <span className="whitespace-nowrap">{tab.label}</span>
            {tab.id === 'chat' && unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1 py-0.5 text-[8px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active Cue Indicator (always visible when there's an active cue) */}
      {currentCue && currentCue.cueType !== 'OFF' && activeTab !== 'cue' && (
        <div className="border-b border-gray-700 p-2">
          <CueIndicator currentCue={currentCue} participantId={participantId} />
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'cue' && (
          <div className="h-full overflow-y-auto p-3">
            {isHost ? (
              <CuePanel
                roomId={roomId}
                isHost={isHost}
                currentCue={currentCue}
                participants={participants}
                onSendCue={onSendCue}
                onClearCue={onClearCue}
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 py-8">
                <CueDisplay
                  currentCue={currentCue}
                  participantId={participantId}
                  size="lg"
                  showText
                />
              </div>
            )}
          </div>
        )}

        {activeTab === 'rundown' && (
          <div className="h-full overflow-y-auto p-3">
            {isHost ? (
              <RundownPanel
                roomId={roomId}
                isHost={isHost}
                rundown={rundown}
                onSetCurrentItem={onSetCurrentItem}
                onAddItem={onAddRundownItem}
                onUpdateItem={onUpdateRundownItem}
                onDeleteItem={onDeleteRundownItem}
                onCreateRundown={onCreateRundown}
              />
            ) : (
              <RundownCompact rundown={rundown} />
            )}
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="h-full">
            <ChatPanel
              roomId={roomId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              isHost={isHost}
              messages={messages}
              participants={participants}
              onSendMessage={onSendMessage}
            />
          </div>
        )}

        {activeTab === 'timers' && (
          <div className="h-full overflow-y-auto p-3">
            <TimerPanel
              roomId={roomId}
              isHost={isHost}
              timers={timers}
              onCreateTimer={onCreateTimer}
              onStartTimer={onStartTimer}
              onPauseTimer={onPauseTimer}
              onResetTimer={onResetTimer}
              onDeleteTimer={onDeleteTimer}
            />
          </div>
        )}

        {activeTab === 'recording' && (
          <div className="h-full overflow-y-auto p-3">
            <RecordingPanel
              roomId={roomId}
              isHost={isHost}
              participants={participants}
            />
          </div>
        )}

        {activeTab === 'ifb' && (
          <div className="h-full overflow-y-auto p-3">
            <IFBPanel
              roomId={roomId}
              isHost={isHost}
              participantId={participantId || ''}
              participants={participants}
            />
          </div>
        )}

        {activeTab === 'srt' && (
          <div className="h-full overflow-y-auto p-3">
            <SRTOutputPanel
              roomId={roomId}
              isHost={isHost}
            />
          </div>
        )}
      </div>

      {/* Quick Info Footer */}
      <div className="flex-shrink-0 border-t border-gray-700 p-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{participants.length} participants</span>
          {timers.filter(t => t.isRunning).length > 0 && (
            <div className="flex items-center gap-2">
              {timers.filter(t => t.isRunning).slice(0, 2).map((timer) => (
                <TimerCompact key={timer.id} timer={timer} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Compact version for talent view (no tabs, just shows essential info)
export function OBSidebarCompact({
  participantId,
  currentCue,
  rundown,
  timers,
  messages,
  currentUserId,
  onSendMessage,
}: {
  participantId?: string
  currentCue: RoomCue | null
  rundown: Rundown | null
  timers: RoomTimer[]
  messages: ChatMessage[]
  currentUserId: string
  onSendMessage: (content: string) => void
}) {
  const activeTimers = timers.filter(t => t.isRunning && t.visibleToAll)

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Cue Display */}
      <div className="flex justify-center">
        <CueDisplay
          currentCue={currentCue}
          participantId={participantId}
          size="md"
          showText
        />
      </div>

      {/* Active Timers */}
      {activeTimers.length > 0 && (
        <div className="space-y-2">
          {activeTimers.map((timer) => (
            <TimerCompact key={timer.id} timer={timer} />
          ))}
        </div>
      )}

      {/* Rundown */}
      <RundownCompact rundown={rundown} />

      {/* Compact Chat */}
      <div className="rounded-lg border border-gray-700 bg-gray-800 p-2">
        <div className="max-h-24 space-y-1 overflow-y-auto">
          {messages.slice(-5).map((msg) => (
            <div key={msg.id} className="text-xs">
              <span className={msg.senderId === currentUserId ? 'text-primary-400' : 'text-gray-400'}>
                {msg.senderName}:
              </span>{' '}
              <span className="text-gray-300">{msg.content}</span>
            </div>
          ))}
        </div>
        <input
          type="text"
          placeholder="Message..."
          className="mt-2 w-full rounded bg-gray-700 px-2 py-1 text-xs text-white placeholder-gray-500 focus:outline-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
              onSendMessage(e.currentTarget.value.trim())
              e.currentTarget.value = ''
            }
          }}
        />
      </div>
    </div>
  )
}
