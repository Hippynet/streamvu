import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../services/api'
import CreateRoomModal from '../components/callCenter/CreateRoomModal'
import { HippynetPromo } from '../components/promotions/HippynetPromo'
import type { CallRoomWithParticipants } from '@streamvu/shared'

export default function CallCenter() {
  const navigate = useNavigate()
  const [rooms, setRooms] = useState<CallRoomWithParticipants[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const fetchRooms = async () => {
    try {
      const data = await api.rooms.list()
      setRooms(data)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load rooms')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRooms()
  }, [])

  const handleRoomCreated = () => {
    fetchRooms()
  }

  const handleJoinRoom = (roomId: string) => {
    navigate(`/call-center/room/${roomId}`)
  }

  const activeRooms = rooms.filter((r) => r.isActive)
  const inactiveRooms = rooms.filter((r) => !r.isActive)

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center p-6">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Call Center</h1>
          <p className="mt-1 text-gray-400">WebRTC audio rooms for broadcast contributions</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          <svg
            className="-ml-1 mr-2 h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Create Room
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-700 bg-red-900/50 p-4 text-red-300">
          {error}
        </div>
      )}

      {/* Active Rooms */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-white">
          Active Rooms ({activeRooms.length})
        </h2>
        {activeRooms.length === 0 ? (
          <div className="space-y-6">
            <div className="card p-8 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-white">No active rooms</h3>
              <p className="mt-2 text-gray-400">
                Create a room to start accepting audio contributions.
              </p>
              <button
                className="btn btn-primary mt-4"
                onClick={() => setShowCreateModal(true)}
              >
                Create Your First Room
              </button>
            </div>
            <HippynetPromo variant="banner" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onJoin={() => handleJoinRoom(room.id)}
                onRefresh={fetchRooms}
              />
            ))}
          </div>
        )}
      </div>

      {/* Inactive/Closed Rooms */}
      {inactiveRooms.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-400">
            Closed Rooms ({inactiveRooms.length})
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {inactiveRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                onJoin={() => handleJoinRoom(room.id)}
                onRefresh={fetchRooms}
                disabled
              />
            ))}
          </div>
        </div>
      )}

      <CreateRoomModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleRoomCreated}
      />
    </div>
  )
}

interface RoomCardProps {
  room: CallRoomWithParticipants
  onJoin: () => void
  onRefresh: () => void
  disabled?: boolean
}

function RoomCard({ room, onJoin, onRefresh, disabled }: RoomCardProps) {
  const [copying, setCopying] = useState(false)
  const [closing, setClosing] = useState(false)

  const handleCopyLink = async () => {
    if (!room.inviteToken) return
    const link = `${window.location.origin}/join/${room.inviteToken}`
    await navigator.clipboard.writeText(link)
    setCopying(true)
    setTimeout(() => setCopying(false), 2000)
  }

  const handleCloseRoom = async () => {
    if (!confirm('Are you sure you want to close this room? All participants will be disconnected.')) {
      return
    }
    setClosing(true)
    try {
      await api.rooms.close(room.id)
      onRefresh()
    } catch (err) {
      console.error('Failed to close room:', err)
    } finally {
      setClosing(false)
    }
  }

  return (
    <div
      className={`card p-4 transition-all ${
        disabled ? 'opacity-60' : 'hover:border-gray-600'
      }`}
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-white">{room.name}</h3>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                room.visibility === 'PUBLIC'
                  ? 'bg-green-900/50 text-green-400'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              {room.visibility}
            </span>
            {room.isActive ? (
              <span className="inline-flex items-center gap-1 text-xs text-green-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-400"></span>
                Live
              </span>
            ) : (
              <span className="text-xs text-gray-500">Closed</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-gray-400">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
          <span className="text-sm">{room.participantCount}/{room.maxParticipants}</span>
        </div>
      </div>

      {/* Participants preview */}
      {room.participants.length > 0 && (
        <div className="mb-3 flex -space-x-2">
          {room.participants.slice(0, 5).map((p) => (
            <div
              key={p.id}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-800 bg-gray-600 text-xs font-medium text-white"
              title={p.displayName}
            >
              {p.displayName.charAt(0).toUpperCase()}
            </div>
          ))}
          {room.participants.length > 5 && (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-gray-800 bg-gray-700 text-xs text-gray-300">
              +{room.participants.length - 5}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onJoin}
          disabled={disabled}
          className="btn btn-primary flex-1 text-sm"
        >
          {disabled ? 'View' : 'Join'}
        </button>
        {room.visibility === 'PUBLIC' && room.inviteToken && !disabled && (
          <button
            onClick={handleCopyLink}
            className="btn btn-secondary text-sm"
            title="Copy invite link"
          >
            {copying ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                />
              </svg>
            )}
          </button>
        )}
        {room.isActive && (
          <button
            onClick={handleCloseRoom}
            disabled={closing}
            className="btn btn-secondary text-sm text-red-400 hover:text-red-300"
            title="Close room"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Access code hint for public rooms */}
      {room.visibility === 'PUBLIC' && room.accessCode && !disabled && (
        <p className="mt-2 text-center text-xs text-gray-500">
          Access code: <span className="font-mono text-gray-400">{room.accessCode}</span>
        </p>
      )}
    </div>
  )
}
