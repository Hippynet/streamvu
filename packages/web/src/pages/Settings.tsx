import { useRef, useState } from 'react'
import { useStreamStore } from '../stores/streamStore'
import type { StreamVUConfig } from '@streamvu/shared'

export default function Settings() {
  const { streams, setStreams } = useStreamStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [importSuccess, setImportSuccess] = useState(false)

  const handleExport = () => {
    const config: StreamVUConfig = {
      version: 1,
      exportedAt: new Date().toISOString(),
      streams: streams.map((s) => ({
        id: s.id,
        name: s.name,
        url: s.url,
        mountPoint: s.mountPoint,
        displayOrder: s.displayOrder,
        isVisible: s.isVisible,
      })),
    }

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `streamvu-config-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setImportError(null)
    setImportSuccess(false)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string
        const config = JSON.parse(content) as StreamVUConfig

        // Validate the config
        if (config.version !== 1) {
          setImportError('Unsupported config version')
          return
        }

        if (!Array.isArray(config.streams)) {
          setImportError('Invalid config: streams must be an array')
          return
        }

        // Validate each stream
        for (const stream of config.streams) {
          if (!stream.name || !stream.url) {
            setImportError('Invalid config: each stream must have a name and URL')
            return
          }
        }

        // Convert to full StreamWithHealth objects
        const now = new Date().toISOString()
        const importedStreams = config.streams.map((s) => ({
          id: s.id || `stream_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
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
        setImportSuccess(true)

        // Reset file input
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      } catch {
        setImportError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  const handleClearAll = () => {
    if (confirm('Are you sure you want to delete all streams? This cannot be undone.')) {
      setStreams([])
    }
  }

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-1 text-gray-400">Export and import your stream configuration</p>
      </div>

      {/* Export/Import Panel */}
      <div className="card space-y-6 p-6">
        <div>
          <h2 className="text-lg font-semibold text-white">Configuration</h2>
          <p className="mt-1 text-sm text-gray-400">
            Export your streams to a JSON file or import from a previously exported configuration.
          </p>
        </div>

        {/* Current Stats */}
        <div className="rounded-lg bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Configured Streams</p>
              <p className="text-2xl font-bold text-white">{streams.length}</p>
            </div>
            <div className="h-12 w-12 rounded-lg bg-primary-500/20 p-3">
              <svg
                className="h-full w-full text-primary-400"
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
          </div>
        </div>

        {/* Export Section */}
        <div className="border-t border-gray-700 pt-6">
          <h3 className="mb-2 font-medium text-white">Export Configuration</h3>
          <p className="mb-4 text-sm text-gray-400">
            Download your current stream configuration as a JSON file.
          </p>
          <button
            onClick={handleExport}
            disabled={streams.length === 0}
            className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-50"
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
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
              />
            </svg>
            Export to JSON
          </button>
        </div>

        {/* Import Section */}
        <div className="border-t border-gray-700 pt-6">
          <h3 className="mb-2 font-medium text-white">Import Configuration</h3>
          <p className="mb-4 text-sm text-gray-400">
            Import streams from a previously exported JSON file. This will replace all current
            streams.
          </p>

          {importError && (
            <div className="mb-4 rounded-lg border border-red-700 bg-red-900/50 p-3 text-sm text-red-300">
              {importError}
            </div>
          )}

          {importSuccess && (
            <div className="mb-4 rounded-lg border border-green-700 bg-green-900/50 p-3 text-sm text-green-300">
              Configuration imported successfully!
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            className="hidden"
            id="config-import"
          />
          <label
            htmlFor="config-import"
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
            Import from JSON
          </label>
        </div>

        {/* Danger Zone */}
        <div className="border-t border-gray-700 pt-6">
          <h3 className="mb-2 font-medium text-red-400">Danger Zone</h3>
          <p className="mb-4 text-sm text-gray-400">
            Clear all streams from local storage. This cannot be undone.
          </p>
          <button
            onClick={handleClearAll}
            disabled={streams.length === 0}
            className="btn border border-red-700 bg-red-900/50 text-red-300 hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear All Streams
          </button>
        </div>
      </div>

      {/* About Section */}
      <div className="card mt-6 p-6">
        <h2 className="mb-4 text-lg font-semibold text-white">About StreamVU</h2>
        <div className="space-y-3 text-sm text-gray-400">
          <p>
            StreamVU is a static stream monitoring dashboard for Icecast and HTTP audio streams.
          </p>
          <p>
            All configuration is stored locally in your browser. No account or server required.
          </p>
          <div className="pt-3">
            <p className="text-xs text-gray-500">StreamVU Static Edition</p>
            <p className="text-xs text-gray-600">Data stored in localStorage</p>
          </div>
        </div>
      </div>
    </div>
  )
}
