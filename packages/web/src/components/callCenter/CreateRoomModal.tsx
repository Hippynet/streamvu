import { useState } from 'react'
import { api, ApiError } from '../../services/api'
import { RoomVisibility } from '@streamvu/shared'

interface CreateRoomModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

export default function CreateRoomModal({ isOpen, onClose, onCreated }: CreateRoomModalProps) {
  const [name, setName] = useState('')
  const [visibility, setVisibility] = useState<RoomVisibility>(RoomVisibility.PRIVATE)
  const [accessCode, setAccessCode] = useState('')
  const [maxParticipants, setMaxParticipants] = useState(8)
  const [waitingRoom, setWaitingRoom] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await api.rooms.create({
        name,
        visibility,
        accessCode: visibility === RoomVisibility.PUBLIC && accessCode ? accessCode : undefined,
        maxParticipants,
        waitingRoom,
      })
      onCreated()
      handleClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create room')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName('')
    setVisibility(RoomVisibility.PRIVATE)
    setAccessCode('')
    setMaxParticipants(8)
    setWaitingRoom(false)
    setError('')
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-gray-800 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Create Room</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-red-700 bg-red-900/50 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300">
              Room Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              placeholder="e.g., Morning Show Studio"
              required
              maxLength={100}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300">Visibility</label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVisibility(RoomVisibility.PRIVATE)}
                className={`flex flex-col items-center rounded-lg border-2 p-4 transition-all ${
                  visibility === RoomVisibility.PRIVATE
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                }`}
              >
                <svg className="mb-2 h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <span className="text-sm font-medium text-white">Private</span>
                <span className="mt-1 text-xs text-gray-400">Org members only</span>
              </button>
              <button
                type="button"
                onClick={() => setVisibility(RoomVisibility.PUBLIC)}
                className={`flex flex-col items-center rounded-lg border-2 p-4 transition-all ${
                  visibility === RoomVisibility.PUBLIC
                    ? 'border-primary-500 bg-primary-500/10'
                    : 'border-gray-600 bg-gray-700 hover:border-gray-500'
                }`}
              >
                <svg className="mb-2 h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12.75 3.03v.568c0 .334.148.65.405.864l1.068.89c.442.369.535 1.01.216 1.49l-.51.766a2.25 2.25 0 01-1.161.886l-.143.048a1.107 1.107 0 00-.57 1.664c.369.555.169 1.307-.427 1.605L9 13.125l.423 1.059a.956.956 0 01-1.652.928l-.679-.906a1.125 1.125 0 00-1.906.172L4.5 15.75l-.612.153M12.75 3.031a9 9 0 00-8.862 12.872M12.75 3.031a9 9 0 016.69 14.036m0 0l-.177-.529A2.25 2.25 0 0017.128 15H16.5l-.324-.324a1.453 1.453 0 00-2.328.377l-.036.073a1.586 1.586 0 01-.982.816l-.99.282c-.55.157-.894.702-.8 1.267l.073.438c.08.474.49.821.97.821.846 0 1.598.542 1.865 1.345l.215.643m5.276-3.67a9.012 9.012 0 01-5.276 3.67m0 0a9 9 0 01-10.275-4.835M15.75 9c0 .896-.393 1.7-1.016 2.25" />
                </svg>
                <span className="text-sm font-medium text-white">Public</span>
                <span className="mt-1 text-xs text-gray-400">Anyone with link</span>
              </button>
            </div>
          </div>

          {visibility === RoomVisibility.PUBLIC && (
            <div>
              <label htmlFor="accessCode" className="block text-sm font-medium text-gray-300">
                Access Code (optional)
              </label>
              <input
                type="text"
                id="accessCode"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 font-mono text-white placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Leave blank to auto-generate"
                minLength={4}
                maxLength={10}
              />
              <p className="mt-1 text-xs text-gray-500">
                4-10 digit PIN for guests joining via invite link
              </p>
            </div>
          )}

          <div>
            <label htmlFor="maxParticipants" className="block text-sm font-medium text-gray-300">
              Max Participants
            </label>
            <select
              id="maxParticipants"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(Number(e.target.value))}
              className="mt-1 block w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value={2}>2 participants</option>
              <option value={4}>4 participants</option>
              <option value={8}>8 participants</option>
              <option value={12}>12 participants</option>
              <option value={20}>20 participants</option>
              <option value={50}>50 participants</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="waitingRoom"
              checked={waitingRoom}
              onChange={(e) => setWaitingRoom(e.target.checked)}
              className="h-4 w-4 rounded border-gray-600 bg-gray-700 text-primary-500 focus:ring-primary-500"
            />
            <label htmlFor="waitingRoom" className="text-sm text-gray-300">
              Enable waiting room (approve participants before joining)
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="btn btn-secondary flex-1"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary flex-1"
              disabled={loading || !name.trim()}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create Room'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
