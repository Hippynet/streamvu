import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import type { CallRoomWithParticipants, UpdateRoomRequest } from '@streamvu/shared'

interface RoomSettingsModalProps {
  room: CallRoomWithParticipants
  isOpen: boolean
  onClose: () => void
  onUpdate: (updatedRoom: CallRoomWithParticipants) => void
}

export function RoomSettingsModal({ room, isOpen, onClose, onUpdate }: RoomSettingsModalProps) {
  const [name, setName] = useState(room.name)
  const [waitingRoom, setWaitingRoom] = useState(room.waitingRoom)
  const [maxParticipants, setMaxParticipants] = useState(room.maxParticipants)
  const [accessCode, setAccessCode] = useState(room.accessCode || '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  // Reset form when room changes
  useEffect(() => {
    setName(room.name)
    setWaitingRoom(room.waitingRoom)
    setMaxParticipants(room.maxParticipants)
    setAccessCode(room.accessCode || '')
    setError('')
  }, [room])

  const handleSave = async () => {
    setIsSaving(true)
    setError('')

    try {
      const updates: UpdateRoomRequest = {}

      if (name !== room.name) updates.name = name
      if (waitingRoom !== room.waitingRoom) updates.waitingRoom = waitingRoom
      if (maxParticipants !== room.maxParticipants) updates.maxParticipants = maxParticipants
      if (room.visibility === 'PUBLIC' && accessCode !== room.accessCode) {
        updates.accessCode = accessCode
      }

      // Only make API call if there are changes
      if (Object.keys(updates).length > 0) {
        const updatedRoom = await api.rooms.update(room.id, updates)
        // Merge with existing participants data
        onUpdate({ ...room, ...updatedRoom })
      }

      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md rounded-lg border border-gray-700 bg-gray-800 p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Room Settings</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-700 bg-red-900/50 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-6 space-y-5">
          {/* Room Name */}
          <div>
            <label htmlFor="room-name" className="block text-sm font-medium text-gray-300">
              Room Name
            </label>
            <input
              id="room-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="Enter room name"
            />
          </div>

          {/* Max Participants */}
          <div>
            <label htmlFor="max-participants" className="block text-sm font-medium text-gray-300">
              Max Participants
            </label>
            <select
              id="max-participants"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              {[2, 4, 6, 8, 10, 12, 16, 20, 25, 30, 40, 50].map((n) => (
                <option key={n} value={n}>
                  {n} participants
                </option>
              ))}
            </select>
          </div>

          {/* Access Code (public rooms only) */}
          {room.visibility === 'PUBLIC' && (
            <div>
              <label htmlFor="access-code" className="block text-sm font-medium text-gray-300">
                Access Code
              </label>
              <input
                id="access-code"
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 font-mono text-white placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="4-6 digit code"
                maxLength={6}
              />
              <p className="mt-1 text-xs text-gray-500">
                Guests will need this code to join the room
              </p>
            </div>
          )}

          {/* Waiting Room Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-gray-300">Waiting Room</span>
              <p className="text-xs text-gray-500">
                Participants must be admitted by host
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWaitingRoom(!waitingRoom)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-800 ${
                waitingRoom ? 'bg-primary-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  waitingRoom ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Room Info (read-only) */}
          <div className="rounded-lg bg-gray-900/50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Visibility</span>
              <span className="text-white capitalize">{room.visibility.toLowerCase()}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-gray-400">Created</span>
              <span className="text-white">
                {new Date(room.createdAt).toLocaleDateString()}
              </span>
            </div>
            {room.visibility === 'PUBLIC' && room.inviteToken && (
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-gray-400">Invite Link</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/join/${room.inviteToken}`
                    )
                  }}
                  className="text-primary-400 hover:text-primary-300"
                >
                  Copy Link
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-500 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}
