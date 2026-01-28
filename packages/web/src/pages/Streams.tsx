import { useRef, useState } from 'react'
import { useStreamStore } from '../stores/streamStore'
import type {
  CreateStreamRequest,
  StreamVUConfig,
  StreamWithHealth,
  UpdateStreamRequest,
} from '@streamvu/shared'
import StreamModal from '../components/streams/StreamModal'

// Generate a simple unique ID for local storage
function generateId(): string {
  return `stream_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export default function Streams() {
  const { streams, removeStream, addStream, updateStream, setStreams } = useStreamStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingStream, setEditingStream] = useState<StreamWithHealth | null>(null)
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAddStream = (data: CreateStreamRequest) => {
    const now = new Date().toISOString()
    const newStream: StreamWithHealth = {
      id: generateId(),
      name: data.name,
      url: data.url,
      mountPoint: data.mountPoint ?? null,
      displayOrder: data.displayOrder ?? streams.length,
      isVisible: data.isVisible ?? true,
      createdAt: now,
      updatedAt: now,
      latestHealth: null,
    }
    addStream(newStream)
    setIsModalOpen(false)
  }

  const handleEditStream = (data: UpdateStreamRequest) => {
    if (!editingStream) return
    updateStream(editingStream.id, {
      ...data,
      updatedAt: new Date().toISOString(),
    })
    setEditingStream(null)
  }

  const handleDeleteStream = (streamId: string) => {
    if (!confirm('Are you sure you want to delete this stream?')) return

    setDeleteLoading(streamId)
    removeStream(streamId)
    setDeleteLoading(null)
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const config = JSON.parse(content) as StreamVUConfig

        if (config.version !== 1) {
          setImportError('Unsupported config version')
          return
        }

        if (!Array.isArray(config.streams)) {
          setImportError('Invalid config: streams must be an array')
          return
        }

        for (const stream of config.streams) {
          if (!stream.name || !stream.url) {
            setImportError('Invalid config: each stream must have a name and URL')
            return
          }
        }

        const now = new Date().toISOString()
        const importedStreams = config.streams.map((s) => ({
          id: s.id || generateId(),
          name: s.name,
          url: s.url,
          mountPoint: s.mountPoint ?? null,
          displayOrder: s.displayOrder ?? 0,
          isVisible: s.isVisible ?? true,
          createdAt: now,
          updatedAt: now,
          latestHealth: null,
        }))

        setStreams(importedStreams)

        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } catch {
        setImportError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
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

  // Empty state with import option
  if (streams.length === 0) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">Streams</h1>
          <p className="mt-1 text-gray-400">Manage your monitored Icecast streams</p>
        </div>

        <div className="card p-12 text-center">
          <div className="mx-auto mb-6 h-16 w-16 rounded-full bg-gray-800 p-4">
            <svg
              className="h-full w-full text-gray-500"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
          </div>

          <h2 className="mb-2 text-xl font-semibold text-white">No streams configured</h2>
          <p className="mb-8 text-gray-400">
            Add your first stream manually or import from a configuration file.
          </p>

          {importError && (
            <div className="mx-auto mb-6 max-w-md rounded-lg border border-red-700 bg-red-900/50 p-3 text-sm text-red-300">
              {importError}
            </div>
          )}

          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <button onClick={openAddModal} className="btn btn-primary">
              <svg
                className="-ml-1 mr-2 h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Stream
            </button>

            <span className="text-gray-500">or</span>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImport}
              className="hidden"
              id="config-import-empty"
            />
            <label
              htmlFor="config-import-empty"
              className="btn inline-flex cursor-pointer border border-gray-600 bg-gray-700 text-white hover:bg-gray-600"
            >
              <svg
                className="-ml-1 mr-2 h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                />
              </svg>
              Import Config
            </label>
          </div>

          <p className="mt-8 text-xs text-gray-500">
            Streams are saved automatically to your browser's local storage.
          </p>
        </div>

        <StreamModal
          isOpen={isModalOpen}
          onClose={closeModal}
          onSubmit={handleAddStream}
          stream={null}
        />
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
            {streams.map((stream) => (
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
            ))}
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
