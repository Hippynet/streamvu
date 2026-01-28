import { useState, useEffect } from 'react'
import type { CreateStreamRequest, StreamWithHealth } from '@streamvu/shared'
import { ApiError } from '../../services/api'

interface StreamModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateStreamRequest) => Promise<void>
  stream?: StreamWithHealth | null // If provided, we're editing
}

export default function StreamModal({ isOpen, onClose, onSubmit, stream }: StreamModalProps) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [mountPoint, setMountPoint] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isEditing = !!stream

  // Populate form when editing
  useEffect(() => {
    if (stream) {
      setName(stream.name)
      setUrl(stream.url)
      setMountPoint(stream.mountPoint || '')
    } else {
      setName('')
      setUrl('')
      setMountPoint('')
    }
  }, [stream])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await onSubmit({
        name,
        url,
        mountPoint: mountPoint || undefined,
      })
      // Reset form on success (only for add, edit will close)
      if (!isEditing) {
        setName('')
        setUrl('')
        setMountPoint('')
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : `Failed to ${isEditing ? 'update' : 'add'} stream`
      )
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setName('')
    setUrl('')
    setMountPoint('')
    setError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-gray-900/75 transition-opacity" onClick={handleClose} />

        {/* Modal */}
        <div className="relative transform overflow-hidden rounded-lg border border-gray-700 bg-gray-800 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg">
          <form onSubmit={handleSubmit}>
            <div className="px-6 py-5">
              <h3 className="mb-4 text-lg font-semibold text-white">
                {isEditing ? 'Edit Stream' : 'Add Stream'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="stream-name" className="label">
                    Stream Name
                  </label>
                  <input
                    id="stream-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="input"
                    placeholder="Main Studio"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="stream-url" className="label">
                    Stream URL
                  </label>
                  <input
                    id="stream-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="input"
                    placeholder="https://stream.example.com:8000/main"
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    The full URL to your Icecast stream including port and mount point
                  </p>
                </div>

                <div>
                  <label htmlFor="stream-mount" className="label">
                    Mount Point (optional)
                  </label>
                  <input
                    id="stream-mount"
                    type="text"
                    value={mountPoint}
                    onChange={(e) => setMountPoint(e.target.value)}
                    className="input"
                    placeholder="/main"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Optional display label for the mount point
                  </p>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-700 bg-red-900/50 p-3 text-sm text-red-300">
                    {error}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 bg-gray-900/50 px-6 py-4">
              <button
                type="button"
                onClick={handleClose}
                className="btn btn-secondary"
                disabled={loading}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading
                  ? isEditing
                    ? 'Saving...'
                    : 'Adding...'
                  : isEditing
                    ? 'Save Changes'
                    : 'Add Stream'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
