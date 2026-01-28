import { useCallback, useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'
import { getApiUrl, getWsUrl } from '../config'
import { ChatMessageType, IFBTargetType } from '@streamvu/shared'
import type {
  RoomCue,
  CueType,
  ChatMessage,
  RoomTimer,
  TimerType,
  Rundown,
  RundownItem,
  RundownItemType,
  TalkbackGroup,
  IFBSession,
} from '@streamvu/shared'

// ============================================================================
// CUE SYSTEM HOOK
// ============================================================================

interface UseCueSystemOptions {
  roomId: string
  participantId?: string
  onCueReceived?: (cue: RoomCue) => void
  onCueCleared?: () => void
}

interface UseCueSystemReturn {
  currentCue: RoomCue | null
  sendCue: (cueType: CueType, cueText?: string, targetParticipantId?: string) => void
  clearCue: (targetParticipantId?: string) => void
}

export function useCueSystem({
  roomId,
  participantId,
  onCueReceived,
  onCueCleared,
}: UseCueSystemOptions): UseCueSystemReturn {
  const tokens = useAuthStore((state) => state.tokens)
  const [currentCue, setCurrentCue] = useState<RoomCue | null>(null)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!tokens?.accessToken || !roomId) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('cue:subscribe', { roomId })
    })

    socket.on('cue:received', (data: { cue: RoomCue }) => {
      // Check if cue applies to us
      if (data.cue.targetParticipantId && participantId && data.cue.targetParticipantId !== participantId) {
        return // Not for us
      }
      setCurrentCue(data.cue)
      onCueReceived?.(data.cue)
    })

    socket.on('cue:cleared', (data: { targetParticipantId?: string }) => {
      if (!data.targetParticipantId || data.targetParticipantId === participantId) {
        setCurrentCue(null)
        onCueCleared?.()
      }
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [tokens?.accessToken, roomId, participantId, onCueReceived, onCueCleared])

  const sendCue = useCallback((cueType: CueType, cueText?: string, targetParticipantId?: string) => {
    socketRef.current?.emit('cue:send', { roomId, cueType, cueText, targetParticipantId })
  }, [roomId])

  const clearCue = useCallback((targetParticipantId?: string) => {
    socketRef.current?.emit('cue:clear', { roomId, targetParticipantId })
  }, [roomId])

  return { currentCue, sendCue, clearCue }
}

// ============================================================================
// CHAT SYSTEM HOOK
// ============================================================================

interface UseChatSystemOptions {
  roomId: string
  participantId: string
  onNewMessage?: (message: ChatMessage) => void
}

interface UseChatSystemReturn {
  messages: ChatMessage[]
  sendMessage: (content: string, recipientId?: string, type?: ChatMessageType) => void
  loadHistory: () => void
}

export function useChatSystem({
  roomId,
  participantId,
  onNewMessage,
}: UseChatSystemOptions): UseChatSystemReturn {
  const tokens = useAuthStore((state) => state.tokens)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!tokens?.accessToken || !roomId) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('chat:subscribe', { roomId })
      // Load history
      socket.emit('chat:history', { roomId }, (response: { messages: ChatMessage[] }) => {
        if (response.messages) {
          setMessages(response.messages)
        }
      })
    })

    socket.on('chat:message', (data: { message: ChatMessage }) => {
      // Check if message is for us (room-wide or targeted at us)
      if (data.message.recipientId && data.message.recipientId !== participantId && data.message.senderId !== participantId) {
        return // Not for us
      }
      setMessages((prev) => [...prev, data.message])
      onNewMessage?.(data.message)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [tokens?.accessToken, roomId, participantId, onNewMessage])

  const sendMessage = useCallback((content: string, recipientId?: string, type: ChatMessageType = ChatMessageType.CHAT) => {
    socketRef.current?.emit('chat:send', { roomId, content, recipientId, type })
  }, [roomId])

  const loadHistory = useCallback(() => {
    socketRef.current?.emit('chat:history', { roomId }, (response: { messages: ChatMessage[] }) => {
      if (response.messages) {
        setMessages(response.messages)
      }
    })
  }, [roomId])

  return { messages, sendMessage, loadHistory }
}

// ============================================================================
// TIMER SYSTEM HOOK
// ============================================================================

interface UseTimerSystemOptions {
  roomId: string
  onTimerCreated?: (timer: RoomTimer) => void
  onTimerUpdated?: (timer: RoomTimer) => void
  onTimerDeleted?: (timerId: string) => void
}

interface UseTimerSystemReturn {
  timers: RoomTimer[]
  createTimer: (name: string, type: TimerType, durationMs?: number, visibleToAll?: boolean) => void
  startTimer: (timerId: string) => void
  pauseTimer: (timerId: string) => void
  resetTimer: (timerId: string) => void
  deleteTimer: (timerId: string) => void
}

export function useTimerSystem({
  roomId,
  onTimerCreated,
  onTimerUpdated,
  onTimerDeleted,
}: UseTimerSystemOptions): UseTimerSystemReturn {
  const tokens = useAuthStore((state) => state.tokens)
  const [timers, setTimers] = useState<RoomTimer[]>([])
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!tokens?.accessToken || !roomId) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('timer:subscribe', { roomId })
      // Load existing timers
      socket.emit('timer:list', { roomId }, (response: { timers: RoomTimer[] }) => {
        if (response.timers) {
          setTimers(response.timers)
        }
      })
    })

    socket.on('timer:created', (data: { timer: RoomTimer }) => {
      setTimers((prev) => [...prev, data.timer])
      onTimerCreated?.(data.timer)
    })

    socket.on('timer:updated', (data: { timer: RoomTimer }) => {
      setTimers((prev) => prev.map((t) => (t.id === data.timer.id ? data.timer : t)))
      onTimerUpdated?.(data.timer)
    })

    socket.on('timer:started', (data: { timerId: string; startedAt: string }) => {
      setTimers((prev) =>
        prev.map((t) =>
          t.id === data.timerId
            ? { ...t, isRunning: true, startedAt: data.startedAt, pausedAt: null }
            : t
        )
      )
    })

    socket.on('timer:paused', (data: { timerId: string; pausedAt: string }) => {
      setTimers((prev) =>
        prev.map((t) =>
          t.id === data.timerId ? { ...t, isRunning: false, pausedAt: data.pausedAt } : t
        )
      )
    })

    socket.on('timer:reset', (data: { timerId: string }) => {
      setTimers((prev) =>
        prev.map((t) =>
          t.id === data.timerId
            ? { ...t, isRunning: false, startedAt: null, pausedAt: null }
            : t
        )
      )
    })

    socket.on('timer:deleted', (data: { timerId: string }) => {
      setTimers((prev) => prev.filter((t) => t.id !== data.timerId))
      onTimerDeleted?.(data.timerId)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [tokens?.accessToken, roomId, onTimerCreated, onTimerUpdated, onTimerDeleted])

  const createTimer = useCallback(
    (name: string, type: TimerType, durationMs?: number, visibleToAll: boolean = true) => {
      socketRef.current?.emit('timer:create', { roomId, name, type, durationMs, visibleToAll })
    },
    [roomId]
  )

  const startTimer = useCallback((timerId: string) => {
    socketRef.current?.emit('timer:start', { roomId, timerId })
  }, [roomId])

  const pauseTimer = useCallback((timerId: string) => {
    socketRef.current?.emit('timer:pause', { roomId, timerId })
  }, [roomId])

  const resetTimer = useCallback((timerId: string) => {
    socketRef.current?.emit('timer:reset', { roomId, timerId })
  }, [roomId])

  const deleteTimer = useCallback((timerId: string) => {
    socketRef.current?.emit('timer:delete', { roomId, timerId })
  }, [roomId])

  return { timers, createTimer, startTimer, pauseTimer, resetTimer, deleteTimer }
}

// ============================================================================
// RUNDOWN SYSTEM HOOK
// ============================================================================

interface UseRundownSystemOptions {
  roomId: string
  onRundownUpdated?: (rundown: Rundown) => void
  onItemCurrentChanged?: (itemId: string, previousItemId?: string) => void
}

interface UseRundownSystemReturn {
  rundown: Rundown | null
  isLoading: boolean
  createRundown: (name: string, items?: Array<{ title: string; durationSec?: number; notes?: string; type?: RundownItemType }>) => Promise<void>
  deleteRundown: () => Promise<void>
  addItem: (item: { title: string; durationSec?: number; notes?: string; hostNotes?: string; type?: RundownItemType; order?: number }) => Promise<void>
  updateItem: (itemId: string, updates: Partial<RundownItem>) => Promise<void>
  deleteItem: (itemId: string) => Promise<void>
  setCurrentItem: (itemId: string) => void
  refreshRundown: () => Promise<void>
}

export function useRundownSystem({
  roomId,
  onRundownUpdated,
  onItemCurrentChanged,
}: UseRundownSystemOptions): UseRundownSystemReturn {
  const tokens = useAuthStore((state) => state.tokens)
  const [rundown, setRundown] = useState<Rundown | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const socketRef = useRef<Socket | null>(null)

  const fetchRundown = useCallback(async () => {
    if (!tokens?.accessToken) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/rooms/${roomId}/rundown`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      if (response.ok) {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json()
          setRundown(data.rundown)
        }
      }
      // Silently ignore 404s - endpoint may not be implemented yet
    } catch {
      // Silently ignore fetch errors for rundown - this is an optional feature
    } finally {
      setIsLoading(false)
    }
  }, [roomId, tokens?.accessToken])

  useEffect(() => {
    fetchRundown()
  }, [fetchRundown])

  useEffect(() => {
    if (!tokens?.accessToken || !roomId) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('rundown:subscribe', { roomId })
    })

    socket.on('rundown:updated', (data: { rundown: Rundown }) => {
      setRundown(data.rundown)
      onRundownUpdated?.(data.rundown)
    })

    socket.on('rundown:item:current', (data: { itemId: string; previousItemId?: string }) => {
      // Update local state
      setRundown((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          items: prev.items.map((item) => ({
            ...item,
            isCurrent: item.id === data.itemId,
            isCompleted: item.isCurrent && data.previousItemId === item.id ? true : item.isCompleted,
          })),
        }
      })
      onItemCurrentChanged?.(data.itemId, data.previousItemId)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [tokens?.accessToken, roomId, onRundownUpdated, onItemCurrentChanged])

  const createRundown = useCallback(
    async (name: string, items?: Array<{ title: string; durationSec?: number; notes?: string; type?: RundownItemType }>) => {
      if (!tokens?.accessToken) return

      const response = await fetch(`${getApiUrl()}/api/rooms/${roomId}/rundown`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify({ name, items }),
      })

      if (response.ok) {
        const data = await response.json()
        setRundown(data.rundown)
      }
    },
    [roomId, tokens?.accessToken]
  )

  const deleteRundown = useCallback(async () => {
    if (!tokens?.accessToken) return

    const response = await fetch(`${getApiUrl()}/api/rooms/${roomId}/rundown`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    })

    if (response.ok) {
      setRundown(null)
    }
  }, [roomId, tokens?.accessToken])

  const addItem = useCallback(
    async (item: { title: string; durationSec?: number; notes?: string; hostNotes?: string; type?: RundownItemType; order?: number }) => {
      if (!tokens?.accessToken) return

      const response = await fetch(`${getApiUrl()}/api/rooms/${roomId}/rundown/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify(item),
      })

      if (response.ok) {
        await fetchRundown()
      }
    },
    [roomId, tokens?.accessToken, fetchRundown]
  )

  const updateItem = useCallback(
    async (itemId: string, updates: Partial<RundownItem>) => {
      if (!tokens?.accessToken) return

      const response = await fetch(`${getApiUrl()}/api/rundown/items/${itemId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.accessToken}`,
        },
        body: JSON.stringify(updates),
      })

      if (response.ok) {
        await fetchRundown()
      }
    },
    [tokens?.accessToken, fetchRundown]
  )

  const deleteItem = useCallback(
    async (itemId: string) => {
      if (!tokens?.accessToken) return

      const response = await fetch(`${getApiUrl()}/api/rundown/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })

      if (response.ok) {
        await fetchRundown()
      }
    },
    [tokens?.accessToken, fetchRundown]
  )

  const setCurrentItem = useCallback((itemId: string) => {
    socketRef.current?.emit('rundown:set-current', { roomId, itemId })
  }, [roomId])

  return {
    rundown,
    isLoading,
    createRundown,
    deleteRundown,
    addItem,
    updateItem,
    deleteItem,
    setCurrentItem,
    refreshRundown: fetchRundown,
  }
}

// ============================================================================
// IFB/TALKBACK SYSTEM HOOK
// ============================================================================

interface UseIFBSystemOptions {
  roomId: string
  participantId: string
  onIFBStarted?: (session: IFBSession) => void
  onIFBEnded?: (sessionId: string) => void
  onGroupCreated?: (group: TalkbackGroup) => void
}

interface UseIFBSystemReturn {
  // Talkback Groups
  groups: TalkbackGroup[]
  createGroup: (name: string, color?: string, participantIds?: string[]) => void
  updateGroup: (groupId: string, name?: string, color?: string) => void
  deleteGroup: (groupId: string) => void
  addGroupMember: (groupId: string, participantId: string) => void
  removeGroupMember: (groupId: string, participantId: string) => void
  // IFB Sessions
  activeSessions: IFBSession[]
  myActiveIFB: IFBSession | null
  startIFB: (targetType: IFBTargetType, targetId?: string, level?: number, duckingLevel?: number) => void
  updateIFB: (sessionId: string, level?: number, duckingLevel?: number) => void
  endIFB: (sessionId: string) => void
  // Incoming IFB (for participants receiving IFB)
  incomingIFB: IFBSession | null
}

export function useIFBSystem({
  roomId,
  participantId,
  onIFBStarted,
  onIFBEnded,
  onGroupCreated,
}: UseIFBSystemOptions): UseIFBSystemReturn {
  const tokens = useAuthStore((state) => state.tokens)
  const [groups, setGroups] = useState<TalkbackGroup[]>([])
  const [activeSessions, setActiveSessions] = useState<IFBSession[]>([])
  const [incomingIFB, setIncomingIFB] = useState<IFBSession | null>(null)
  const socketRef = useRef<Socket | null>(null)

  // Find my active IFB session (if I'm sending)
  const myActiveIFB = activeSessions.find((s) => s.senderId === participantId) || null

  useEffect(() => {
    if (!tokens?.accessToken || !roomId) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      // Load existing groups
      socket.emit('talkback:list-groups', { roomId }, (response: { groups?: TalkbackGroup[] }) => {
        if (response.groups) {
          setGroups(response.groups)
        }
      })
      // Load active IFB sessions
      socket.emit('ifb:list', { roomId }, (response: { sessions?: IFBSession[] }) => {
        if (response.sessions) {
          setActiveSessions(response.sessions)
        }
      })
    })

    // Talkback group events
    socket.on('talkback:group-created', (data: { group: TalkbackGroup }) => {
      setGroups((prev) => [...prev, data.group])
      onGroupCreated?.(data.group)
    })

    socket.on('talkback:group-updated', (data: { group: TalkbackGroup }) => {
      setGroups((prev) => prev.map((g) => (g.id === data.group.id ? data.group : g)))
    })

    socket.on('talkback:group-deleted', (data: { groupId: string }) => {
      setGroups((prev) => prev.filter((g) => g.id !== data.groupId))
    })

    socket.on('talkback:member-added', (data: { groupId: string; member: TalkbackGroup['members'][0] }) => {
      setGroups((prev) =>
        prev.map((g) => (g.id === data.groupId ? { ...g, members: [...g.members, data.member] } : g))
      )
    })

    socket.on('talkback:member-removed', (data: { groupId: string; participantId: string }) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === data.groupId
            ? { ...g, members: g.members.filter((m) => m.participantId !== data.participantId) }
            : g
        )
      )
    })

    // IFB events
    socket.on('ifb:started', (data: { session: IFBSession; forParticipantId?: string; forParticipantIds?: string[] }) => {
      setActiveSessions((prev) => [...prev, data.session])

      // Check if this IFB is for us
      if (data.forParticipantId === participantId ||
          data.forParticipantIds?.includes(participantId) ||
          data.session.targetType === 'ALL') {
        setIncomingIFB(data.session)
      }

      onIFBStarted?.(data.session)
    })

    socket.on('ifb:updated', (data: { sessionId: string; level?: number; duckingLevel?: number }) => {
      setActiveSessions((prev) =>
        prev.map((s) =>
          s.id === data.sessionId
            ? { ...s, level: data.level ?? s.level, duckingLevel: data.duckingLevel ?? s.duckingLevel }
            : s
        )
      )
      // Update incoming IFB if it's the same session
      setIncomingIFB((prev) =>
        prev?.id === data.sessionId
          ? { ...prev, level: data.level ?? prev.level, duckingLevel: data.duckingLevel ?? prev.duckingLevel }
          : prev
      )
    })

    socket.on('ifb:ended', (data: { sessionId: string }) => {
      setActiveSessions((prev) => prev.filter((s) => s.id !== data.sessionId))
      // Clear incoming IFB if it's the one that ended
      setIncomingIFB((prev) => (prev?.id === data.sessionId ? null : prev))
      onIFBEnded?.(data.sessionId)
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [tokens?.accessToken, roomId, participantId, onIFBStarted, onIFBEnded, onGroupCreated])

  // Group management
  const createGroup = useCallback(
    (name: string, color?: string, participantIds?: string[]) => {
      socketRef.current?.emit('talkback:create-group', { roomId, name, color, participantIds })
    },
    [roomId]
  )

  const updateGroup = useCallback(
    (groupId: string, name?: string, color?: string) => {
      socketRef.current?.emit('talkback:update-group', { roomId, groupId, name, color })
    },
    [roomId]
  )

  const deleteGroup = useCallback(
    (groupId: string) => {
      socketRef.current?.emit('talkback:delete-group', { roomId, groupId })
    },
    [roomId]
  )

  const addGroupMember = useCallback(
    (groupId: string, participantId: string) => {
      socketRef.current?.emit('talkback:add-member', { roomId, groupId, participantId })
    },
    [roomId]
  )

  const removeGroupMember = useCallback(
    (groupId: string, participantId: string) => {
      socketRef.current?.emit('talkback:remove-member', { roomId, groupId, participantId })
    },
    [roomId]
  )

  // IFB session management
  const startIFB = useCallback(
    (targetType: IFBTargetType, targetId?: string, level?: number, duckingLevel?: number) => {
      const payload: {
        roomId: string
        targetType: IFBTargetType
        targetParticipantId?: string
        targetGroupId?: string
        level?: number
        duckingLevel?: number
      } = { roomId, targetType, level, duckingLevel }

      if (targetType === IFBTargetType.PARTICIPANT) {
        payload.targetParticipantId = targetId
      } else if (targetType === IFBTargetType.GROUP) {
        payload.targetGroupId = targetId
      }

      socketRef.current?.emit('ifb:start', payload)
    },
    [roomId]
  )

  const updateIFB = useCallback(
    (sessionId: string, level?: number, duckingLevel?: number) => {
      socketRef.current?.emit('ifb:update', { roomId, sessionId, level, duckingLevel })
    },
    [roomId]
  )

  const endIFB = useCallback(
    (sessionId: string) => {
      socketRef.current?.emit('ifb:end', { roomId, sessionId })
    },
    [roomId]
  )

  return {
    groups,
    createGroup,
    updateGroup,
    deleteGroup,
    addGroupMember,
    removeGroupMember,
    activeSessions,
    myActiveIFB,
    startIFB,
    updateIFB,
    endIFB,
    incomingIFB,
  }
}

// ============================================================================
// COMBINED HOOK FOR ALL OB FEATURES
// ============================================================================

interface UseOBFeaturesOptions {
  roomId: string
  participantId: string
  isHost: boolean
}

interface UseOBFeaturesReturn {
  // Cues
  currentCue: RoomCue | null
  sendCue: (cueType: CueType, cueText?: string, targetParticipantId?: string) => void
  clearCue: (targetParticipantId?: string) => void
  // Chat
  messages: ChatMessage[]
  sendMessage: (content: string, recipientId?: string, type?: ChatMessageType) => void
  // Timers
  timers: RoomTimer[]
  createTimer: (name: string, type: TimerType, durationMs?: number) => void
  startTimer: (timerId: string) => void
  pauseTimer: (timerId: string) => void
  resetTimer: (timerId: string) => void
  deleteTimer: (timerId: string) => void
  // Rundown
  rundown: Rundown | null
  rundownLoading: boolean
  createRundown: (name: string) => Promise<void>
  addRundownItem: (item: { title: string; durationSec?: number; notes?: string; type?: RundownItemType }) => Promise<void>
  updateRundownItem: (itemId: string, updates: Partial<RundownItem>) => Promise<void>
  deleteRundownItem: (itemId: string) => Promise<void>
  setCurrentRundownItem: (itemId: string) => void
}

export function useOBFeatures({
  roomId,
  participantId,
  isHost: _isHost,
}: UseOBFeaturesOptions): UseOBFeaturesReturn {
  const cueSystem = useCueSystem({ roomId, participantId })
  const chatSystem = useChatSystem({ roomId, participantId })
  const timerSystem = useTimerSystem({ roomId })
  const rundownSystem = useRundownSystem({ roomId })

  return {
    // Cues
    currentCue: cueSystem.currentCue,
    sendCue: cueSystem.sendCue,
    clearCue: cueSystem.clearCue,
    // Chat
    messages: chatSystem.messages,
    sendMessage: chatSystem.sendMessage,
    // Timers
    timers: timerSystem.timers,
    createTimer: timerSystem.createTimer,
    startTimer: timerSystem.startTimer,
    pauseTimer: timerSystem.pauseTimer,
    resetTimer: timerSystem.resetTimer,
    deleteTimer: timerSystem.deleteTimer,
    // Rundown
    rundown: rundownSystem.rundown,
    rundownLoading: rundownSystem.isLoading,
    createRundown: rundownSystem.createRundown,
    addRundownItem: rundownSystem.addItem,
    updateRundownItem: rundownSystem.updateItem,
    deleteRundownItem: rundownSystem.deleteItem,
    setCurrentRundownItem: rundownSystem.setCurrentItem,
  }
}
