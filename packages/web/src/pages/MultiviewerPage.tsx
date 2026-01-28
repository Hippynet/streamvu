/**
 * MultiviewerPage - Fullscreen multiviewer for monitoring all participants
 *
 * Professional multiviewer display showing:
 * - Grid of all participant feeds
 * - Audio level meters
 * - Tally lights (on-air indication)
 * - Clock and timecode display
 * - Custom layout configurations
 */

import { useEffect, useState, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../stores/authStore'
import { getWsUrl } from '../config'
import { api, ApiError } from '../services/api'
import { Multiviewer } from '../components/callCenter/Multiviewer'
import type { CallRoomWithParticipants } from '@streamvu/shared'

interface ParticipantFeed {
  id: string
  name: string
  audioLevel: number
  isOnAir: boolean
  isMuted: boolean
  isSpeaking: boolean
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor'
}

export default function MultiviewerPage() {
  const { roomId } = useParams<{ roomId: string }>()
  const tokens = useAuthStore((state) => state.tokens)
  const user = useAuthStore((state) => state.user)

  const [room, setRoom] = useState<CallRoomWithParticipants | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [participants, setParticipants] = useState<ParticipantFeed[]>([])
  const [onAirIds] = useState<string[]>([])

  const socketRef = useRef<Socket | null>(null)

  // Fetch room data
  useEffect(() => {
    if (!roomId) return

    const fetchRoom = async () => {
      try {
        const data = await api.rooms.get(roomId)
        setRoom(data)

        // Convert participants to feed format
        setParticipants(
          data.participants.map((p) => ({
            id: p.id,
            name: p.displayName || 'Unknown',
            audioLevel: 0,
            isOnAir: false,
            isMuted: false,
            isSpeaking: false,
            connectionQuality: 'good' as const,
          }))
        )
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Failed to load room')
      } finally {
        setLoading(false)
      }
    }

    fetchRoom()
  }, [roomId])

  // Connect to socket for real-time updates
  useEffect(() => {
    if (!tokens?.accessToken || !roomId) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    socketRef.current = socket

    // Listen for participant events
    socket.on('participant:joined', (data: { participantId: string; displayName: string }) => {
      setParticipants((prev) => [
        ...prev,
        {
          id: data.participantId,
          name: data.displayName,
          audioLevel: 0,
          isOnAir: false,
          isMuted: false,
          isSpeaking: false,
          connectionQuality: 'good' as const,
        },
      ])
    })

    socket.on('participant:left', (data: { participantId: string }) => {
      setParticipants((prev) => prev.filter((p) => p.id !== data.participantId))
    })

    socket.on('participant:muted', (data: { participantId: string; isMuted: boolean }) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === data.participantId ? { ...p, isMuted: data.isMuted } : p))
      )
    })

    socket.on('participant:speaking', (data: { participantId: string; isSpeaking: boolean }) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === data.participantId ? { ...p, isSpeaking: data.isSpeaking } : p))
      )
    })

    socket.on('participant:audio-level', (data: { participantId: string; level: number }) => {
      setParticipants((prev) =>
        prev.map((p) => (p.id === data.participantId ? { ...p, audioLevel: data.level } : p))
      )
    })

    // Join the room for multiviewer updates
    socket.emit('multiviewer:join', { roomId })

    return () => {
      socket.emit('multiviewer:leave', { roomId })
      socket.disconnect()
      socketRef.current = null
    }
  }, [tokens?.accessToken, roomId])

  // Update on-air status
  useEffect(() => {
    setParticipants((prev) =>
      prev.map((p) => ({
        ...p,
        isOnAir: onAirIds.includes(p.id),
      }))
    )
  }, [onAirIds])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary-500"></div>
      </div>
    )
  }

  if (error || !room) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black">
        <div className="rounded-lg border border-red-700 bg-red-900/50 p-6 text-center">
          <h2 className="text-lg font-semibold text-white">Unable to Load Multiviewer</h2>
          <p className="mt-2 text-red-300">{error || 'Room not found'}</p>
          <Link to="/call-center" className="btn btn-primary mt-4 inline-block">
            Back to Call Center
          </Link>
        </div>
      </div>
    )
  }

  // Check if user is host
  const isHost = user && room.createdById === user.id

  if (!isHost) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-black">
        <div className="rounded-lg border border-yellow-700 bg-yellow-900/50 p-6 text-center">
          <h2 className="text-lg font-semibold text-white">Access Denied</h2>
          <p className="mt-2 text-yellow-300">
            Only the room host can access the multiviewer.
          </p>
          <Link to={`/call-center/room/${roomId}`} className="btn btn-primary mt-4 inline-block">
            Back to Room
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      {/* Back button overlay */}
      <div className="absolute left-4 top-4 z-50">
        <Link
          to={`/call-center/room/${roomId}`}
          className="flex items-center gap-2 rounded bg-gray-900/80 px-3 py-1.5 text-sm text-gray-300 backdrop-blur-sm transition-colors hover:bg-gray-800 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          Back to Room
        </Link>
      </div>

      {/* Fullscreen Multiviewer */}
      <Multiviewer
        participants={participants}
        layout="grid-3x3"
        showClock
        showTimecode
        showAudioMeters
        showLabels
        onTileClick={(participantId) => {
          console.log('Clicked participant:', participantId)
          // Could open a detailed view or actions menu
        }}
      />
    </div>
  )
}
