import { useState } from 'react'
import { api } from '../../services/api'
import { AudioOutputType, AudioChannel } from '@streamvu/shared'
import type { AudioOutput } from '@streamvu/shared'

interface AddOutputModalProps {
  isOpen: boolean
  roomId: string
  onClose: () => void
  onOutputAdded: (output: AudioOutput) => void
}

export function AddOutputModal({ isOpen, roomId, onClose, onOutputAdded }: AddOutputModalProps) {
  const [name, setName] = useState('')
  const [channel, setChannel] = useState<AudioChannel>(AudioChannel.PROGRAM)

  // Icecast settings
  const [icecastHost, setIcecastHost] = useState('')
  const [icecastPort, setIcecastPort] = useState('8000')
  const [icecastMount, setIcecastMount] = useState('/live')
  const [icecastUsername, setIcecastUsername] = useState('source')
  const [icecastPassword, setIcecastPassword] = useState('')
  const [icecastPublic, setIcecastPublic] = useState(false)
  const [icecastName, setIcecastName] = useState('')
  const [icecastDescription, setIcecastDescription] = useState('')
  const [icecastGenre, setIcecastGenre] = useState('')

  // Encoding settings
  const [codec, setCodec] = useState<'mp3' | 'opus' | 'aac'>('mp3')
  const [bitrate, setBitrate] = useState('128')
  const [sampleRate, setSampleRate] = useState('44100')
  const [channels, setChannels] = useState('2')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const output = await api.audioOutputs.create(roomId, {
        name,
        type: AudioOutputType.ICECAST,
        channel,
        codec,
        bitrate: parseInt(bitrate),
        sampleRate: parseInt(sampleRate),
        channels: parseInt(channels),
        icecastHost,
        icecastPort: parseInt(icecastPort),
        icecastMount,
        icecastUsername,
        icecastPassword,
        icecastPublic,
        icecastName: icecastName || undefined,
        icecastDescription: icecastDescription || undefined,
        icecastGenre: icecastGenre || undefined,
      })

      onOutputAdded(output)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create output')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setName('')
    setIcecastHost('')
    setIcecastPort('8000')
    setIcecastMount('/live')
    setIcecastUsername('source')
    setIcecastPassword('')
    setError('')
    onClose()
  }

  if (!isOpen) return null

  const isValid = name.trim() && icecastHost.trim() && icecastPort && icecastMount.trim() && icecastPassword.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto border border-gray-800 bg-gray-950 shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-gray-800 bg-gray-950 px-4 py-3">
          <h2 className="text-sm font-medium text-white">Add Audio Output</h2>
          <button onClick={handleClose} className="text-gray-600 hover:text-gray-400">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          {/* Name */}
          <div className="mb-3">
            <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Output Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Main Stream"
              className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-gray-600 focus:outline-none"
            />
          </div>

          {/* Source Bus selector */}
          <div className="mb-3">
            <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Source Bus</label>
            <p className="mb-2 text-[10px] text-gray-600">
              Select which mixer bus audio to stream from
            </p>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => setChannel(AudioChannel.PROGRAM)}
                className={`px-2 py-1.5 text-[10px] font-mono transition-colors ${
                  channel === AudioChannel.PROGRAM
                    ? 'bg-gray-700 text-white border border-gray-600'
                    : 'bg-gray-900 text-gray-500 hover:text-white border border-gray-800'
                }`}
              >
                PGM
              </button>
              <button
                type="button"
                onClick={() => setChannel(AudioChannel.TALKBACK)}
                className={`px-2 py-1.5 text-[10px] font-mono transition-colors ${
                  channel === AudioChannel.TALKBACK
                    ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-800'
                    : 'bg-gray-900 text-gray-500 hover:text-white border border-gray-800'
                }`}
              >
                TB
              </button>
              <button
                type="button"
                onClick={() => setChannel(AudioChannel.AUX1)}
                className={`px-2 py-1.5 text-[10px] font-mono transition-colors ${
                  channel === AudioChannel.AUX1
                    ? 'bg-purple-900/50 text-purple-400 border border-purple-800'
                    : 'bg-gray-900 text-gray-500 hover:text-white border border-gray-800'
                }`}
              >
                AUX1
              </button>
              <button
                type="button"
                onClick={() => setChannel(AudioChannel.AUX2)}
                className={`px-2 py-1.5 text-[10px] font-mono transition-colors ${
                  channel === AudioChannel.AUX2
                    ? 'bg-purple-900/50 text-purple-400 border border-purple-800'
                    : 'bg-gray-900 text-gray-500 hover:text-white border border-gray-800'
                }`}
              >
                AUX2
              </button>
              <button
                type="button"
                onClick={() => setChannel(AudioChannel.AUX3)}
                className={`px-2 py-1.5 text-[10px] font-mono transition-colors ${
                  channel === AudioChannel.AUX3
                    ? 'bg-purple-900/50 text-purple-400 border border-purple-800'
                    : 'bg-gray-900 text-gray-500 hover:text-white border border-gray-800'
                }`}
              >
                AUX3
              </button>
              <button
                type="button"
                onClick={() => setChannel(AudioChannel.AUX4)}
                className={`px-2 py-1.5 text-[10px] font-mono transition-colors ${
                  channel === AudioChannel.AUX4
                    ? 'bg-purple-900/50 text-purple-400 border border-purple-800'
                    : 'bg-gray-900 text-gray-500 hover:text-white border border-gray-800'
                }`}
              >
                AUX4
              </button>
            </div>
          </div>

          {/* Icecast Server Settings */}
          <div className="mb-3 border border-gray-800 p-3">
            <h3 className="mb-2 text-[10px] font-mono uppercase tracking-wider text-gray-500">Icecast Server</h3>

            <div className="mb-2 grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="mb-1 block text-[9px] font-mono text-gray-600">HOST</label>
                <input
                  type="text"
                  value={icecastHost}
                  onChange={(e) => setIcecastHost(e.target.value)}
                  placeholder="icecast.example.com"
                  className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:border-gray-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-mono text-gray-600">PORT</label>
                <input
                  type="number"
                  value={icecastPort}
                  onChange={(e) => setIcecastPort(e.target.value)}
                  placeholder="8000"
                  className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:border-gray-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="mb-2">
              <label className="mb-1 block text-[9px] font-mono text-gray-600">MOUNT POINT</label>
              <input
                type="text"
                value={icecastMount}
                onChange={(e) => setIcecastMount(e.target.value)}
                placeholder="/live"
                className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:border-gray-600 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[9px] font-mono text-gray-600">USERNAME</label>
                <input
                  type="text"
                  value={icecastUsername}
                  onChange={(e) => setIcecastUsername(e.target.value)}
                  placeholder="source"
                  className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:border-gray-600 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-mono text-gray-600">PASSWORD</label>
                <input
                  type="password"
                  value={icecastPassword}
                  onChange={(e) => setIcecastPassword(e.target.value)}
                  placeholder="********"
                  className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white placeholder-gray-600 focus:border-gray-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Encoding Settings */}
          <div className="mb-3 border border-gray-800 p-3">
            <h3 className="mb-2 text-[10px] font-mono uppercase tracking-wider text-gray-500">Encoding</h3>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-[9px] font-mono text-gray-600">CODEC</label>
                <select
                  value={codec}
                  onChange={(e) => setCodec(e.target.value as 'mp3' | 'opus' | 'aac')}
                  className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white focus:border-gray-600 focus:outline-none"
                >
                  <option value="mp3">MP3</option>
                  <option value="opus">Opus</option>
                  <option value="aac">AAC</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-mono text-gray-600">BITRATE</label>
                <select
                  value={bitrate}
                  onChange={(e) => setBitrate(e.target.value)}
                  className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white focus:border-gray-600 focus:outline-none"
                >
                  <option value="64">64k</option>
                  <option value="96">96k</option>
                  <option value="128">128k</option>
                  <option value="192">192k</option>
                  <option value="256">256k</option>
                  <option value="320">320k</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-mono text-gray-600">CHANNELS</label>
                <select
                  value={channels}
                  onChange={(e) => setChannels(e.target.value)}
                  className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-xs text-white focus:border-gray-600 focus:outline-none"
                >
                  <option value="1">Mono</option>
                  <option value="2">Stereo</option>
                </select>
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-gray-500 hover:text-gray-300"
            >
              <svg
                className={`h-3 w-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              Advanced Settings
            </button>

            {showAdvanced && (
              <div className="mt-2 space-y-2 border border-gray-800 bg-gray-900/50 p-3">
                <div>
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Stream Name</label>
                  <input
                    type="text"
                    value={icecastName}
                    onChange={(e) => setIcecastName(e.target.value)}
                    placeholder="My Radio Stream"
                    className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Description</label>
                  <input
                    type="text"
                    value={icecastDescription}
                    onChange={(e) => setIcecastDescription(e.target.value)}
                    placeholder="Live broadcast from StreamVU"
                    className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Genre</label>
                  <input
                    type="text"
                    value={icecastGenre}
                    onChange={(e) => setIcecastGenre(e.target.value)}
                    placeholder="Talk Radio"
                    className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Sample Rate</label>
                  <select
                    value={sampleRate}
                    onChange={(e) => setSampleRate(e.target.value)}
                    className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white focus:border-gray-500 focus:outline-none"
                  >
                    <option value="22050">22050 Hz</option>
                    <option value="44100">44100 Hz</option>
                    <option value="48000">48000 Hz</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-400">
                  <input
                    type="checkbox"
                    checked={icecastPublic}
                    onChange={(e) => setIcecastPublic(e.target.checked)}
                    className="border-gray-700 bg-gray-900 text-gray-600"
                  />
                  Public Stream (list in Icecast directory)
                </label>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 border border-red-900 bg-red-950/50 px-3 py-2 text-xs font-mono text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 border border-gray-700 bg-gray-800 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="flex-1 border border-gray-600 bg-gray-700 px-3 py-2 text-xs font-medium text-white hover:bg-gray-600 disabled:opacity-50"
            >
              {submitting ? 'Adding...' : 'Add Output'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
