import { useState, useCallback, useEffect, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '../../stores/authStore'
import { getWsUrl, getApiUrl } from '../../config'
import { AudioOutputType, AudioChannel, SRTMode } from '@streamvu/shared'
import type { AudioOutput } from '@streamvu/shared'

interface SRTOutputPanelProps {
  roomId: string
  isHost: boolean
}

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  connected: { bg: 'bg-green-900/50', text: 'text-green-400', dot: 'bg-green-500' },
  connecting: { bg: 'bg-yellow-900/50', text: 'text-yellow-400', dot: 'bg-yellow-500 animate-pulse' },
  disconnected: { bg: 'bg-gray-800', text: 'text-gray-400', dot: 'bg-gray-500' },
  error: { bg: 'bg-red-900/50', text: 'text-red-400', dot: 'bg-red-500' },
}

function formatBytes(bytes: string | number): string {
  const size = typeof bytes === 'string' ? parseInt(bytes) : bytes
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function SRTOutputCard({
  output,
  isHost,
  onToggle,
  onDelete,
  onEdit,
}: {
  output: AudioOutput
  isHost: boolean
  onToggle: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const getStatus = () => {
    if (output.errorMessage) return 'error'
    if (output.isConnected) return 'connected'
    if (output.isActive) return 'connecting'
    return 'disconnected'
  }

  const status = getStatus()
  const statusColors = STATUS_COLORS[status]

  // Generate SRT URL for display
  const srtUrl = output.srtHost && output.srtPort
    ? `srt://${output.srtHost}:${output.srtPort}${output.srtStreamId ? `?streamid=${output.srtStreamId}` : ''}`
    : 'Not configured'

  return (
    <div className={`rounded-lg border border-gray-700 ${statusColors.bg} p-3`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColors.dot}`} />
          <span className={`text-sm font-medium ${statusColors.text}`}>
            {output.name}
          </span>
          <span className="px-1.5 py-0.5 text-[10px] bg-primary-600 text-white rounded uppercase">
            SRT
          </span>
        </div>
        <span className="text-xs text-gray-500 uppercase">
          {output.srtMode?.toLowerCase() || 'caller'}
        </span>
      </div>

      {/* SRT URL */}
      <div className="mb-2 text-xs text-gray-400 font-mono truncate" title={srtUrl}>
        {srtUrl}
      </div>

      {/* Details */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mb-3">
        <span>{output.codec.toUpperCase()}</span>
        <span>{output.bitrate}kbps</span>
        <span>{output.sampleRate / 1000}kHz</span>
        <span>{output.channels === 1 ? 'Mono' : 'Stereo'}</span>
        {output.srtLatency && <span>{output.srtLatency}ms latency</span>}
        {output.isConnected && (
          <span className="text-green-400">{formatBytes(output.bytesStreamed)} sent</span>
        )}
      </div>

      {/* Error message */}
      {output.errorMessage && (
        <div className="mb-3 text-xs text-red-400 bg-red-900/30 rounded px-2 py-1">
          {output.errorMessage}
        </div>
      )}

      {/* Actions */}
      {isHost && (
        <div className="flex gap-2">
          <button
            onClick={onToggle}
            className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${
              output.isActive
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-green-600 text-white hover:bg-green-500'
            }`}
          >
            {output.isActive ? 'Stop' : 'Start'}
          </button>
          <button
            onClick={onEdit}
            className="px-3 py-1.5 bg-gray-600 text-white rounded text-sm hover:bg-gray-500"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-3 py-1.5 bg-gray-700 text-gray-400 rounded text-sm hover:bg-gray-600 hover:text-white"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

function CreateSRTOutputForm({
  onSubmit,
  onCancel,
  initialValues,
}: {
  onSubmit: (data: {
    name: string
    srtHost: string
    srtPort: number
    srtMode: SRTMode
    srtStreamId?: string
    srtPassphrase?: string
    srtLatency?: number
    codec: string
    bitrate: number
    sampleRate: number
    channels: number
    channel: AudioChannel
  }) => void
  onCancel: () => void
  initialValues?: AudioOutput
}) {
  const [name, setName] = useState(initialValues?.name || '')
  const [srtHost, setSrtHost] = useState(initialValues?.srtHost || '')
  const [srtPort, setSrtPort] = useState(initialValues?.srtPort?.toString() || '9000')
  const [srtMode, setSrtMode] = useState<SRTMode>(initialValues?.srtMode || SRTMode.CALLER)
  const [srtStreamId, setSrtStreamId] = useState(initialValues?.srtStreamId || '')
  const [srtPassphrase, setSrtPassphrase] = useState('')
  const [srtLatency, setSrtLatency] = useState(initialValues?.srtLatency?.toString() || '120')
  const [codec, setCodec] = useState(initialValues?.codec || 'opus')
  const [bitrate, setBitrate] = useState(initialValues?.bitrate?.toString() || '128')
  const [sampleRate, setSampleRate] = useState(initialValues?.sampleRate?.toString() || '48000')
  const [channels, setChannels] = useState(initialValues?.channels?.toString() || '2')
  const [channel, setChannel] = useState<AudioChannel>(initialValues?.channel || AudioChannel.PROGRAM)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      name: name.trim() || 'SRT Output',
      srtHost: srtHost.trim(),
      srtPort: parseInt(srtPort) || 9000,
      srtMode,
      srtStreamId: srtStreamId.trim() || undefined,
      srtPassphrase: srtPassphrase.trim() || undefined,
      srtLatency: parseInt(srtLatency) || 120,
      codec,
      bitrate: parseInt(bitrate) || 128,
      sampleRate: parseInt(sampleRate) || 48000,
      channels: parseInt(channels) || 2,
      channel,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="p-3 bg-gray-700 rounded-lg space-y-3">
      <div>
        <label className="block text-xs text-gray-400 mb-1">Output Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Main SRT Output"
          className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Host / IP</label>
          <input
            type="text"
            value={srtHost}
            onChange={(e) => setSrtHost(e.target.value)}
            placeholder="192.168.1.100"
            className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Port</label>
          <input
            type="number"
            value={srtPort}
            onChange={(e) => setSrtPort(e.target.value)}
            placeholder="9000"
            className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Mode</label>
          <select
            value={srtMode}
            onChange={(e) => setSrtMode(e.target.value as SRTMode)}
            className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white focus:outline-none"
          >
            <option value={SRTMode.CALLER}>Caller (Connect to)</option>
            <option value={SRTMode.LISTENER}>Listener (Wait for)</option>
            <option value={SRTMode.RENDEZVOUS}>Rendezvous</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Latency (ms)</label>
          <input
            type="number"
            value={srtLatency}
            onChange={(e) => setSrtLatency(e.target.value)}
            placeholder="120"
            className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Stream ID (optional)</label>
        <input
          type="text"
          value={srtStreamId}
          onChange={(e) => setSrtStreamId(e.target.value)}
          placeholder="#!::r=studio1,m=publish"
          className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Encryption Passphrase (optional)</label>
        <input
          type="password"
          value={srtPassphrase}
          onChange={(e) => setSrtPassphrase(e.target.value)}
          placeholder="Leave empty for no encryption"
          className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none"
        />
      </div>

      <div className="border-t border-gray-600 pt-3">
        <label className="block text-xs text-gray-500 uppercase mb-2">Encoding</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Codec</label>
            <select
              value={codec}
              onChange={(e) => setCodec(e.target.value)}
              className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="opus">Opus</option>
              <option value="aac">AAC</option>
              <option value="mp3">MP3</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Bitrate (kbps)</label>
            <select
              value={bitrate}
              onChange={(e) => setBitrate(e.target.value)}
              className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="64">64</option>
              <option value="96">96</option>
              <option value="128">128</option>
              <option value="192">192</option>
              <option value="256">256</option>
              <option value="320">320</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Sample Rate</label>
            <select
              value={sampleRate}
              onChange={(e) => setSampleRate(e.target.value)}
              className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="44100">44.1 kHz</option>
              <option value="48000">48 kHz</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Channels</label>
            <select
              value={channels}
              onChange={(e) => setChannels(e.target.value)}
              className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white focus:outline-none"
            >
              <option value="1">Mono</option>
              <option value="2">Stereo</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs text-gray-400 mb-1">Audio Channel</label>
        <select
          value={channel}
          onChange={(e) => setChannel(e.target.value as AudioChannel)}
          className="w-full rounded bg-gray-600 px-3 py-2 text-sm text-white focus:outline-none"
        >
          <option value={AudioChannel.PROGRAM}>Program (Main Mix)</option>
          <option value={AudioChannel.TALKBACK}>Talkback</option>
          <option value={AudioChannel.BOTH}>Both</option>
        </select>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2 text-sm text-gray-400 hover:text-white"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!srtHost.trim()}
          className="flex-1 py-2 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {initialValues ? 'Update Output' : 'Create Output'}
        </button>
      </div>
    </form>
  )
}

export function SRTOutputPanel({ roomId, isHost }: SRTOutputPanelProps) {
  const tokens = useAuthStore((state) => state.tokens)
  const [outputs, setOutputs] = useState<AudioOutput[]>([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingOutput, setEditingOutput] = useState<AudioOutput | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const socketRef = useRef<Socket | null>(null)

  // Fetch outputs via REST API
  const fetchOutputs = useCallback(async () => {
    if (!tokens?.accessToken) return

    try {
      const response = await fetch(`${getApiUrl()}/api/rooms/${roomId}/outputs`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      if (response.ok) {
        const data = await response.json()
        // Filter to only SRT outputs
        setOutputs(data.outputs.filter((o: AudioOutput) => o.type === AudioOutputType.SRT))
      }
    } catch (error) {
      console.error('Failed to fetch outputs:', error)
    } finally {
      setIsLoading(false)
    }
  }, [roomId, tokens?.accessToken])

  useEffect(() => {
    fetchOutputs()
  }, [fetchOutputs])

  // Socket connection for real-time updates
  useEffect(() => {
    if (!tokens?.accessToken || !roomId) return

    const socket = io(`${getWsUrl()}/call-center`, {
      auth: { token: tokens.accessToken },
      transports: ['websocket'],
    })

    socketRef.current = socket

    socket.on('output:created', (data: { output: AudioOutput }) => {
      if (data.output.type === AudioOutputType.SRT) {
        setOutputs((prev) => [...prev, data.output])
      }
    })

    socket.on('output:updated', (data: { output: AudioOutput }) => {
      if (data.output.type === AudioOutputType.SRT) {
        setOutputs((prev) =>
          prev.map((o) => (o.id === data.output.id ? data.output : o))
        )
      }
    })

    socket.on('output:deleted', (data: { outputId: string }) => {
      setOutputs((prev) => prev.filter((o) => o.id !== data.outputId))
    })

    socket.on('output:status', (data: { outputId: string; isConnected: boolean; error?: string }) => {
      setOutputs((prev) =>
        prev.map((o) =>
          o.id === data.outputId
            ? { ...o, isConnected: data.isConnected, errorMessage: data.error || null }
            : o
        )
      )
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [tokens?.accessToken, roomId])

  // Create output
  const handleCreateOutput = useCallback(
    async (data: {
      name: string
      srtHost: string
      srtPort: number
      srtMode: SRTMode
      srtStreamId?: string
      srtPassphrase?: string
      srtLatency?: number
      codec: string
      bitrate: number
      sampleRate: number
      channels: number
      channel: AudioChannel
    }) => {
      if (!tokens?.accessToken) return

      try {
        const response = await fetch(`${getApiUrl()}/api/rooms/${roomId}/outputs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens.accessToken}`,
          },
          body: JSON.stringify({
            ...data,
            type: AudioOutputType.SRT,
          }),
        })

        if (response.ok) {
          setShowCreateForm(false)
          await fetchOutputs()
        }
      } catch (error) {
        console.error('Failed to create output:', error)
      }
    },
    [roomId, tokens?.accessToken, fetchOutputs]
  )

  // Update output
  const handleUpdateOutput = useCallback(
    async (
      outputId: string,
      data: {
        name: string
        srtHost: string
        srtPort: number
        srtMode: SRTMode
        srtStreamId?: string
        srtPassphrase?: string
        srtLatency?: number
        codec: string
        bitrate: number
        sampleRate: number
        channels: number
        channel: AudioChannel
      }
    ) => {
      if (!tokens?.accessToken) return

      try {
        const response = await fetch(`${getApiUrl()}/api/rooms/${roomId}/outputs/${outputId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokens.accessToken}`,
          },
          body: JSON.stringify(data),
        })

        if (response.ok) {
          setEditingOutput(null)
          await fetchOutputs()
        }
      } catch (error) {
        console.error('Failed to update output:', error)
      }
    },
    [roomId, tokens?.accessToken, fetchOutputs]
  )

  // Toggle output
  const handleToggleOutput = useCallback(
    async (output: AudioOutput) => {
      if (!tokens?.accessToken) return

      const action = output.isActive ? 'stop' : 'start'
      try {
        await fetch(`${getApiUrl()}/api/rooms/${roomId}/outputs/${output.id}/${action}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        })
        await fetchOutputs()
      } catch (error) {
        console.error(`Failed to ${action} output:`, error)
      }
    },
    [roomId, tokens?.accessToken, fetchOutputs]
  )

  // Delete output
  const handleDeleteOutput = useCallback(
    async (outputId: string) => {
      if (!tokens?.accessToken) return

      try {
        await fetch(`${getApiUrl()}/api/rooms/${roomId}/outputs/${outputId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${tokens.accessToken}` },
        })
        setOutputs((prev) => prev.filter((o) => o.id !== outputId))
      } catch (error) {
        console.error('Failed to delete output:', error)
      }
    },
    [roomId, tokens?.accessToken]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex flex-col rounded-lg border border-gray-700 bg-gray-800">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            SRT Output
          </h3>
          {outputs.filter((o) => o.isConnected).length > 0 && (
            <span className="px-1.5 py-0.5 text-xs font-bold bg-green-500 text-white rounded">
              {outputs.filter((o) => o.isConnected).length} LIVE
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500">{outputs.length} outputs</span>
      </div>

      {/* Content */}
      <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
        {/* Existing Outputs */}
        {outputs.map((output) =>
          editingOutput?.id === output.id ? (
            <CreateSRTOutputForm
              key={output.id}
              initialValues={output}
              onSubmit={(data) => handleUpdateOutput(output.id, data)}
              onCancel={() => setEditingOutput(null)}
            />
          ) : (
            <SRTOutputCard
              key={output.id}
              output={output}
              isHost={isHost}
              onToggle={() => handleToggleOutput(output)}
              onDelete={() => handleDeleteOutput(output.id)}
              onEdit={() => setEditingOutput(output)}
            />
          )
        )}

        {/* Create Form */}
        {showCreateForm && (
          <CreateSRTOutputForm
            onSubmit={handleCreateOutput}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {outputs.length === 0 && !showCreateForm && (
          <p className="text-center text-gray-500 text-sm py-4">
            No SRT outputs configured
          </p>
        )}
      </div>

      {/* Add Button (Host Only) */}
      {isHost && !showCreateForm && !editingOutput && (
        <div className="p-2 border-t border-gray-700">
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full py-2 bg-primary-600 text-white rounded text-sm font-medium hover:bg-primary-500"
          >
            + Add SRT Output
          </button>
        </div>
      )}
    </div>
  )
}
