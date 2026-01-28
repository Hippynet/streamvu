import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import type { CallRoomWithParticipants } from '@streamvu/shared'

interface ActiveRoomsWidgetProps {
  isExpanded: boolean
  onToggleExpanded: () => void
}

export function ActiveRoomsWidget({ isExpanded, onToggleExpanded }: ActiveRoomsWidgetProps) {
  const [rooms, setRooms] = useState<CallRoomWithParticipants[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch active rooms
  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const data = await api.rooms.list()
        // Filter to only active rooms
        const activeRooms = data.filter((room) => room.isActive)
        setRooms(activeRooms)
      } catch (err) {
        console.error('Failed to fetch rooms:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchRooms()
    // Refresh every 15 seconds
    const interval = setInterval(fetchRooms, 15000)
    return () => clearInterval(interval)
  }, [])

  // Count total connected participants across all rooms
  const totalParticipants = rooms.reduce((acc, room) => {
    const connected = room.participants?.filter((p) => p.isConnected).length || 0
    return acc + connected
  }, 0)

  if (!isExpanded) {
    return (
      <button
        onClick={onToggleExpanded}
        className="fixed bottom-16 right-4 z-40 flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm shadow-lg transition-all hover:border-primary-600"
      >
        <span className="flex h-2 w-2 rounded-full bg-green-500" />
        <span className="text-white">{rooms.length} Active Rooms</span>
        {totalParticipants > 0 && (
          <span className="rounded bg-primary-600 px-1.5 py-0.5 text-xs text-white">
            {totalParticipants} online
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="fixed bottom-16 right-4 z-40 w-80 rounded-lg border border-gray-700 bg-gray-900 shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-green-500" />
          <h3 className="font-semibold text-white">Active Call Rooms</h3>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/call-center"
            className="rounded bg-primary-600 px-2 py-1 text-xs text-white hover:bg-primary-500"
          >
            View All
          </Link>
          <button
            onClick={onToggleExpanded}
            className="text-gray-400 hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-64 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-600 border-t-primary-500" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="py-6 text-center">
            <div className="text-3xl text-gray-700">
              <svg className="mx-auto h-10 w-10" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
            </div>
            <p className="mt-2 text-sm text-gray-500">No active rooms</p>
            <Link
              to="/call-center"
              className="mt-2 inline-block text-sm text-primary-400 hover:text-primary-300"
            >
              Create a room
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {rooms.map((room) => {
              const connectedCount = room.participants?.filter((p) => p.isConnected).length || 0
              const waitingCount = room.participants?.filter((p) => p.isInWaitingRoom).length || 0

              return (
                <Link
                  key={room.id}
                  to={`/call-center/room/${room.id}`}
                  className="flex items-center justify-between rounded-lg bg-gray-800 p-3 transition-colors hover:bg-gray-750"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-white">{room.name}</span>
                      {room.visibility === 'PUBLIC' && (
                        <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-xs text-blue-400">
                          Public
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                        </svg>
                        {connectedCount} connected
                      </span>
                      {waitingCount > 0 && (
                        <span className="flex items-center gap-1 text-yellow-400">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {waitingCount} waiting
                        </span>
                      )}
                    </div>
                  </div>
                  <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {rooms.length > 0 && (
        <div className="border-t border-gray-700 px-4 py-2 text-xs text-gray-500">
          {totalParticipants} total participants across {rooms.length} room{rooms.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
