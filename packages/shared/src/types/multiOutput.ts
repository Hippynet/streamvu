/**
 * Multi-Output Types
 *
 * Types for managing multiple simultaneous output destinations.
 */

export type OutputType = 'icecast' | 'srt' | 'recording'

export type OutputStatus = 'idle' | 'connecting' | 'streaming' | 'error' | 'reconnecting'

export type AudioFormat = 'mp3' | 'ogg' | 'opus' | 'aac'

export type RecordingFormat = 'wav' | 'mp3' | 'flac' | 'ogg'

export type SrtCodec = 'opus' | 'aac' | 'pcm'

export interface OutputStats {
  bytesWritten: number
  duration: number
  startTime: string
  reconnects: number
  currentBitrate?: number
  bufferLevel?: number
}

export interface IcecastOutputConfig {
  type: 'icecast'
  host: string
  port: number
  mountpoint: string
  username: string
  password: string
  format: AudioFormat
  bitrate: number
  sampleRate: number
  channels: number
  icePublic?: boolean
  iceName?: string
  iceDescription?: string
  iceUrl?: string
  iceGenre?: string
}

export interface SrtOutputConfig {
  type: 'srt'
  host: string
  port: number
  streamId?: string
  passphrase?: string
  latency: number
  mode: 'caller'
  codec: SrtCodec
  bitrate: number
  sampleRate: number
  channels: number
}

export interface RecordingOutputConfig {
  type: 'recording'
  outputDir?: string
  filename?: string
  format: RecordingFormat
  bitrate?: number
  sampleRate: number
  channels: number
  maxDuration?: number
  splitEvery?: number
}

export type OutputConfig = IcecastOutputConfig | SrtOutputConfig | RecordingOutputConfig

export interface OutputDestination {
  id: string
  type: OutputType
  name: string
  enabled: boolean
  status: OutputStatus
  error?: string
  stats?: OutputStats
  config: OutputConfig
}

export interface CreateOutputRequest {
  roomId: string
  name: string
  config: OutputConfig
}

export interface UpdateOutputRequest {
  name?: string
  config?: Partial<OutputConfig>
}

export interface StartOutputRequest {
  inputSource: string
}

export interface OutputListResponse {
  outputs: OutputDestination[]
}

export interface OutputResponse {
  output: OutputDestination
}

export interface OutputStatusResponse {
  id: string
  name: string
  type: OutputType
  status: OutputStatus
  error?: string
  stats?: OutputStats
}
