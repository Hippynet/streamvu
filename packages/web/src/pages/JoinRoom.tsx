import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import type { CallRoomWithParticipants } from '@streamvu/shared'

export default function JoinRoom() {
  const { inviteToken } = useParams<{ inviteToken: string }>()
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  const [room, setRoom] = useState<CallRoomWithParticipants | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!inviteToken) return

    const fetchRoom = async () => {
      try {
        const data = await api.rooms.getByInviteToken(inviteToken)
        setRoom(data)
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Room not found or invite link is invalid')
      } finally {
        setLoading(false)
      }
    }

    fetchRoom()
  }, [inviteToken])

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!room) return

    // For now, just navigate to the room (WebRTC will handle actual joining in Phase 3)
    // TODO: Validate access code on backend, create participant record
    setJoining(true)

    // Simulate a brief delay for UX
    await new Promise((resolve) => setTimeout(resolve, 500))

    // If authenticated, go directly to room; otherwise store guest info
    if (isAuthenticated) {
      navigate(`/call-center/room/${room.id}`)
    } else {
      // Store guest info in session storage for the room page
      sessionStorage.setItem('guestDisplayName', displayName)
      sessionStorage.setItem('guestAccessCode', accessCode)
      navigate(`/call-center/room/${room.id}`)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-900">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary-500"></div>
      </div>
    )
  }

  if (error || !room) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-4">
        <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-800 p-8 text-center">
          <svg className="mx-auto h-16 w-16 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <h2 className="mt-4 text-xl font-semibold text-white">Unable to Join</h2>
          <p className="mt-2 text-gray-400">{error}</p>
          <a href="/" className="btn btn-primary mt-6 inline-block">
            Go to StreamVU
          </a>
        </div>
      </div>
    )
  }

  if (!room.isActive) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-4">
        <div className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-800 p-8 text-center">
          <svg className="mx-auto h-16 w-16 text-gray-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
          <h2 className="mt-4 text-xl font-semibold text-white">Room Closed</h2>
          <p className="mt-2 text-gray-400">This room is no longer active.</p>
          <a href="/" className="btn btn-primary mt-6 inline-block">
            Go to StreamVU
          </a>
        </div>
      </div>
    )
  }

  const isFull = room.participantCount >= room.maxParticipants

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary-500">StreamVU</h1>
          <p className="mt-2 text-gray-400">Join Audio Room</p>
        </div>

        {/* Room Info Card */}
        <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-500/20">
              <svg className="h-8 w-8 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-white">{room.name}</h2>
            <div className="mt-2 flex items-center justify-center gap-2 text-sm text-gray-400">
              <span className="flex items-center gap-1 text-green-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-green-400"></span>
                Live
              </span>
              <span>•</span>
              <span>{room.participantCount}/{room.maxParticipants} participants</span>
            </div>
          </div>

          {isFull ? (
            <div className="rounded-lg border border-yellow-700 bg-yellow-900/30 p-4 text-center">
              <p className="text-yellow-300">This room is currently full.</p>
              <p className="mt-1 text-sm text-yellow-400">Please try again later.</p>
            </div>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              {!isAuthenticated && (
                <div>
                  <label htmlFor="displayName" className="block text-sm font-medium text-gray-300">
                    Your Name
                  </label>
                  <input
                    type="text"
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Enter your display name"
                    required
                    maxLength={50}
                  />
                </div>
              )}

              {room.accessCode && (
                <div>
                  <label htmlFor="accessCode" className="block text-sm font-medium text-gray-300">
                    Access Code
                  </label>
                  <input
                    type="text"
                    id="accessCode"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, ''))}
                    className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 font-mono text-center text-lg tracking-widest text-white placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="• • • •"
                    required
                    maxLength={10}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Enter the code provided by the room host
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={joining || (!isAuthenticated && !displayName.trim())}
                className="btn btn-primary w-full"
              >
                {joining ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Joining...
                  </span>
                ) : (
                  'Join Room'
                )}
              </button>
            </form>
          )}

          {/* Current Participants Preview */}
          {room.participants.length > 0 && (
            <div className="mt-6 border-t border-gray-700 pt-4">
              <p className="mb-3 text-sm text-gray-400">Currently in room:</p>
              <div className="flex flex-wrap gap-2">
                {room.participants.slice(0, 6).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-full bg-gray-700 px-3 py-1 text-sm text-gray-300"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-600 text-xs font-medium">
                      {p.displayName.charAt(0).toUpperCase()}
                    </span>
                    {p.displayName}
                  </div>
                ))}
                {room.participants.length > 6 && (
                  <div className="flex items-center rounded-full bg-gray-700 px-3 py-1 text-sm text-gray-400">
                    +{room.participants.length - 6} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-gray-500">
          Powered by{' '}
          <a href="https://hippynet.co.uk" className="text-primary-500 hover:underline" target="_blank" rel="noopener noreferrer">
            Hippynet
          </a>
        </p>
      </div>
    </div>
  )
}
