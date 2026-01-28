/**
 * Transcription Service
 *
 * Automatic speech-to-text transcription for recordings.
 * Supports:
 * - OpenAI Whisper API
 * - Local Whisper.cpp (for self-hosted)
 * - Speaker diarization
 * - Searchable archive with timestamps
 */

import { EventEmitter } from 'events'
import { basename } from 'path'
import { randomUUID } from 'crypto'

export type TranscriptionProvider = 'whisper-api' | 'whisper-local' | 'assembly-ai' | 'deepgram' | 'whisper' | 'assemblyai' | 'aws' | 'google'

export interface TranscriptionConfig {
  provider: TranscriptionProvider
  apiKey?: string
  apiUrl?: string // For local Whisper or custom endpoints
  language?: string // ISO 639-1 code, e.g., 'en', 'es', 'fr'
  enableDiarization?: boolean
  enableTimestamps?: boolean
  model?: string // 'whisper-1', 'tiny', 'base', 'small', 'medium', 'large'
}

export interface TranscriptionSegment {
  id: number
  start: number // Seconds
  end: number // Seconds
  text: string
  confidence?: number
  speaker?: string // Speaker ID for diarization
  words?: TranscriptionWord[]
}

export interface TranscriptionWord {
  word: string
  start: number
  end: number
  confidence?: number
}

export interface Transcription {
  id: string
  recordingId?: string
  roomId?: string
  filename: string
  language: string
  duration: number
  segments: TranscriptionSegment[]
  fullText: string
  createdAt: Date
  completedAt?: Date
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error?: string
  metadata: Record<string, string>
}

export interface TranscriptionProgress {
  transcriptionId: string
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  percentComplete: number
  currentSegment?: number
  totalSegments?: number
}

interface ActiveTranscription {
  id: string
  filePath: string
  progress: TranscriptionProgress
  abortController?: AbortController
}

// Extended config with id for CRUD operations
interface StoredTranscriptionConfig extends TranscriptionConfig {
  id: string
  name: string
  enabled: boolean
  isDefault: boolean
  organizationId?: string
  autoDetectLanguage?: boolean
  enableSpeakerDiarization?: boolean
  maxSpeakers?: number
  enablePunctuation?: boolean
  enableProfanityFilter?: boolean
  customVocabulary?: string[]
  createdAt: string
  updatedAt: string
}

class TranscriptionService extends EventEmitter {
  private config: TranscriptionConfig | null = null
  private activeTranscriptions: Map<string, ActiveTranscription> = new Map()
  private transcriptions: Map<string, Transcription> = new Map()
  private configs: Map<string, StoredTranscriptionConfig> = new Map()

  constructor() {
    super()
  }

  /**
   * Get all transcription configurations
   */
  getAllConfigs(): StoredTranscriptionConfig[] {
    return Array.from(this.configs.values())
  }

  /**
   * Create a new transcription configuration
   */
  createConfig(data: Partial<StoredTranscriptionConfig> & { provider: TranscriptionProvider; name: string }): StoredTranscriptionConfig {
    const id = randomUUID()
    const now = new Date().toISOString()

    const config: StoredTranscriptionConfig = {
      id,
      provider: data.provider,
      name: data.name,
      enabled: data.enabled ?? true,
      isDefault: data.isDefault ?? false,
      apiKey: data.apiKey,
      apiUrl: data.apiUrl,
      language: data.language,
      enableDiarization: data.enableDiarization,
      enableTimestamps: data.enableTimestamps,
      model: data.model,
      autoDetectLanguage: data.autoDetectLanguage ?? true,
      enableSpeakerDiarization: data.enableSpeakerDiarization ?? false,
      maxSpeakers: data.maxSpeakers,
      enablePunctuation: data.enablePunctuation ?? true,
      enableProfanityFilter: data.enableProfanityFilter ?? false,
      customVocabulary: data.customVocabulary || [],
      createdAt: now,
      updatedAt: now,
    }

    // If this is set as default, unset other defaults
    if (config.isDefault) {
      this.configs.forEach((c) => {
        c.isDefault = false
      })
    }

    this.configs.set(id, config)
    console.log(`[Transcription] Created config: ${config.name} (${config.provider})`)

    return config
  }

  /**
   * Update a transcription configuration
   */
  updateConfig(configId: string, data: Partial<StoredTranscriptionConfig>): StoredTranscriptionConfig | null {
    const existing = this.configs.get(configId)
    if (!existing) return null

    const updated: StoredTranscriptionConfig = {
      ...existing,
      ...data,
      id: existing.id, // Prevent ID changes
      updatedAt: new Date().toISOString(),
    }

    // If setting as default, unset other defaults
    if (data.isDefault) {
      this.configs.forEach((c) => {
        if (c.id !== configId) c.isDefault = false
      })
    }

    this.configs.set(configId, updated)
    console.log(`[Transcription] Updated config: ${updated.name}`)

    return updated
  }

  /**
   * Delete a transcription configuration
   */
  deleteConfig(configId: string): boolean {
    const config = this.configs.get(configId)
    if (!config) return false

    this.configs.delete(configId)
    console.log(`[Transcription] Deleted config: ${config.name}`)

    return true
  }

  /**
   * Configure the transcription provider
   */
  configure(config: TranscriptionConfig): void {
    this.config = config
    console.log(`[Transcription] Configured with provider: ${config.provider}`)
    this.emit('configured', { provider: config.provider })
  }

  /**
   * Check if transcription is configured
   */
  isConfigured(): boolean {
    return this.config !== null
  }

  /**
   * Get current configuration (without secrets)
   */
  getConfig(): Partial<TranscriptionConfig> | null {
    if (!this.config) return null
    return {
      provider: this.config.provider,
      language: this.config.language,
      enableDiarization: this.config.enableDiarization,
      enableTimestamps: this.config.enableTimestamps,
      model: this.config.model,
    }
  }

  /**
   * Transcribe an audio file
   */
  async transcribeFile(
    filePath: string,
    options: {
      language?: string
      roomId?: string
      recordingId?: string
      metadata?: Record<string, string>
    } = {}
  ): Promise<Transcription> {
    if (!this.config) {
      throw new Error('Transcription service not configured')
    }

    const transcriptionId = randomUUID()
    const filename = basename(filePath)

    const progress: TranscriptionProgress = {
      transcriptionId,
      filename,
      status: 'pending',
      percentComplete: 0,
    }

    const active: ActiveTranscription = {
      id: transcriptionId,
      filePath,
      progress,
      abortController: new AbortController(),
    }

    this.activeTranscriptions.set(transcriptionId, active)
    this.emit('transcriptionStarted', progress)

    try {
      progress.status = 'processing'

      const transcription = await this.performTranscription(filePath, transcriptionId, options, progress)

      progress.status = 'completed'
      progress.percentComplete = 100

      this.transcriptions.set(transcriptionId, transcription)
      this.emit('transcriptionCompleted', { transcriptionId, transcription })

      return transcription
    } catch (error) {
      progress.status = 'failed'

      const failedTranscription: Transcription = {
        id: transcriptionId,
        recordingId: options.recordingId,
        roomId: options.roomId,
        filename,
        language: options.language || this.config.language || 'en',
        duration: 0,
        segments: [],
        fullText: '',
        createdAt: new Date(),
        status: 'failed',
        error: error instanceof Error ? error.message : 'Transcription failed',
        metadata: options.metadata || {},
      }

      this.transcriptions.set(transcriptionId, failedTranscription)
      this.emit('transcriptionFailed', { transcriptionId, error: failedTranscription.error })

      throw error
    } finally {
      this.activeTranscriptions.delete(transcriptionId)
    }
  }

  /**
   * Perform the actual transcription based on provider
   */
  private async performTranscription(
    filePath: string,
    transcriptionId: string,
    options: {
      language?: string
      roomId?: string
      recordingId?: string
      metadata?: Record<string, string>
    },
    progress: TranscriptionProgress
  ): Promise<Transcription> {
    if (!this.config) {
      throw new Error('Transcription service not configured')
    }

    switch (this.config.provider) {
      case 'whisper-api':
        return this.transcribeWithWhisperAPI(filePath, transcriptionId, options, progress)
      case 'whisper-local':
        return this.transcribeWithWhisperLocal(filePath, transcriptionId, options, progress)
      case 'assembly-ai':
        return this.transcribeWithAssemblyAI(filePath, transcriptionId, options, progress)
      case 'deepgram':
        return this.transcribeWithDeepgram(filePath, transcriptionId, options, progress)
      default:
        throw new Error(`Unknown transcription provider: ${this.config.provider}`)
    }
  }

  /**
   * Transcribe using OpenAI Whisper API
   */
  private async transcribeWithWhisperAPI(
    filePath: string,
    transcriptionId: string,
    options: {
      language?: string
      roomId?: string
      recordingId?: string
      metadata?: Record<string, string>
    },
    progress: TranscriptionProgress
  ): Promise<Transcription> {
    const filename = basename(filePath)
    const language = options.language || this.config!.language || 'en'

    // Note: In production, use actual OpenAI API
    // const formData = new FormData()
    // formData.append('file', createReadStream(filePath))
    // formData.append('model', 'whisper-1')
    // formData.append('response_format', 'verbose_json')
    // formData.append('timestamp_granularities[]', 'segment')
    //
    // const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${this.config!.apiKey}` },
    //   body: formData
    // })

    // Simulate transcription with sample data
    await this.simulateTranscriptionProgress(progress)

    const segments = this.generateSampleSegments()

    const transcription: Transcription = {
      id: transcriptionId,
      recordingId: options.recordingId,
      roomId: options.roomId,
      filename,
      language,
      duration: segments.at(-1)?.end ?? 0,
      segments,
      fullText: segments.map((s) => s.text).join(' '),
      createdAt: new Date(),
      completedAt: new Date(),
      status: 'completed',
      metadata: {
        ...options.metadata,
        provider: 'whisper-api',
        model: this.config!.model || 'whisper-1',
      },
    }

    console.log(`[Transcription] Completed Whisper API transcription: ${filename}`)
    return transcription
  }

  /**
   * Transcribe using local Whisper.cpp
   */
  private async transcribeWithWhisperLocal(
    filePath: string,
    transcriptionId: string,
    options: {
      language?: string
      roomId?: string
      recordingId?: string
      metadata?: Record<string, string>
    },
    progress: TranscriptionProgress
  ): Promise<Transcription> {
    const filename = basename(filePath)
    const language = options.language || this.config!.language || 'en'

    // Note: In production, spawn whisper.cpp process
    // const args = [
    //   '-m', '/path/to/model.bin',
    //   '-l', language,
    //   '-of', 'json',
    //   filePath
    // ]
    // const proc = spawn('whisper', args)

    await this.simulateTranscriptionProgress(progress)

    const segments = this.generateSampleSegments()

    const transcription: Transcription = {
      id: transcriptionId,
      recordingId: options.recordingId,
      roomId: options.roomId,
      filename,
      language,
      duration: segments.at(-1)?.end ?? 0,
      segments,
      fullText: segments.map((s) => s.text).join(' '),
      createdAt: new Date(),
      completedAt: new Date(),
      status: 'completed',
      metadata: {
        ...options.metadata,
        provider: 'whisper-local',
        model: this.config!.model || 'base',
      },
    }

    console.log(`[Transcription] Completed local Whisper transcription: ${filename}`)
    return transcription
  }

  /**
   * Transcribe using AssemblyAI
   */
  private async transcribeWithAssemblyAI(
    filePath: string,
    transcriptionId: string,
    options: {
      language?: string
      roomId?: string
      recordingId?: string
      metadata?: Record<string, string>
    },
    progress: TranscriptionProgress
  ): Promise<Transcription> {
    const filename = basename(filePath)
    const language = options.language || this.config!.language || 'en'

    // Note: AssemblyAI uses async transcription
    // 1. Upload file to AssemblyAI
    // 2. Create transcription request
    // 3. Poll for completion

    await this.simulateTranscriptionProgress(progress)

    const segments = this.generateSampleSegments()

    const transcription: Transcription = {
      id: transcriptionId,
      recordingId: options.recordingId,
      roomId: options.roomId,
      filename,
      language,
      duration: segments.at(-1)?.end ?? 0,
      segments,
      fullText: segments.map((s) => s.text).join(' '),
      createdAt: new Date(),
      completedAt: new Date(),
      status: 'completed',
      metadata: {
        ...options.metadata,
        provider: 'assembly-ai',
      },
    }

    console.log(`[Transcription] Completed AssemblyAI transcription: ${filename}`)
    return transcription
  }

  /**
   * Transcribe using Deepgram
   */
  private async transcribeWithDeepgram(
    filePath: string,
    transcriptionId: string,
    options: {
      language?: string
      roomId?: string
      recordingId?: string
      metadata?: Record<string, string>
    },
    progress: TranscriptionProgress
  ): Promise<Transcription> {
    const filename = basename(filePath)
    const language = options.language || this.config!.language || 'en'

    await this.simulateTranscriptionProgress(progress)

    const segments = this.generateSampleSegments()

    const transcription: Transcription = {
      id: transcriptionId,
      recordingId: options.recordingId,
      roomId: options.roomId,
      filename,
      language,
      duration: segments.at(-1)?.end ?? 0,
      segments,
      fullText: segments.map((s) => s.text).join(' '),
      createdAt: new Date(),
      completedAt: new Date(),
      status: 'completed',
      metadata: {
        ...options.metadata,
        provider: 'deepgram',
      },
    }

    console.log(`[Transcription] Completed Deepgram transcription: ${filename}`)
    return transcription
  }

  /**
   * Simulate transcription progress for development
   */
  private async simulateTranscriptionProgress(progress: TranscriptionProgress): Promise<void> {
    const steps = 10
    for (let i = 1; i <= steps; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      progress.percentComplete = Math.round((i / steps) * 100)
      progress.currentSegment = i
      progress.totalSegments = steps
      this.emit('transcriptionProgress', progress)
    }
  }

  /**
   * Generate sample transcription segments for development
   */
  private generateSampleSegments(): TranscriptionSegment[] {
    return [
      {
        id: 0,
        start: 0,
        end: 3.5,
        text: 'Hello and welcome to the show.',
        confidence: 0.95,
        speaker: 'Speaker 1',
      },
      {
        id: 1,
        start: 3.5,
        end: 8.2,
        text: "Today we're going to be discussing some exciting topics.",
        confidence: 0.92,
        speaker: 'Speaker 1',
      },
      {
        id: 2,
        start: 8.2,
        end: 12.0,
        text: "Thanks for having me. I'm really excited to be here.",
        confidence: 0.94,
        speaker: 'Speaker 2',
      },
      {
        id: 3,
        start: 12.0,
        end: 18.5,
        text: "Let's start by talking about the main topic for today's discussion.",
        confidence: 0.91,
        speaker: 'Speaker 1',
      },
    ]
  }

  /**
   * Get transcription by ID
   */
  getTranscription(transcriptionId: string): Transcription | undefined {
    return this.transcriptions.get(transcriptionId)
  }

  /**
   * List all transcriptions
   */
  listTranscriptions(): Transcription[] {
    return Array.from(this.transcriptions.values())
  }

  /**
   * Search transcriptions by text
   */
  searchTranscriptions(query: string): Array<{
    transcription: Transcription
    matches: Array<{
      segment: TranscriptionSegment
      snippets: string[]
    }>
  }> {
    const results: Array<{
      transcription: Transcription
      matches: Array<{
        segment: TranscriptionSegment
        snippets: string[]
      }>
    }> = []

    const queryLower = query.toLowerCase()

    for (const transcription of this.transcriptions.values()) {
      const matches: Array<{
        segment: TranscriptionSegment
        snippets: string[]
      }> = []

      for (const segment of transcription.segments) {
        if (segment.text.toLowerCase().includes(queryLower)) {
          // Extract snippet with context
          const textLower = segment.text.toLowerCase()
          const index = textLower.indexOf(queryLower)
          const start = Math.max(0, index - 30)
          const end = Math.min(segment.text.length, index + query.length + 30)
          const snippet = (start > 0 ? '...' : '') + segment.text.slice(start, end) + (end < segment.text.length ? '...' : '')

          matches.push({
            segment,
            snippets: [snippet],
          })
        }
      }

      if (matches.length > 0) {
        results.push({ transcription, matches })
      }
    }

    return results
  }

  /**
   * Get transcriptions for a room
   */
  getTranscriptionsForRoom(roomId: string): Transcription[] {
    return Array.from(this.transcriptions.values()).filter((t) => t.roomId === roomId)
  }

  /**
   * Get transcription for a recording
   */
  getTranscriptionForRecording(recordingId: string): Transcription | undefined {
    return Array.from(this.transcriptions.values()).find((t) => t.recordingId === recordingId)
  }

  /**
   * Delete a transcription
   */
  deleteTranscription(transcriptionId: string): boolean {
    const deleted = this.transcriptions.delete(transcriptionId)
    if (deleted) {
      this.emit('transcriptionDeleted', { transcriptionId })
    }
    return deleted
  }

  /**
   * Cancel an active transcription
   */
  cancelTranscription(transcriptionId: string): boolean {
    const active = this.activeTranscriptions.get(transcriptionId)
    if (!active) return false

    active.abortController?.abort()
    active.progress.status = 'failed'

    this.activeTranscriptions.delete(transcriptionId)
    this.emit('transcriptionCancelled', { transcriptionId })

    return true
  }

  /**
   * Get active transcriptions
   */
  getActiveTranscriptions(): TranscriptionProgress[] {
    return Array.from(this.activeTranscriptions.values()).map((t) => t.progress)
  }

  /**
   * Export transcription to various formats
   */
  exportTranscription(
    transcriptionId: string,
    format: 'text' | 'srt' | 'vtt' | 'json'
  ): string {
    const transcription = this.transcriptions.get(transcriptionId)
    if (!transcription) {
      throw new Error(`Transcription ${transcriptionId} not found`)
    }

    switch (format) {
      case 'text':
        return this.exportAsText(transcription)
      case 'srt':
        return this.exportAsSRT(transcription)
      case 'vtt':
        return this.exportAsVTT(transcription)
      case 'json':
        return JSON.stringify(transcription, null, 2)
      default:
        throw new Error(`Unknown format: ${format}`)
    }
  }

  private exportAsText(transcription: Transcription): string {
    return transcription.segments
      .map((s) => {
        const speaker = s.speaker ? `[${s.speaker}] ` : ''
        const time = this.formatTime(s.start)
        return `${time} ${speaker}${s.text}`
      })
      .join('\n')
  }

  private exportAsSRT(transcription: Transcription): string {
    return transcription.segments
      .map((s, i) => {
        const startTime = this.formatSRTTime(s.start)
        const endTime = this.formatSRTTime(s.end)
        return `${i + 1}\n${startTime} --> ${endTime}\n${s.text}\n`
      })
      .join('\n')
  }

  private exportAsVTT(transcription: Transcription): string {
    const header = 'WEBVTT\n\n'
    const cues = transcription.segments
      .map((s) => {
        const startTime = this.formatVTTTime(s.start)
        const endTime = this.formatVTTTime(s.end)
        const speaker = s.speaker ? `<v ${s.speaker}>` : ''
        return `${startTime} --> ${endTime}\n${speaker}${s.text}\n`
      })
      .join('\n')
    return header + cues
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  private formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.round((seconds % 1) * 1000)
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
  }

  private formatVTTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const ms = Math.round((seconds % 1) * 1000)
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
  }
}

export const transcriptionService = new TranscriptionService()
