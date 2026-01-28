/**
 * RoomSwitcher - Drag & drop interface for moving participants between rooms
 *
 * Provides a visual overview of all rooms (Live, Green Room, Breakout)
 * with drag-drop functionality for producers to manage participant flow.
 */

import { useState, useCallback, useEffect, type DragEvent } from 'react'
import type { Socket } from 'socket.io-client'
import type { RoomType, GreenRoomInfo, GreenRoomParticipant } from '@streamvu/shared'

interface RoomSwitcherProps {
  socket: Socket | null
  liveRoomId: string
  liveRoomName: string
  liveParticipants: Array<{
    id: string
    displayName: string
    isConnected: boolean
  }>
  isProducer: boolean
  onParticipantMoved?: (participantId: string, fromRoom: string, toRoom: string) => void
}

interface RoomData {
  id: string
  name: string
  type: RoomType | 'LIVE'
  participants: Array<{
    id: string
    displayName: string
    isConnected: boolean
  }>
}

export function RoomSwitcher({
  socket,
  liveRoomId,
  liveRoomName,
  liveParticipants,
  isProducer,
  onParticipantMoved,
}: RoomSwitcherProps) {
  const [greenRooms, setGreenRooms] = useState<GreenRoomInfo[]>([])
  const [draggedParticipant, setDraggedParticipant] = useState<{
    id: string
    displayName: string
    fromRoomId: string
  } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  // Load green rooms
  useEffect(() => {
    if (!socket || !liveRoomId) return

    socket.emit('greenroom:list', { roomId: liveRoomId }, (response: { success?: boolean; greenRooms?: GreenRoomInfo[] }) => {
      if (response.success && response.greenRooms) {
        setGreenRooms(response.greenRooms)
      }
    })

    const handleCreated = (event: { room: GreenRoomInfo; parentRoomId: string }) => {
      if (event.parentRoomId === liveRoomId) {
        setGreenRooms((prev) => [...prev, event.room])
      }
    }

    const handleDeleted = (event: { roomId: string; parentRoomId: string }) => {
      if (event.parentRoomId === liveRoomId) {
        setGreenRooms((prev) => prev.filter((r) => r.id !== event.roomId))
      }
    }

    socket.on('greenroom:created', handleCreated)
    socket.on('greenroom:deleted', handleDeleted)

    return () => {
      socket.off('greenroom:created', handleCreated)
      socket.off('greenroom:deleted', handleDeleted)
    }
  }, [socket, liveRoomId])

  // Build room list
  const rooms: RoomData[] = [
    {
      id: liveRoomId,
      name: liveRoomName,
      type: 'LIVE',
      participants: liveParticipants,
    },
    ...greenRooms.map((gr) => ({
      id: gr.id,
      name: gr.name,
      type: gr.type,
      participants: gr.participants.map((p: GreenRoomParticipant) => ({
        id: p.id,
        displayName: p.displayName,
        isConnected: p.isConnected,
      })),
    })),
  ]

  // Drag handlers
  const handleDragStart = useCallback((
    e: DragEvent,
    participantId: string,
    displayName: string,
    fromRoomId: string
  ) => {
    if (!isProducer) {
      e.preventDefault()
      return
    }
    e.dataTransfer.effectAllowed = 'move'
    setDraggedParticipant({ id: participantId, displayName, fromRoomId })
  }, [isProducer])

  const handleDragEnd = useCallback(() => {
    setDraggedParticipant(null)
    setDropTarget(null)
  }, [])

  const handleDragOver = useCallback((e: DragEvent, roomId: string) => {
    e.preventDefault()
    if (draggedParticipant && draggedParticipant.fromRoomId !== roomId) {
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(roomId)
    }
  }, [draggedParticipant])

  const handleDragLeave = useCallback(() => {
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback((e: DragEvent, targetRoomId: string) => {
    e.preventDefault()
    if (!socket || !draggedParticipant || draggedParticipant.fromRoomId === targetRoomId) {
      setDropTarget(null)
      return
    }

    socket.emit('greenroom:move-participant', {
      roomId: liveRoomId,
      participantId: draggedParticipant.id,
      targetRoomId,
    }, (response: { success?: boolean }) => {
      if (response.success) {
        onParticipantMoved?.(
          draggedParticipant.id,
          draggedParticipant.fromRoomId,
          targetRoomId
        )
      }
    })

    setDropTarget(null)
    setDraggedParticipant(null)
  }, [socket, liveRoomId, draggedParticipant, onParticipantMoved])

  // Get room style based on type
  const getRoomStyle = (type: RoomType | 'LIVE') => {
    switch (type) {
      case 'LIVE':
        return {
          border: 'border-red-600',
          bg: 'bg-red-950/30',
          badge: 'bg-red-600',
          icon: (
            <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="8" />
            </svg>
          ),
        }
      case 'GREEN_ROOM':
        return {
          border: 'border-green-600',
          bg: 'bg-green-950/30',
          badge: 'bg-green-600',
          icon: (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          ),
        }
      case 'BREAKOUT':
        return {
          border: 'border-blue-600',
          bg: 'bg-blue-950/30',
          badge: 'bg-blue-600',
          icon: (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
          ),
        }
      default:
        return {
          border: 'border-gray-600',
          bg: 'bg-gray-950/30',
          badge: 'bg-gray-600',
          icon: null,
        }
    }
  }

  const getRoomLabel = (type: RoomType | 'LIVE') => {
    switch (type) {
      case 'LIVE':
        return 'LIVE'
      case 'GREEN_ROOM':
        return 'GR'
      case 'BREAKOUT':
        return 'BR'
      default:
        return '?'
    }
  }

  return (
    <div className="border border-gray-800 bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 bg-gray-900 px-3 py-2">
        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
          Room Switcher
        </span>
        {isProducer && (
          <span className="text-[9px] text-gray-600">Drag to move</span>
        )}
      </div>

      {/* Rooms Grid */}
      <div className="p-2 grid grid-cols-2 gap-2">
        {rooms.map((room) => {
          const style = getRoomStyle(room.type)
          const isDroppable = draggedParticipant && draggedParticipant.fromRoomId !== room.id
          const isOver = dropTarget === room.id

          return (
            <div
              key={room.id}
              className={`border rounded transition-all ${style.border} ${style.bg} ${
                isOver ? 'ring-2 ring-white ring-opacity-50 scale-[1.02]' : ''
              } ${isDroppable ? 'border-dashed' : ''}`}
              onDragOver={(e) => handleDragOver(e, room.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, room.id)}
            >
              {/* Room Header */}
              <div className="flex items-center gap-1.5 px-2 py-1 border-b border-gray-800/50">
                <span className={`px-1 py-0.5 text-[8px] font-bold text-white rounded ${style.badge}`}>
                  {getRoomLabel(room.type)}
                </span>
                <span className="text-[10px] text-white truncate flex-1">
                  {room.name}
                </span>
                <span className="text-[9px] text-gray-500">
                  {room.participants.length}
                </span>
              </div>

              {/* Participants */}
              <div className="p-1 min-h-[60px] max-h-[120px] overflow-y-auto">
                {room.participants.length > 0 ? (
                  <div className="space-y-0.5">
                    {room.participants.map((p) => (
                      <div
                        key={p.id}
                        draggable={isProducer}
                        onDragStart={(e) => handleDragStart(e, p.id, p.displayName, room.id)}
                        onDragEnd={handleDragEnd}
                        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
                          isProducer ? 'cursor-grab active:cursor-grabbing hover:bg-gray-800' : ''
                        } ${
                          draggedParticipant?.id === p.id ? 'opacity-50' : ''
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${
                          p.isConnected ? 'bg-green-500' : 'bg-gray-500'
                        }`} />
                        <span className={`truncate ${p.isConnected ? 'text-gray-300' : 'text-gray-500'}`}>
                          {p.displayName}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[9px] text-gray-600">
                    Empty
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Drag indicator */}
      {draggedParticipant && (
        <div className="px-2 py-1 border-t border-gray-800 bg-gray-900/50">
          <span className="text-[9px] text-gray-500">
            Moving: <span className="text-white">{draggedParticipant.displayName}</span>
          </span>
        </div>
      )}
    </div>
  )
}

export default RoomSwitcher
