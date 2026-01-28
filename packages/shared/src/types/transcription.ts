/**
 * Transcription Types
 *
 * Types for automatic transcription services
 * supporting Whisper, AssemblyAI, Deepgram, and others.
 */

/** Supported transcription providers */
export type TranscriptionProvider = 'whisper' | 'assemblyai' | 'deepgram' | 'aws' | 'google'

/** Transcription job status */
export type TranscriptionStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'

/** Transcription output format */
export type TranscriptionFormat = 'text' | 'srt' | 'vtt' | 'json'

/** Transcription configuration */
export interface TranscriptionConfig {
  id: string
  organizationId: string
  provider: TranscriptionProvider
  name: string
  enabled: boolean
  isDefault: boolean
  language?: string
  autoDetectLanguage: boolean
  enableSpeakerDiarization: boolean
  maxSpeakers?: number
  enablePunctuation: boolean
  enableProfanityFilter: boolean
  customVocabulary?: string[]
  webhookUrl?: string
  createdAt: string
  updatedAt: string
}

/** Provider-specific API configuration */
export interface TranscriptionProviderConfig {
  apiKey?: string
  apiUrl?: string
  model?: string
  region?: string
}

/** Whisper-specific options */
export interface WhisperOptions {
  model: 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v2' | 'large-v3'
  temperature?: number
  prompt?: string
  vadFilter?: boolean
}

/** AssemblyAI-specific options */
export interface AssemblyAIOptions {
  speechModel?: 'best' | 'nano'
  redactPii?: boolean
  piiPolicies?: string[]
  summarization?: boolean
  summaryType?: 'bullets' | 'paragraph' | 'headline'
  autoChapters?: boolean
  entityDetection?: boolean
  sentimentAnalysis?: boolean
}

/** Deepgram-specific options */
export interface DeepgramOptions {
  model?: 'nova-2' | 'nova' | 'enhanced' | 'base'
  tier?: 'nova' | 'enhanced' | 'base'
  smartFormat?: boolean
  paragraphs?: boolean
  utterances?: boolean
  detectTopics?: boolean
  summarize?: boolean
}

/** Transcription job */
export interface TranscriptionJob {
  id: string
  organizationId: string
  configId: string
  roomId?: string
  recordingId?: string
  sourceUrl?: string
  sourceFilename?: string
  status: TranscriptionStatus
  progress: number
  provider: TranscriptionProvider
  language?: string
  detectedLanguage?: string
  duration?: number
  wordCount?: number
  speakerCount?: number
  confidence?: number
  error?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}

/** Transcription result */
export interface TranscriptionResult {
  jobId: string
  text: string
  segments: TranscriptionSegment[]
  speakers?: SpeakerInfo[]
  metadata: TranscriptionMetadata
  formats: {
    text?: string
    srt?: string
    vtt?: string
    json?: object
  }
}

/** Individual transcription segment */
export interface TranscriptionSegment {
  id: number
  start: number // seconds
  end: number // seconds
  text: string
  words?: TranscriptionWord[]
  speaker?: string
  confidence?: number
}

/** Word-level timing */
export interface TranscriptionWord {
  word: string
  start: number
  end: number
  confidence?: number
  speaker?: string
}

/** Speaker information from diarization */
export interface SpeakerInfo {
  id: string
  label: string
  totalSpeakingTime: number
  segmentCount: number
  averageConfidence?: number
}

/** Transcription metadata */
export interface TranscriptionMetadata {
  audioFormat?: string
  audioDuration: number
  audioChannels?: number
  sampleRate?: number
  processingTime: number
  model?: string
  language: string
  confidence: number
}

/** Create transcription config request */
export interface CreateTranscriptionConfigRequest {
  provider: TranscriptionProvider
  name: string
  providerConfig: TranscriptionProviderConfig
  language?: string
  autoDetectLanguage?: boolean
  enableSpeakerDiarization?: boolean
  maxSpeakers?: number
  enablePunctuation?: boolean
  enableProfanityFilter?: boolean
  customVocabulary?: string[]
  enabled?: boolean
  isDefault?: boolean
}

/** Update transcription config request */
export interface UpdateTranscriptionConfigRequest {
  name?: string
  providerConfig?: Partial<TranscriptionProviderConfig>
  language?: string
  autoDetectLanguage?: boolean
  enableSpeakerDiarization?: boolean
  maxSpeakers?: number
  enablePunctuation?: boolean
  enableProfanityFilter?: boolean
  customVocabulary?: string[]
  enabled?: boolean
  isDefault?: boolean
}

/** Start transcription request */
export interface StartTranscriptionRequest {
  configId?: string // Use default if not specified
  recordingId?: string
  sourceUrl?: string
  language?: string
  outputFormats?: TranscriptionFormat[]
  webhookUrl?: string
  priority?: 'low' | 'normal' | 'high'
}

/** Transcription job list response */
export interface TranscriptionJobListResponse {
  jobs: TranscriptionJob[]
  total: number
  page: number
  pageSize: number
}

/** Transcription config list response */
export interface TranscriptionConfigListResponse {
  configs: TranscriptionConfig[]
  total: number
}

/** Transcription progress event (for socket) */
export interface TranscriptionProgressEvent {
  jobId: string
  status: TranscriptionStatus
  progress: number
  currentSegment?: number
  totalSegments?: number
  estimatedTimeRemaining?: number
}

/** Transcription completed event (for socket) */
export interface TranscriptionCompletedEvent {
  jobId: string
  recordingId?: string
  roomId?: string
  text: string
  wordCount: number
  duration: number
  language: string
}

/** Real-time transcription segment (for live transcription) */
export interface LiveTranscriptionSegment {
  roomId: string
  participantId?: string
  isFinal: boolean
  text: string
  start: number
  end: number
  confidence: number
  speaker?: string
}
