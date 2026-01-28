/**
 * WHIP Stream Manager Component
 *
 * Interface for creating and managing WHIP ingest endpoints.
 * Allows OBS 30+, vMix, and other WHIP-compatible clients to send
 * WebRTC streams to the call room.
 */

import { useState, useEffect, useCallback } from 'react'
import type { Socket } from 'socket.io-client'

interface WHIPStream {
  id: string
  roomId: string
  name: string
  token: string
  state: 'PENDING' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  clientIp: string | null
  clientUserAgent: string | null
  createdAt: string
  connectedAt: string | null
  disconnectedAt: string | null
  errorMessage: string | null
}

interface WHIPStreamManagerProps {
  roomId: string
  socket: Socket | null
  isProducer?: boolean
}

const STATE_STYLES = {
  CONNECTED: { border: 'border-green-500', text: 'text-green-400', dot: 'bg-green-500' },
  CONNECTING: { border: 'border-yellow-500', text: 'text-yellow-400', dot: 'bg-yellow-500 animate-pulse' },
  PENDING: { border: 'border-gray-600', text: 'text-gray-400', dot: 'bg-gray-500' },
  DISCONNECTED: { border: 'border-gray-700', text: 'text-gray-500', dot: 'bg-gray-600' },
  ERROR: { border: 'border-red-500', text: 'text-red-400', dot: 'bg-red-500' },
}

export function WHIPStreamManager({ roomId, socket, isProducer = false }: WHIPStreamManagerProps) {
  const [streams, setStreams] = useState<WHIPStream[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [newStreamName, setNewStreamName] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch existing streams
  const fetchStreams = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/whip/${roomId}/streams`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch WHIP streams')
      }

      const data = await response.json()
      setStreams(data.streams || [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load streams')
    } finally {
      setIsLoading(false)
    }
  }, [roomId])

  useEffect(() => {
    fetchStreams()

    // Poll for updates every 5 seconds
    const interval = setInterval(fetchStreams, 5000)
    return () => clearInterval(interval)
  }, [fetchStreams])

  // Listen for stream state changes via socket
  useEffect(() => {
    if (!socket) return

    const handleStreamUpdate = (data: { stream: WHIPStream }) => {
      setStreams(prev => {
        const idx = prev.findIndex(s => s.id === data.stream.id)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = data.stream
          return updated
        }
        return [...prev, data.stream]
      })
    }

    const handleStreamDeleted = (data: { streamId: string }) => {
      setStreams(prev => prev.filter(s => s.id !== data.streamId))
    }

    socket.on('whip:stream-updated', handleStreamUpdate)
    socket.on('whip:stream-deleted', handleStreamDeleted)

    return () => {
      socket.off('whip:stream-updated', handleStreamUpdate)
      socket.off('whip:stream-deleted', handleStreamDeleted)
    }
  }, [socket])

  // Create a new WHIP endpoint
  const createEndpoint = async () => {
    if (!newStreamName.trim()) {
      setError('Please enter a stream name')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`/whip/${roomId}/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newStreamName.trim() }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to create WHIP endpoint')
      }

      const data = await response.json()
      setStreams(prev => [...prev, data.stream])
      setNewStreamName('')
      setShowCreateForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create endpoint')
    } finally {
      setIsCreating(false)
    }
  }

  // Delete a WHIP stream
  const deleteStream = async (streamId: string, token: string) => {
    try {
      const response = await fetch(`/whip/${roomId}/resource/${streamId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok && response.status !== 204) {
        throw new Error('Failed to delete stream')
      }

      setStreams(prev => prev.filter(s => s.id !== streamId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete stream')
    }
  }

  // Copy to clipboard
  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch {
      // Fallback for browsers without clipboard API
      const textArea = document.createElement('textarea')
      textArea.value = text
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    }
  }

  const connectedCount = streams.filter(s => s.state === 'CONNECTED').length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="h-4 w-4 animate-spin border-2 border-gray-600 border-t-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[10px] font-mono uppercase tracking-wider text-gray-500">WHIP Ingest</h3>
          {connectedCount > 0 && (
            <span className="bg-green-600 px-1 py-0.5 text-[8px] font-mono font-bold text-white">
              {connectedCount} LIVE
            </span>
          )}
        </div>
        <span className="text-[9px] font-mono text-gray-600">{streams.length}</span>
      </div>

      {/* Error */}
      {error && (
        <div className="border-b border-red-900 bg-red-950/30 px-2 py-1">
          <span className="text-[9px] font-mono text-red-400">{error}</span>
        </div>
      )}

      {/* Content */}
      <div className="max-h-72 space-y-1 overflow-y-auto p-1.5">
        {/* Create Form */}
        {showCreateForm && (
          <div className="space-y-1 bg-gray-900 p-2">
            <input
              type="text"
              value={newStreamName}
              onChange={e => setNewStreamName(e.target.value)}
              placeholder="Stream name (e.g., OBS Studio)"
              className="w-full bg-gray-800 px-2 py-1 text-[10px] text-white placeholder:text-gray-600 focus:outline-none"
              onKeyDown={e => e.key === 'Enter' && createEndpoint()}
              autoFocus
            />
            <div className="flex gap-1">
              <button
                onClick={() => { setShowCreateForm(false); setNewStreamName('') }}
                className="flex-1 py-1 text-[9px] font-mono text-gray-500 hover:text-gray-400"
              >
                CANCEL
              </button>
              <button
                onClick={createEndpoint}
                disabled={isCreating}
                className="flex-1 bg-primary-900/50 py-1 text-[9px] font-mono text-primary-400 hover:bg-primary-900/70 disabled:opacity-50"
              >
                {isCreating ? '...' : 'CREATE'}
              </button>
            </div>
          </div>
        )}

        {/* Streams */}
        {streams.map(stream => {
          const styles = STATE_STYLES[stream.state]
          return (
            <div key={stream.id} className={`border-l-2 ${styles.border} bg-gray-900/50 p-2`}>
              {/* Header */}
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                  <span className="text-[10px] font-mono text-white">{stream.name}</span>
                </div>
                <span className={`text-[8px] font-mono uppercase ${styles.text}`}>{stream.state}</span>
              </div>

              {/* Client Info */}
              {stream.clientUserAgent && (
                <p className="text-[9px] font-mono text-gray-500 truncate">{stream.clientUserAgent}</p>
              )}

              {/* Error */}
              {stream.errorMessage && (
                <p className="text-[9px] font-mono text-red-400">{stream.errorMessage}</p>
              )}

              {/* WHIP URL for pending streams */}
              {stream.state === 'PENDING' && (
                <div className="mt-1.5 space-y-1 bg-gray-950 p-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-mono uppercase text-gray-600">URL</span>
                    <button
                      onClick={() => copyToClipboard(
                        `${window.location.origin}/whip/${roomId}/ingest/${stream.id}`,
                        `url-${stream.id}`
                      )}
                      className="text-[8px] font-mono text-primary-400 hover:text-primary-300"
                    >
                      {copiedId === `url-${stream.id}` ? 'COPIED' : 'COPY'}
                    </button>
                  </div>
                  <code className="block text-[9px] font-mono text-green-400 break-all">
                    {window.location.origin}/whip/{roomId}/ingest/{stream.id}
                  </code>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[8px] font-mono uppercase text-gray-600">Token</span>
                    <button
                      onClick={() => copyToClipboard(stream.token, `token-${stream.id}`)}
                      className="text-[8px] font-mono text-primary-400 hover:text-primary-300"
                    >
                      {copiedId === `token-${stream.id}` ? 'COPIED' : 'COPY'}
                    </button>
                  </div>
                  <code className="block text-[9px] font-mono text-yellow-400 break-all">
                    {stream.token}
                  </code>
                </div>
              )}

              {/* Actions */}
              {isProducer && (
                <div className="mt-1.5">
                  <button
                    onClick={() => deleteStream(stream.id, stream.token)}
                    className="bg-gray-800 px-2 py-1 text-[9px] font-mono text-gray-500 hover:bg-gray-700"
                  >
                    DELETE
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {streams.length === 0 && !showCreateForm && (
          <p className="py-6 text-center text-[10px] font-mono text-gray-600">NO WHIP STREAMS</p>
        )}
      </div>

      {/* Add Button */}
      {isProducer && !showCreateForm && (
        <div className="border-t border-gray-800 p-1.5">
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex w-full items-center justify-center gap-1.5 bg-gray-900 py-1.5 text-[10px] font-mono text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            + ADD WHIP SOURCE
          </button>
        </div>
      )}

      {/* Help Text */}
      <div className="border-t border-gray-800 px-2 py-1.5">
        <p className="text-[8px] font-mono text-gray-600">
          <span className="text-gray-500">OBS 30+:</span> Settings → Stream → WHIP
        </p>
        <p className="text-[8px] font-mono text-gray-600">
          <span className="text-gray-500">vMix:</span> Add Input → Stream/SRT → WHIP
        </p>
      </div>
    </div>
  )
}

export default WHIPStreamManager
