import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { AudioSourceType, AudioChannel, SRTMode, RISTMode, RISTProfile } from '@streamvu/shared'
import type { AudioSource, UploadedFile } from '@streamvu/shared'
import type { TestSignalType } from './TestSignalGenerator'

interface AddSourceModalProps {
  isOpen: boolean
  roomId: string
  onClose: () => void
  onSourceAdded: (source: AudioSource) => void
}

type SourceTypeOption = 'HTTP_STREAM' | 'FILE' | 'TEST_SIGNAL' | 'SRT_STREAM' | 'RIST_STREAM'

export function AddSourceModal({ isOpen, roomId, onClose, onSourceAdded }: AddSourceModalProps) {
  const [sourceType, setSourceType] = useState<SourceTypeOption>('HTTP_STREAM')
  const [name, setName] = useState('')
  const [streamUrl, setStreamUrl] = useState('')
  const [streamFormat, setStreamFormat] = useState('mp3')
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [selectedTestSignal, setSelectedTestSignal] = useState<TestSignalType | null>(null)
  const [channel, setChannel] = useState<AudioChannel>(AudioChannel.PROGRAM)
  // SRT fields
  const [srtMode, setSrtMode] = useState<SRTMode>(SRTMode.LISTENER)
  const [srtHost, setSrtHost] = useState('')
  const [srtPort, setSrtPort] = useState('')
  const [srtStreamId, setSrtStreamId] = useState('')
  const [srtPassphrase, setSrtPassphrase] = useState('')
  const [srtLatency, setSrtLatency] = useState(120)
  // RIST fields
  const [ristMode, setRistMode] = useState<RISTMode>(RISTMode.LISTENER)
  const [ristUrl, setRistUrl] = useState('')
  const [ristProfile, setRistProfile] = useState<RISTProfile>(RISTProfile.SIMPLE)
  const [ristBuffer, setRistBuffer] = useState(1000)
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadFiles()
    }
  }, [isOpen])

  const loadFiles = async () => {
    try {
      const data = await api.files.list()
      setFiles(data)
    } catch (err) {
      console.error('Failed to load files:', err)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')

    try {
      const uploaded = await api.files.upload(file)
      setFiles(prev => [uploaded, ...prev])
      setSelectedFileId(uploaded.id)
      if (!name) {
        setName(uploaded.filename.replace(/\.[^.]+$/, ''))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const source = await api.audioSources.create(roomId, {
        type: sourceType as AudioSourceType,
        name,
        streamUrl: sourceType === 'HTTP_STREAM' ? streamUrl : undefined,
        streamFormat: sourceType === 'HTTP_STREAM' ? streamFormat : undefined,
        fileId: sourceType === 'FILE' ? selectedFileId || undefined : undefined,
        channel,
        // SRT fields
        srtMode: sourceType === 'SRT_STREAM' ? srtMode : undefined,
        srtHost: sourceType === 'SRT_STREAM' && srtMode === SRTMode.CALLER ? srtHost : undefined,
        srtPort: sourceType === 'SRT_STREAM' && srtMode === SRTMode.CALLER ? parseInt(srtPort) : undefined,
        srtStreamId: sourceType === 'SRT_STREAM' && srtStreamId ? srtStreamId : undefined,
        srtPassphrase: sourceType === 'SRT_STREAM' && srtPassphrase ? srtPassphrase : undefined,
        srtLatency: sourceType === 'SRT_STREAM' ? srtLatency : undefined,
        // RIST fields
        ristMode: sourceType === 'RIST_STREAM' ? ristMode : undefined,
        ristUrl: sourceType === 'RIST_STREAM' && ristMode === RISTMode.CALLER ? ristUrl : undefined,
        ristProfile: sourceType === 'RIST_STREAM' ? ristProfile : undefined,
        ristBuffer: sourceType === 'RIST_STREAM' ? ristBuffer : undefined,
      })

      onSourceAdded(source)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create source')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    setName('')
    setStreamUrl('')
    setSelectedFileId(null)
    setSelectedTestSignal(null)
    // Reset SRT fields
    setSrtMode(SRTMode.LISTENER)
    setSrtHost('')
    setSrtPort('')
    setSrtStreamId('')
    setSrtPassphrase('')
    setSrtLatency(120)
    // Reset RIST fields
    setRistMode(RISTMode.LISTENER)
    setRistUrl('')
    setRistProfile(RISTProfile.SIMPLE)
    setRistBuffer(1000)
    setError('')
    onClose()
  }

  if (!isOpen) return null

  const isValid = name.trim() && (
    (sourceType === 'HTTP_STREAM' && streamUrl.trim()) ||
    (sourceType === 'FILE' && selectedFileId) ||
    (sourceType === 'TEST_SIGNAL' && selectedTestSignal) ||
    (sourceType === 'SRT_STREAM' && (
      srtMode === SRTMode.LISTENER ||
      (srtMode === SRTMode.CALLER && srtHost.trim() && srtPort.trim())
    )) ||
    (sourceType === 'RIST_STREAM' && (
      ristMode === RISTMode.LISTENER ||
      (ristMode === RISTMode.CALLER && ristUrl.trim())
    ))
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="w-full max-w-lg border border-gray-800 bg-gray-950 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
          <h2 className="text-sm font-medium text-white">Add Audio Source</h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-white">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4">
          {/* Source Type Tabs */}
          <div className="mb-4 flex border border-gray-800 bg-gray-900">
            <button
              type="button"
              onClick={() => setSourceType('HTTP_STREAM')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                sourceType === 'HTTP_STREAM'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                </svg>
                <span className="hidden sm:inline">HTTP</span> Stream
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSourceType('FILE')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                sourceType === 'FILE'
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                </svg>
                <span className="hidden sm:inline">Audio</span> File
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSourceType('TEST_SIGNAL')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                sourceType === 'TEST_SIGNAL'
                  ? 'bg-yellow-900/50 text-yellow-400 border-y border-yellow-800'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.789m13.788 0c3.808 3.808 3.808 9.981 0 13.79M12 12h.008v.007H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                </svg>
                Test Tone
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSourceType('SRT_STREAM')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                sourceType === 'SRT_STREAM'
                  ? 'bg-purple-900/50 text-purple-400 border-y border-purple-800'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
                </svg>
                SRT
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSourceType('RIST_STREAM')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                sourceType === 'RIST_STREAM'
                  ? 'bg-cyan-900/50 text-cyan-400 border-y border-cyan-800'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
                RIST
              </div>
            </button>
          </div>

          {/* Name */}
          <div className="mb-4">
            <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Remote Feed 1"
              className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none"
            />
          </div>

          {/* HTTP Stream options */}
          {sourceType === 'HTTP_STREAM' && (
            <>
              <div className="mb-4">
                <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Stream URL</label>
                <input
                  type="url"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://stream.example.com/live"
                  className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-gray-500 focus:outline-none"
                />
                <p className="mt-1 text-[10px] font-mono text-gray-600">
                  Supports Icecast, Shoutcast, and direct HTTP audio streams
                </p>
              </div>

              <div className="mb-4">
                <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Format</label>
                <select
                  value={streamFormat}
                  onChange={(e) => setStreamFormat(e.target.value)}
                  className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white focus:border-gray-500 focus:outline-none"
                >
                  <option value="mp3">MP3</option>
                  <option value="aac">AAC</option>
                  <option value="ogg">OGG/Vorbis</option>
                  <option value="opus">Opus</option>
                </select>
              </div>
            </>
          )}

          {/* File options */}
          {sourceType === 'FILE' && (
            <>
              <div className="mb-4">
                <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Audio File</label>

                {/* Upload button */}
                <label className="mb-2 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-gray-700 bg-gray-900/50 px-4 py-3 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-300">
                  <input
                    type="file"
                    accept="audio/*"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  {uploading ? (
                    <>
                      <div className="h-4 w-4 animate-spin border-2 border-gray-500 border-t-transparent"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      Upload new file
                    </>
                  )}
                </label>

                {/* File selector */}
                {files.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border border-gray-800 bg-gray-900">
                    {files.map((file) => (
                      <button
                        key={file.id}
                        type="button"
                        onClick={() => {
                          setSelectedFileId(file.id)
                          if (!name) setName(file.filename.replace(/\.[^.]+$/, ''))
                        }}
                        className={`flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors ${
                          selectedFileId === file.id
                            ? 'bg-gray-800 text-white border-l-2 border-gray-400'
                            : 'text-gray-400 hover:bg-gray-800/50 border-l-2 border-transparent'
                        }`}
                      >
                        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs">{file.filename}</div>
                          <div className="text-[10px] font-mono text-gray-600">
                            {file.duration ? `${Math.floor(file.duration / 60)}:${String(Math.floor(file.duration % 60)).padStart(2, '0')}` : 'Unknown duration'}
                            {' · '}
                            {(file.size / 1024 / 1024).toFixed(1)} MB
                          </div>
                        </div>
                        {selectedFileId === file.id && (
                          <svg className="h-4 w-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Test Signal options */}
          {sourceType === 'TEST_SIGNAL' && (
            <div className="mb-4">
              <label className="mb-2 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Select Test Signal</label>
              <div className="border border-yellow-900/50 bg-yellow-950/20 p-3">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-mono text-yellow-500">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  Professional test tones for broadcast alignment
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Reference Tones */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gray-600">Reference Tones</span>
                    {[
                      { id: 'tone_1khz_10dbfs', name: '1kHz @ -10dBFS', desc: 'Standard alignment' },
                      { id: 'tone_1khz_18dbfs', name: '1kHz @ -18dBFS', desc: 'EBU R68 (PPM 4)' },
                      { id: 'tone_1khz_20dbfs', name: '1kHz @ -20dBFS', desc: 'Digital reference' },
                    ].map((signal) => (
                      <button
                        key={signal.id}
                        type="button"
                        onClick={() => {
                          setSelectedTestSignal(signal.id as TestSignalType)
                          if (!name) setName(signal.name)
                        }}
                        className={`w-full px-2 py-1.5 text-left text-xs transition-colors ${
                          selectedTestSignal === signal.id
                            ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700'
                            : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
                        }`}
                      >
                        <div className="font-medium">{signal.name}</div>
                        <div className={`text-[10px] font-mono ${selectedTestSignal === signal.id ? 'text-yellow-400/70' : 'text-gray-600'}`}>
                          {signal.desc}
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Diagnostic */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-gray-600">Diagnostic</span>
                    {[
                      { id: 'pink_noise', name: 'Pink Noise', desc: 'Room acoustics test' },
                      { id: 'stereo_id', name: 'L/R Identification', desc: 'Channel check' },
                      { id: 'sweep_20_20k', name: 'Freq Sweep', desc: '20Hz-20kHz' },
                    ].map((signal) => (
                      <button
                        key={signal.id}
                        type="button"
                        onClick={() => {
                          setSelectedTestSignal(signal.id as TestSignalType)
                          if (!name) setName(signal.name)
                        }}
                        className={`w-full px-2 py-1.5 text-left text-xs transition-colors ${
                          selectedTestSignal === signal.id
                            ? 'bg-yellow-900/50 text-yellow-300 border border-yellow-700'
                            : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
                        }`}
                      >
                        <div className="font-medium">{signal.name}</div>
                        <div className={`text-[10px] font-mono ${selectedTestSignal === signal.id ? 'text-yellow-400/70' : 'text-gray-600'}`}>
                          {signal.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quick reference */}
                <div className="mt-3 border border-gray-800 bg-gray-900/50 p-2 text-[10px] font-mono text-gray-600">
                  <div className="grid grid-cols-2 gap-x-2">
                    <span>-10 dBFS = 0 dBu (US)</span>
                    <span>-18 dBFS = PPM 4 (EBU)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SRT Input options */}
          {sourceType === 'SRT_STREAM' && (
            <div className="mb-4">
              <div className="border border-purple-900/50 bg-purple-950/20 p-3">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-mono text-purple-400">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  SRT (Secure Reliable Transport) input for low-latency contribution
                </div>

                {/* Mode selector */}
                <div className="mb-3">
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Connection Mode</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setSrtMode(SRTMode.LISTENER)}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                        srtMode === SRTMode.LISTENER
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-700'
                          : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
                      }`}
                    >
                      <div className="font-medium">Listener</div>
                      <div className={`text-[10px] font-mono ${srtMode === SRTMode.LISTENER ? 'text-purple-400/70' : 'text-gray-600'}`}>
                        Wait for connection
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSrtMode(SRTMode.CALLER)}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                        srtMode === SRTMode.CALLER
                          ? 'bg-purple-900/50 text-purple-300 border border-purple-700'
                          : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
                      }`}
                    >
                      <div className="font-medium">Caller</div>
                      <div className={`text-[10px] font-mono ${srtMode === SRTMode.CALLER ? 'text-purple-400/70' : 'text-gray-600'}`}>
                        Connect to remote
                      </div>
                    </button>
                  </div>
                </div>

                {/* Caller mode: Host and Port */}
                {srtMode === SRTMode.CALLER && (
                  <div className="mb-3 grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Host</label>
                      <input
                        type="text"
                        value={srtHost}
                        onChange={(e) => setSrtHost(e.target.value)}
                        placeholder="srt.example.com"
                        className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-purple-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Port</label>
                      <input
                        type="number"
                        value={srtPort}
                        onChange={(e) => setSrtPort(e.target.value)}
                        placeholder="9000"
                        min={1}
                        max={65535}
                        className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-purple-700 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Listener mode info */}
                {srtMode === SRTMode.LISTENER && (
                  <div className="mb-3 border border-gray-800 bg-gray-900/50 p-2 text-[10px] font-mono text-gray-500">
                    A port will be allocated automatically when the source is started.
                    The connection URL will be displayed in the source panel.
                  </div>
                )}

                {/* Optional fields */}
                <div className="mb-3">
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Stream ID (optional)</label>
                  <input
                    type="text"
                    value={srtStreamId}
                    onChange={(e) => setSrtStreamId(e.target.value)}
                    placeholder="my-stream"
                    className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-purple-700 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] font-mono text-gray-600">
                    Used to identify the stream when multiple streams share the same port
                  </p>
                </div>

                <div className="mb-3">
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Passphrase (optional)</label>
                  <input
                    type="password"
                    value={srtPassphrase}
                    onChange={(e) => setSrtPassphrase(e.target.value)}
                    placeholder="10-79 characters"
                    className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-purple-700 focus:outline-none"
                  />
                  <p className="mt-1 text-[10px] font-mono text-gray-600">
                    AES-128 encryption. Must be 10-79 characters if used.
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">
                    Latency: {srtLatency}ms
                  </label>
                  <input
                    type="range"
                    value={srtLatency}
                    onChange={(e) => setSrtLatency(parseInt(e.target.value))}
                    min={20}
                    max={8000}
                    step={10}
                    className="w-full accent-purple-500"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-gray-600">
                    <span>20ms (low)</span>
                    <span>120ms (default)</span>
                    <span>8000ms (high)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* RIST Input options */}
          {sourceType === 'RIST_STREAM' && (
            <div className="mb-4">
              <div className="border border-cyan-900/50 bg-cyan-950/20 p-3">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-mono text-cyan-400">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                  </svg>
                  RIST (Reliable Internet Stream Transport) - Alternative to SRT
                </div>

                {/* Mode selector */}
                <div className="mb-3">
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Connection Mode</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setRistMode(RISTMode.LISTENER)}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                        ristMode === RISTMode.LISTENER
                          ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700'
                          : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
                      }`}
                    >
                      <div className="font-medium">Listener</div>
                      <div className={`text-[10px] font-mono ${ristMode === RISTMode.LISTENER ? 'text-cyan-400/70' : 'text-gray-600'}`}>
                        Wait for connection
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRistMode(RISTMode.CALLER)}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                        ristMode === RISTMode.CALLER
                          ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700'
                          : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
                      }`}
                    >
                      <div className="font-medium">Caller</div>
                      <div className={`text-[10px] font-mono ${ristMode === RISTMode.CALLER ? 'text-cyan-400/70' : 'text-gray-600'}`}>
                        Connect to remote
                      </div>
                    </button>
                  </div>
                </div>

                {/* Caller mode: URL */}
                {ristMode === RISTMode.CALLER && (
                  <div className="mb-3">
                    <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">RIST URL</label>
                    <input
                      type="text"
                      value={ristUrl}
                      onChange={(e) => setRistUrl(e.target.value)}
                      placeholder="rist://host:port"
                      className="w-full border border-gray-800 bg-gray-900 px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:border-cyan-700 focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] font-mono text-gray-600">
                      Format: rist://hostname:port (e.g., rist://192.168.1.100:9000)
                    </p>
                  </div>
                )}

                {/* Listener mode info */}
                {ristMode === RISTMode.LISTENER && (
                  <div className="mb-3 border border-gray-800 bg-gray-900/50 p-2 text-[10px] font-mono text-gray-500">
                    A port will be allocated automatically when the source is started.
                    The connection URL will be displayed in the source panel.
                  </div>
                )}

                {/* Profile selector */}
                <div className="mb-3">
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Profile</label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setRistProfile(RISTProfile.SIMPLE)}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                        ristProfile === RISTProfile.SIMPLE
                          ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700'
                          : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
                      }`}
                    >
                      <div className="font-medium">Simple</div>
                      <div className={`text-[10px] font-mono ${ristProfile === RISTProfile.SIMPLE ? 'text-cyan-400/70' : 'text-gray-600'}`}>
                        Basic, widely compatible
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRistProfile(RISTProfile.MAIN)}
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                        ristProfile === RISTProfile.MAIN
                          ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700'
                          : 'bg-gray-900 text-gray-400 hover:bg-gray-800 border border-gray-800'
                      }`}
                    >
                      <div className="font-medium">Main</div>
                      <div className={`text-[10px] font-mono ${ristProfile === RISTProfile.MAIN ? 'text-cyan-400/70' : 'text-gray-600'}`}>
                        Advanced features + FEC
                      </div>
                    </button>
                  </div>
                </div>

                {/* Buffer size slider */}
                <div>
                  <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">
                    Buffer Size: {ristBuffer}ms
                  </label>
                  <input
                    type="range"
                    value={ristBuffer}
                    onChange={(e) => setRistBuffer(parseInt(e.target.value))}
                    min={100}
                    max={10000}
                    step={100}
                    className="w-full accent-cyan-500"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-gray-600">
                    <span>100ms (low)</span>
                    <span>1000ms (default)</span>
                    <span>10000ms (high)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Channel selector */}
          <div className="mb-4">
            <label className="mb-1 block text-[10px] font-mono uppercase tracking-wider text-gray-500">Output Channel</label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setChannel(AudioChannel.PROGRAM)}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  channel === AudioChannel.PROGRAM
                    ? 'bg-gray-700 text-white border border-gray-600'
                    : 'bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800'
                }`}
              >
                Program (PGM)
              </button>
              <button
                type="button"
                onClick={() => setChannel(AudioChannel.TALKBACK)}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  channel === AudioChannel.TALKBACK
                    ? 'bg-yellow-900/50 text-yellow-400 border border-yellow-800'
                    : 'bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800'
                }`}
              >
                Talkback (TB)
              </button>
              <button
                type="button"
                onClick={() => setChannel(AudioChannel.BOTH)}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                  channel === AudioChannel.BOTH
                    ? 'bg-purple-900/50 text-purple-400 border border-purple-800'
                    : 'bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800'
                }`}
              >
                Both
              </button>
            </div>
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
              {submitting ? 'Adding...' : 'Add Source'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
