/**
 * GreenRoom - Pre-show staging area for participants
 *
 * Displays participants waiting in green rooms with:
 * - "Next Up" queue management
 * - Drag-drop to move participants between rooms
 * - Countdown timer before going live
 * - IFB/talkback access for producer communication
 */

import { useState, useCallback, useEffect } from 'react'
import type { Socket } from 'socket.io-client'
import {
  type RoomType,
  type GreenRoomInfo,
  type GreenRoomParticipant,
  type ParticipantMovedEvent,
  type CountdownToLiveEvent,
  ParticipantRole,
} from '@streamvu/shared'

interface GreenRoomProps {
  socket: Socket | null
  liveRoomId: string
  liveRoomName: string
  isProducer: boolean
  /** Called when a participant is moved to the live room */
  onMoveToLive?: (participantId: string) => void
}

interface QueuedParticipant extends GreenRoomParticipant {
  roomId: string
  roomName: string
  countdown?: number
}

export function GreenRoom({
  socket,
  liveRoomId,
  liveRoomName: _liveRoomName,
  isProducer,
  onMoveToLive,
}: GreenRoomProps) {
  const [greenRooms, setGreenRooms] = useState<GreenRoomInfo[]>([])
  const [queue, setQueue] = useState<QueuedParticipant[]>([])
  const [isExpanded, setIsExpanded] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newRoomName, setNewRoomName] = useState('')
  const [countdowns, setCountdowns] = useState<Record<string, number>>({})

  // Load green rooms
  const loadGreenRooms = useCallback(() => {
    if (!socket || !liveRoomId) return

    socket.emit('greenroom:list', { roomId: liveRoomId }, (response: { success?: boolean; greenRooms?: GreenRoomInfo[]; error?: string }) => {
      if (response.success && response.greenRooms) {
        setGreenRooms(response.greenRooms)
        // Build queue from all green rooms
        const newQueue: QueuedParticipant[] = []
        response.greenRooms.forEach((room: GreenRoomInfo) => {
          room.participants.forEach((p: GreenRoomParticipant) => {
            newQueue.push({
              ...p,
              roomId: room.id,
              roomName: room.name,
            })
          })
        })
        setQueue(newQueue)
      }
    })
  }, [socket, liveRoomId])

  // Initial load
  useEffect(() => {
    loadGreenRooms()
  }, [loadGreenRooms])

  // Listen for green room events
  useEffect(() => {
    if (!socket) return

    const handleCreated = (event: { room: GreenRoomInfo; parentRoomId: string }) => {
      if (event.parentRoomId === liveRoomId) {
        setGreenRooms((prev) => [...prev, event.room])
      }
    }

    const handleDeleted = (event: { roomId: string; parentRoomId: string }) => {
      if (event.parentRoomId === liveRoomId) {
        setGreenRooms((prev) => prev.filter((r) => r.id !== event.roomId))
        setQueue((prev) => prev.filter((p) => p.roomId !== event.roomId))
      }
    }

    const handleMoved = (event: ParticipantMovedEvent) => {
      // Update queue when participant moves
      setQueue((prev) => {
        const updated = prev.filter((p) => p.id !== event.participantId)
        // If moved to a green room (not live), add to queue
        if (event.toRoomType === 'GREEN_ROOM' || event.toRoomType === 'BREAKOUT') {
          const greenRoom = greenRooms.find((r) => r.id === event.toRoomId)
          if (greenRoom) {
            updated.push({
              id: event.participantId,
              displayName: event.participantName,
              role: ParticipantRole.PARTICIPANT,
              isConnected: true,
              isSpeaking: false,
              queuePosition: event.queuePosition,
              joinedAt: new Date().toISOString(),
              roomId: event.toRoomId,
              roomName: greenRoom.name,
            })
          }
        }
        return updated.sort((a, b) => a.queuePosition - b.queuePosition)
      })

      // Callback if moved to live
      if (event.toRoomId === liveRoomId) {
        onMoveToLive?.(event.participantId)
      }
    }

    const handleCountdown = (event: CountdownToLiveEvent) => {
      setCountdowns((prev) => ({
        ...prev,
        [event.participantId]: event.secondsRemaining,
      }))

      // Clear countdown after it reaches 0
      if (event.secondsRemaining <= 0) {
        setTimeout(() => {
          setCountdowns((prev) => {
            const next = { ...prev }
            delete next[event.participantId]
            return next
          })
        }, 1000)
      }
    }

    socket.on('greenroom:created', handleCreated)
    socket.on('greenroom:deleted', handleDeleted)
    socket.on('greenroom:participant-moved', handleMoved)
    socket.on('greenroom:countdown', handleCountdown)

    return () => {
      socket.off('greenroom:created', handleCreated)
      socket.off('greenroom:deleted', handleDeleted)
      socket.off('greenroom:participant-moved', handleMoved)
      socket.off('greenroom:countdown', handleCountdown)
    }
  }, [socket, liveRoomId, greenRooms, onMoveToLive])

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdowns((prev) => {
        const next: Record<string, number> = {}
        for (const [id, seconds] of Object.entries(prev)) {
          if (seconds > 0) {
            next[id] = seconds - 1
          }
        }
        return next
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Create green room
  const handleCreateGreenRoom = useCallback(() => {
    if (!socket || !newRoomName.trim()) return

    socket.emit('greenroom:create', {
      parentRoomId: liveRoomId,
      name: newRoomName.trim(),
      type: 'GREEN_ROOM',
    }, (response: { success?: boolean; error?: string }) => {
      if (response.success) {
        setNewRoomName('')
        setIsCreating(false)
      }
    })
  }, [socket, liveRoomId, newRoomName])

  // Delete green room
  const handleDeleteGreenRoom = useCallback((greenRoomId: string) => {
    if (!socket) return

    socket.emit('greenroom:delete', {
      roomId: liveRoomId,
      greenRoomId,
    })
  }, [socket, liveRoomId])

  // Move participant to live
  const handleMoveToLive = useCallback((participantId: string) => {
    if (!socket) return

    socket.emit('greenroom:move-participant', {
      roomId: liveRoomId,
      participantId,
      targetRoomId: liveRoomId,
    })
  }, [socket, liveRoomId])

  // Start countdown for participant
  const handleStartCountdown = useCallback((participantId: string, seconds: number) => {
    if (!socket) return

    socket.emit('greenroom:countdown', {
      roomId: liveRoomId,
      participantId,
      seconds,
      targetRoomId: liveRoomId,
    })
  }, [socket, liveRoomId])

  // Get room type badge color
  const getRoomTypeBadge = (type: RoomType) => {
    switch (type) {
      case 'GREEN_ROOM':
        return 'bg-green-600 text-white'
      case 'BREAKOUT':
        return 'bg-blue-600 text-white'
      default:
        return 'bg-gray-600 text-white'
    }
  }

  const totalInQueue = queue.length

  return (
    <div className="border border-gray-800 bg-gray-950">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between border-b border-gray-800 bg-gray-900 px-3 py-2 text-left hover:bg-gray-800"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`h-4 w-4 text-green-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
            Green Room
          </span>
          {totalInQueue > 0 && (
            <span className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {totalInQueue}
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-500">
          {greenRooms.length} room{greenRooms.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-2 space-y-2">
          {/* Next Up Queue */}
          {queue.length > 0 && (
            <div className="border border-gray-800 rounded bg-gray-900/50">
              <div className="flex items-center justify-between px-2 py-1 border-b border-gray-800">
                <span className="text-[10px] font-mono uppercase tracking-wider text-amber-500">
                  Next Up
                </span>
              </div>
              <div className="p-1 space-y-1 max-h-32 overflow-y-auto">
                {queue.map((participant, index) => (
                  <div
                    key={participant.id}
                    className={`flex items-center justify-between px-2 py-1 rounded text-xs ${
                      countdowns[participant.id] !== undefined
                        ? 'bg-amber-600/20 border border-amber-600'
                        : 'bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-4 text-center text-[10px] text-gray-500">
                        {index + 1}
                      </span>
                      <span className={participant.isConnected ? 'text-white' : 'text-gray-500'}>
                        {participant.displayName}
                      </span>
                      <span className="text-[9px] text-gray-500">
                        ({participant.roomName})
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      {countdowns[participant.id] !== undefined ? (
                        <span className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-mono font-bold text-white animate-pulse">
                          {countdowns[participant.id]}s
                        </span>
                      ) : isProducer && (
                        <>
                          <button
                            onClick={() => handleStartCountdown(participant.id, 10)}
                            className="p-1 text-gray-500 hover:text-amber-400"
                            title="10s countdown"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleMoveToLive(participant.id)}
                            className="p-1 text-gray-500 hover:text-green-400"
                            title="Move to live"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Green Rooms List */}
          {greenRooms.map((room) => (
            <div key={room.id} className="border border-gray-800 rounded">
              <div className="flex items-center justify-between px-2 py-1 bg-gray-900/50 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 text-[8px] font-bold uppercase rounded ${getRoomTypeBadge(room.type)}`}>
                    {room.type === 'GREEN_ROOM' ? 'GR' : 'BR'}
                  </span>
                  <span className="text-xs text-white">{room.name}</span>
                  <span className="text-[10px] text-gray-500">
                    ({room.participantCount})
                  </span>
                </div>
                {isProducer && (
                  <button
                    onClick={() => handleDeleteGreenRoom(room.id)}
                    className="p-0.5 text-gray-500 hover:text-red-400"
                    title="Delete room"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
              {room.participants.length > 0 && (
                <div className="p-1 space-y-0.5">
                  {room.participants.map((p: GreenRoomParticipant) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-2 py-0.5 text-xs"
                    >
                      <div className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${p.isConnected ? 'bg-green-500' : 'bg-gray-500'}`} />
                        <span className={p.isConnected ? 'text-gray-300' : 'text-gray-500'}>
                          {p.displayName}
                        </span>
                      </div>
                      {isProducer && p.isConnected && (
                        <button
                          onClick={() => handleMoveToLive(p.id)}
                          className="text-[10px] text-gray-500 hover:text-green-400"
                        >
                          → Live
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {room.participants.length === 0 && (
                <div className="p-2 text-center text-[10px] text-gray-600">
                  Empty
                </div>
              )}
            </div>
          ))}

          {/* Create Green Room */}
          {isProducer && (
            <div>
              {isCreating ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="Room name..."
                    className="flex-1 px-2 py-1 text-xs bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-gray-600"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateGreenRoom()}
                    autoFocus
                  />
                  <button
                    onClick={handleCreateGreenRoom}
                    disabled={!newRoomName.trim()}
                    className="px-2 py-1 text-xs bg-green-600 text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false)
                      setNewRoomName('')
                    }}
                    className="px-2 py-1 text-xs bg-gray-700 text-gray-300 hover:bg-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsCreating(true)}
                  className="w-full px-2 py-1 text-xs text-gray-500 hover:text-white hover:bg-gray-800 border border-dashed border-gray-700 hover:border-gray-600 transition-colors"
                >
                  + Add Green Room
                </button>
              )}
            </div>
          )}

          {/* Empty State */}
          {greenRooms.length === 0 && !isCreating && (
            <div className="text-center py-4 text-xs text-gray-500">
              No green rooms yet
              {isProducer && (
                <div className="mt-1 text-[10px]">
                  Create one to stage participants
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default GreenRoom
