import { useEffect, useState } from 'react'
import { useStreamStore } from '../stores/streamStore'
import { api, ApiError } from '../services/api'
import type { CreateStreamRequest, StreamWithHealth, UpdateStreamRequest } from '@streamvu/shared'
import StreamModal from '../components/streams/StreamModal'

export default function Streams() {
  const {
    streams,
    loading,
    setStreams,
    setLoading,
    setError,
    removeStream,
    addStream,
    updateStream,
  } = useStreamStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStream, setEditingStream] = useState<StreamWithHealth | null>(null)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)

  useEffect(() => {
    const fetchStreams = async () => {
      setLoading(true)
      try {
        const data = await api.streams.list()
        setStreams(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load streams')
      }
    }

    fetchStreams()
  }, [setStreams, setLoading, setError])

  const handleAddStream = async (data: CreateStreamRequest) => {
    const newStream = await api.streams.create(data)
    addStream({ ...newStream, latestHealth: null })
    setIsModalOpen(false)
  }

  const handleEditStream = async (data: UpdateStreamRequest) => {
    if (!editingStream) return
    const updated = await api.streams.update(editingStream.id, data)
    updateStream(editingStream.id, { ...updated, latestHealth: editingStream.latestHealth })
    setEditingStream(null)
  }

  const handleDeleteStream = async (streamId: string) => {
    if (!confirm('Are you sure you want to delete this stream?')) return

    setDeleteLoading(streamId)
    try {
      await api.streams.delete(streamId)
      removeStream(streamId)
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Failed to delete stream')
    } finally {
      setDeleteLoading(null)
    }
  }

  const openAddModal = () => {
    setEditingStream(null)
    setIsModalOpen(true)
  }

  const openEditModal = (stream: StreamWithHealth) => {
    setEditingStream(stream)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingStream(null)
  }

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
          <h1 className="text-2xl font-bold text-white">Streams</h1>
          <p className="mt-1 text-gray-400">Manage your monitored Icecast streams</p>
        </div>
        <button onClick={openAddModal} className="btn btn-primary">
          Add Stream
        </button>
      </div>

      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                URL
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-400">
                Bitrate
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-400">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {streams.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-400">
                  No streams configured. Add your first stream to get started.
                </td>
              </tr>
            ) : (
              streams.map((stream) => (
                <tr key={stream.id} className="hover:bg-gray-800/50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div className="text-sm font-medium text-white">{stream.name}</div>
                    {stream.mountPoint && (
                      <div className="text-xs text-gray-500">{stream.mountPoint}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="max-w-xs truncate text-sm text-gray-300" title={stream.url}>
                      {stream.url}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        stream.latestHealth?.isOnline
                          ? 'bg-green-900/50 text-green-400'
                          : 'bg-red-900/50 text-red-400'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          stream.latestHealth?.isOnline ? 'bg-green-400' : 'bg-red-400'
                        }`}
                      ></span>
                      {stream.latestHealth?.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-300">
                    {stream.latestHealth?.bitrate ? `${stream.latestHealth.bitrate} kbps` : '-'}
                  </td>
                  <td className="space-x-3 whitespace-nowrap px-6 py-4 text-right text-sm">
                    <button
                      onClick={() => openEditModal(stream)}
                      className="text-primary-400 transition-colors hover:text-primary-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteStream(stream.id)}
                      disabled={deleteLoading === stream.id}
                      className="text-red-400 transition-colors hover:text-red-300 disabled:opacity-50"
                    >
                      {deleteLoading === stream.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <StreamModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onSubmit={editingStream ? handleEditStream : handleAddStream}
        stream={editingStream}
      />
    </div>
  )
}
