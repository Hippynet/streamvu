import { useState, useCallback, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../../stores/authStore'
import { getWsUrl } from '../../config'
import { IFBTargetType } from '@streamvu/shared'
import type { TalkbackGroup, IFBSession } from '@streamvu/shared'

interface IFBPanelProps {
  roomId: string
  isHost: boolean
  participantId: string
  participants: Array<{ participantId: string; displayName: string }>
}

const GROUP_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
]

function TalkbackGroupCard({
  group,
  participants,
  onAddMember,
  onRemoveMember,
  onDelete,
  onStartIFB,
}: {
  group: TalkbackGroup
  participants: Array<{ participantId: string; displayName: string }>
  onAddMember: (participantId: string) => void
  onRemoveMember: (participantId: string) => void
  onDelete: () => void
  onStartIFB: () => void
}) {
  const [showAddMember, setShowAddMember] = useState(false)
  const memberIds = group.members.map((m) => m.participantId)
  const availableParticipants = participants.filter((p) => !memberIds.includes(p.participantId))

  return (
    <div
      className="border-l-2 bg-gray-900 p-2"
      style={{ borderLeftColor: group.color || '#6B7280' }}
    >
      {/* Header */}
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: group.color || '#6B7280' }}
          />
          <span className="text-[10px] font-mono text-white">{group.name}</span>
          <span className="text-[9px] font-mono text-gray-600">({group.members.length})</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={onStartIFB}
            className="bg-yellow-900/50 px-1.5 py-0.5 text-[9px] font-mono text-yellow-400 hover:bg-yellow-900/70"
            title="Talk to this group"
          >
            IFB
          </button>
          <button
            onClick={onDelete}
            className="p-0.5 text-gray-600 hover:text-red-400"
            title="Delete group"
          >
            ×
          </button>
        </div>
      </div>

      {/* Members */}
      <div className="mb-1.5 flex flex-wrap gap-0.5">
        {group.members.map((member) => (
          <span
            key={member.id}
            className="inline-flex items-center gap-0.5 bg-gray-800 px-1 py-0.5 text-[9px] text-gray-400"
          >
            {member.participant?.displayName || '?'}
            <button
              onClick={() => onRemoveMember(member.participantId)}
              className="text-gray-600 hover:text-red-400"
            >
              ×
            </button>
          </span>
        ))}
        {group.members.length === 0 && (
          <span className="text-[9px] font-mono italic text-gray-600">Empty</span>
        )}
      </div>

      {/* Add Member */}
      {showAddMember ? (
        <div className="flex gap-1">
          <select
            className="flex-1 bg-gray-800 px-1 py-0.5 text-[9px] text-white focus:outline-none"
            onChange={(e) => {
              if (e.target.value) {
                onAddMember(e.target.value)
                e.target.value = ''
              }
            }}
          >
            <option value="">Add...</option>
            {availableParticipants.map((p) => (
              <option key={p.participantId} value={p.participantId}>
                {p.displayName}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowAddMember(false)}
            className="text-[9px] font-mono text-gray-600 hover:text-gray-400"
          >
            Done
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddMember(true)}
          className="text-[9px] font-mono text-primary-500 hover:text-primary-400"
        >
          + Add
        </button>
      )}
    </div>
  )
}

function IFBButton({
  participant,
  isActive,
  onStart,
  onEnd,
}: {
  participant: { participantId: string; displayName: string }
  isActive: boolean
  onStart: () => void
  onEnd: () => void
}) {
  const [isPressed, setIsPressed] = useState(false)

  const handleMouseDown = useCallback(() => {
    setIsPressed(true)
    onStart()
  }, [onStart])

  const handleMouseUp = useCallback(() => {
    setIsPressed(false)
    onEnd()
  }, [onEnd])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    setIsPressed(true)
    onStart()
  }, [onStart])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    setIsPressed(false)
    onEnd()
  }, [onEnd])

  return (
    <button
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`
        relative px-2 py-1 text-[10px] font-mono transition-all
        ${isPressed || isActive
          ? 'bg-yellow-600 text-black'
          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
        }
      `}
    >
      <div className="flex items-center gap-1">
        {(isPressed || isActive) && (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        )}
        <span>{participant.displayName}</span>
      </div>
    </button>
  )
}

function CreateGroupForm({
  participants,
  onSubmit,
  onCancel,
}: {
  participants: Array<{ participantId: string; displayName: string }>
  onSubmit: (name: string, color: string, memberIds: string[]) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(GROUP_COLORS[0])
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit(name.trim(), color, selectedMembers)
  }

  const toggleMember = (id: string) => {
    setSelectedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 bg-gray-900 p-2">
      <div>
        <label className="mb-0.5 block text-[9px] font-mono uppercase tracking-wider text-gray-600">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Talent, Studio"
          className="w-full bg-gray-800 px-2 py-1 text-[10px] text-white placeholder-gray-600 focus:outline-none"
          autoFocus
        />
      </div>

      <div>
        <label className="mb-0.5 block text-[9px] font-mono uppercase tracking-wider text-gray-600">Color</label>
        <div className="flex gap-0.5">
          {GROUP_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-4 w-4 transition-all ${
                color === c ? 'ring-1 ring-white ring-offset-1 ring-offset-gray-900' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="mb-0.5 block text-[9px] font-mono uppercase tracking-wider text-gray-600">Members</label>
        <div className="flex flex-wrap gap-0.5">
          {participants.map((p) => (
            <button
              key={p.participantId}
              type="button"
              onClick={() => toggleMember(p.participantId)}
              className={`px-1.5 py-0.5 text-[9px] transition-colors ${
                selectedMembers.includes(p.participantId)
                  ? 'bg-primary-900/50 text-primary-400'
                  : 'bg-gray-800 text-gray-500 hover:text-gray-400'
              }`}
            >
              {p.displayName}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-1 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-1 text-[9px] font-mono text-gray-500 hover:text-gray-400"
        >
          CANCEL
        </button>
        <button
          type="submit"
          disabled={!name.trim()}
          className="flex-1 bg-primary-900/50 py-1 text-[9px] font-mono text-primary-400 hover:bg-primary-900/70 disabled:opacity-50"
        >
          CREATE
        </button>
      </div>
    </form>
  )
}

function IncomingIFBIndicator({
  session,
}: {
  session: IFBSession
}) {
  return (
    <div className="fixed right-4 top-4 z-50 animate-pulse">
      <div className="flex items-center gap-2 bg-yellow-600 px-3 py-2 text-black shadow-xl">
        <div className="h-2 w-2 animate-ping rounded-full bg-red-600" />
        <div>
          <div className="text-[11px] font-bold">IFB ACTIVE</div>
          <div className="text-[9px] opacity-75">
            {session.sender?.displayName || 'Producer'}
          </div>
        </div>
      </div>
    </div>
  )
}

export function IFBPanel({
  roomId,
  isHost,
  participantId,
  participants,
}: IFBPanelProps) {
  const tokens = useAuthStore((state) => state.tokens)
  const [groups, setGroups] = useState<TalkbackGroup[]>([])
  const [activeSessions, setActiveSessions] = useState<IFBSession[]>([])
  const [incomingIFB, setIncomingIFB] = useState<IFBSession | null>(null)
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    if (!tokens?.accessToken || !roomId) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('talkback:list-groups', { roomId }, (response: { groups?: TalkbackGroup[] }) => {
        if (response.groups) {
          setGroups(response.groups)
        }
        setIsLoading(false)
      })
      socket.emit('ifb:list', { roomId }, (response: { sessions?: IFBSession[] }) => {
        if (response.sessions) {
          setActiveSessions(response.sessions)
        }
      })
    })

    socket.on('talkback:group-created', (data: { group: TalkbackGroup }) => {
      setGroups((prev) => [...prev, data.group])
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

    socket.on('ifb:started', (data: { session: IFBSession; forParticipantId?: string; forParticipantIds?: string[] }) => {
      setActiveSessions((prev) => [...prev, data.session])

      if (
        data.forParticipantId === participantId ||
        data.forParticipantIds?.includes(participantId) ||
        data.session.targetType === 'ALL'
      ) {
        setIncomingIFB(data.session)
      }
    })

    socket.on('ifb:updated', (data: { sessionId: string; level?: number; duckingLevel?: number }) => {
      setActiveSessions((prev) =>
        prev.map((s) =>
          s.id === data.sessionId
            ? { ...s, level: data.level ?? s.level, duckingLevel: data.duckingLevel ?? s.duckingLevel }
            : s
        )
      )
    })

    socket.on('ifb:ended', (data: { sessionId: string }) => {
      setActiveSessions((prev) => prev.filter((s) => s.id !== data.sessionId))
      setIncomingIFB((prev) => (prev?.id === data.sessionId ? null : prev))
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [tokens?.accessToken, roomId, participantId])

  const handleCreateGroup = useCallback(
    (name: string, color: string, memberIds: string[]) => {
      socketRef.current?.emit('talkback:create-group', {
        roomId,
        name,
        color,
        participantIds: memberIds,
      })
      setShowCreateGroup(false)
    },
    [roomId]
  )

  const handleDeleteGroup = useCallback(
    (groupId: string) => {
      socketRef.current?.emit('talkback:delete-group', { roomId, groupId })
    },
    [roomId]
  )

  const handleAddMember = useCallback(
    (groupId: string, pId: string) => {
      socketRef.current?.emit('talkback:add-member', { roomId, groupId, participantId: pId })
    },
    [roomId]
  )

  const handleRemoveMember = useCallback(
    (groupId: string, pId: string) => {
      socketRef.current?.emit('talkback:remove-member', { roomId, groupId, participantId: pId })
    },
    [roomId]
  )

  const startIFBToParticipant = useCallback(
    (targetParticipantId: string) => {
      socketRef.current?.emit('ifb:start', {
        roomId,
        targetType: IFBTargetType.PARTICIPANT,
        targetParticipantId,
        level: 1.0,
        duckingLevel: 0.3,
      })
    },
    [roomId]
  )

  const startIFBToGroup = useCallback(
    (targetGroupId: string) => {
      socketRef.current?.emit('ifb:start', {
        roomId,
        targetType: IFBTargetType.GROUP,
        targetGroupId,
        level: 1.0,
        duckingLevel: 0.3,
      })
    },
    [roomId]
  )

  const startIFBToAll = useCallback(() => {
    socketRef.current?.emit('ifb:start', {
      roomId,
      targetType: IFBTargetType.ALL,
      level: 1.0,
      duckingLevel: 0.3,
    })
  }, [roomId])

  const endIFB = useCallback(
    (sessionId: string) => {
      socketRef.current?.emit('ifb:end', { roomId, sessionId })
    },
    [roomId]
  )

  const myActiveSession = activeSessions.find((s) => s.senderId === participantId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="h-4 w-4 animate-spin border-2 border-gray-600 border-t-gray-400" />
      </div>
    )
  }

  if (!isHost) {
    return (
      <>
        {incomingIFB && <IncomingIFBIndicator session={incomingIFB} />}
        <div className="bg-black p-3 text-center">
          <p className="text-[10px] font-mono text-gray-600">IFB: HOST ONLY</p>
          {incomingIFB && (
            <p className="mt-1 text-[10px] font-mono text-yellow-400">
              PRODUCER IFB ACTIVE
            </p>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="flex flex-col bg-black">
      {incomingIFB && <IncomingIFBIndicator session={incomingIFB} />}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-1.5">
        <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">IFB / Talkback</h3>
        {myActiveSession && (
          <span className="animate-pulse bg-yellow-600 px-1 py-0.5 text-[8px] font-mono font-bold text-black">
            IFB
          </span>
        )}
      </div>

      {/* Quick IFB */}
      <div className="border-b border-gray-800 p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[9px] font-mono uppercase text-gray-600">Quick IFB</span>
          <button
            onClick={myActiveSession ? () => endIFB(myActiveSession.id) : startIFBToAll}
            className={`px-1.5 py-0.5 text-[9px] font-mono transition-colors ${
              myActiveSession
                ? 'bg-red-900/50 text-red-400 hover:bg-red-900/70'
                : 'bg-yellow-900/50 text-yellow-400 hover:bg-yellow-900/70'
            }`}
          >
            {myActiveSession ? 'END' : 'ALL'}
          </button>
        </div>

        <div className="flex flex-wrap gap-0.5">
          {participants.map((p) => {
            const sessionForParticipant = activeSessions.find(
              (s) =>
                s.senderId === participantId &&
                s.targetType === 'PARTICIPANT' &&
                s.targetParticipantId === p.participantId
            )
            return (
              <IFBButton
                key={p.participantId}
                participant={p}
                isActive={!!sessionForParticipant}
                onStart={() => startIFBToParticipant(p.participantId)}
                onEnd={() => sessionForParticipant && endIFB(sessionForParticipant.id)}
              />
            )
          })}
        </div>
      </div>

      {/* Talkback Groups */}
      <div className="max-h-48 space-y-1 overflow-y-auto p-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-mono uppercase text-gray-600">Groups</span>
          <button
            onClick={() => setShowCreateGroup(true)}
            className="text-[9px] font-mono text-primary-500 hover:text-primary-400"
          >
            + New
          </button>
        </div>

        {showCreateGroup && (
          <CreateGroupForm
            participants={participants}
            onSubmit={handleCreateGroup}
            onCancel={() => setShowCreateGroup(false)}
          />
        )}

        {groups.map((group) => {
          const sessionForGroup = activeSessions.find(
            (s) =>
              s.senderId === participantId &&
              s.targetType === 'GROUP' &&
              s.targetGroupId === group.id
          )
          return (
            <TalkbackGroupCard
              key={group.id}
              group={group}
              participants={participants}
              onAddMember={(pId) => handleAddMember(group.id, pId)}
              onRemoveMember={(pId) => handleRemoveMember(group.id, pId)}
              onDelete={() => handleDeleteGroup(group.id)}
              onStartIFB={() =>
                sessionForGroup ? endIFB(sessionForGroup.id) : startIFBToGroup(group.id)
              }
            />
          )
        })}

        {groups.length === 0 && !showCreateGroup && (
          <p className="py-4 text-center text-[10px] font-mono text-gray-600">
            NO GROUPS
          </p>
        )}
      </div>

      {/* Active Sessions */}
      {activeSessions.length > 0 && (
        <div className="border-t border-gray-800 p-1.5">
          <span className="text-[9px] font-mono uppercase text-gray-600">Active</span>
          <div className="mt-1 space-y-0.5">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between bg-yellow-950/30 px-1.5 py-0.5 text-[9px]"
              >
                <span className="font-mono text-yellow-400">
                  {session.sender?.displayName || '?'} →{' '}
                  {session.targetType === 'ALL'
                    ? 'ALL'
                    : session.targetType === 'GROUP'
                    ? 'Group'
                    : session.targetParticipant?.displayName || '?'}
                </span>
                {session.senderId === participantId && (
                  <button
                    onClick={() => endIFB(session.id)}
                    className="font-mono text-red-400 hover:text-red-300"
                  >
                    END
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
