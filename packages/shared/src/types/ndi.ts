/**
 * NDI Types
 *
 * Types for NDI (Network Device Interface) bridge
 * enabling integration with professional broadcast equipment.
 */

/** NDI source discovery status */
export type NDIDiscoveryStatus = 'discovering' | 'ready' | 'error'

/** NDI connection state */
export type NDIConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

/** NDI stream direction */
export type NDIStreamDirection = 'send' | 'receive'

/** NDI audio format */
export interface NDIAudioFormat {
  sampleRate: 48000 | 44100 | 96000
  channels: number
  bitsPerSample: 16 | 24 | 32
}

/** NDI video format */
export interface NDIVideoFormat {
  width: number
  height: number
  frameRate: number
  progressive: boolean
  aspectRatio?: string
}

/** NDI source (discovered on network) */
export interface NDISource {
  id: string
  name: string
  url: string
  ipAddress: string
  machineName: string
  groups?: string[]
  isAvailable: boolean
  lastSeen: string
  metadata?: Record<string, string>
}

/** NDI output stream configuration */
export interface NDIOutputStream {
  id: string
  organizationId: string
  roomId?: string
  name: string
  enabled: boolean
  direction: 'send'
  state: NDIConnectionState
  sourceName: string // The name this will appear as on the network
  groups?: string[]
  audioFormat: NDIAudioFormat
  videoFormat?: NDIVideoFormat
  failoverSource?: string
  lowBandwidth: boolean
  createdAt: string
  updatedAt: string
}

/** NDI input stream configuration */
export interface NDIInputStream {
  id: string
  organizationId: string
  roomId?: string
  name: string
  enabled: boolean
  direction: 'receive'
  state: NDIConnectionState
  sourceUrl: string // URL of the NDI source to receive from
  sourceName?: string
  audioFormat: NDIAudioFormat
  videoFormat?: NDIVideoFormat
  bandwidth: 'lowest' | 'low' | 'high' | 'highest'
  autoReconnect: boolean
  reconnectInterval: number // seconds
  createdAt: string
  updatedAt: string
}

/** Union type for NDI streams */
export type NDIStream = NDIOutputStream | NDIInputStream

/** NDI bridge instance status */
export interface NDIBridgeStatus {
  running: boolean
  version: string
  ndilibVersion: string
  platform: string
  cpuUsage: number
  memoryUsage: number
  activeStreams: number
  discoveredSources: number
  lastError?: string
  uptime: number
}

/** NDI stream statistics */
export interface NDIStreamStats {
  streamId: string
  bytesTotal: number
  bytesSent?: number
  bytesReceived?: number
  packetsDropped: number
  averageLatency: number
  jitter: number
  quality: 'excellent' | 'good' | 'fair' | 'poor'
  fps?: number
  audioPeakLevel: number
}

/** Create NDI output request */
export interface CreateNDIOutputRequest {
  roomId?: string
  name: string
  sourceName: string
  groups?: string[]
  audioFormat?: Partial<NDIAudioFormat>
  videoFormat?: Partial<NDIVideoFormat>
  failoverSource?: string
  lowBandwidth?: boolean
}

/** Create NDI input request */
export interface CreateNDIInputRequest {
  roomId?: string
  name: string
  sourceUrl: string
  audioFormat?: Partial<NDIAudioFormat>
  bandwidth?: 'lowest' | 'low' | 'high' | 'highest'
  autoReconnect?: boolean
  reconnectInterval?: number
}

/** Update NDI stream request */
export interface UpdateNDIStreamRequest {
  name?: string
  enabled?: boolean
  groups?: string[]
  audioFormat?: Partial<NDIAudioFormat>
  videoFormat?: Partial<NDIVideoFormat>
  failoverSource?: string
  lowBandwidth?: boolean
  bandwidth?: 'lowest' | 'low' | 'high' | 'highest'
  autoReconnect?: boolean
  reconnectInterval?: number
}

/** NDI stream list response */
export interface NDIStreamListResponse {
  streams: NDIStream[]
  total: number
}

/** NDI source list response */
export interface NDISourceListResponse {
  sources: NDISource[]
  discoveryStatus: NDIDiscoveryStatus
  lastDiscovery: string
}

/** NDI bridge configuration */
export interface NDIBridgeConfig {
  enabled: boolean
  port: number
  groups?: string[]
  allowDiscovery: boolean
  multicast: boolean
  ttl: number
  sendNetworkMask?: string
  receiveNetworkMask?: string
}

/** NDI tally state */
export interface NDITallyState {
  streamId: string
  sourceName: string
  onProgram: boolean
  onPreview: boolean
  updatedAt: string
}

/** NDI metadata packet */
export interface NDIMetadata {
  streamId: string
  type: 'connection' | 'status' | 'tally' | 'custom'
  data: Record<string, unknown>
  timestamp: string
}

/** NDI stream state change event (for socket) */
export interface NDIStreamStateEvent {
  streamId: string
  previousState: NDIConnectionState
  newState: NDIConnectionState
  error?: string
  timestamp: string
}

/** NDI source discovered event (for socket) */
export interface NDISourceDiscoveredEvent {
  source: NDISource
  isNew: boolean
  timestamp: string
}

/** NDI source lost event (for socket) */
export interface NDISourceLostEvent {
  sourceId: string
  sourceName: string
  lastSeen: string
  timestamp: string
}

/** NDI tally update event (for socket) */
export interface NDITallyUpdateEvent {
  streamId: string
  sourceName: string
  onProgram: boolean
  onPreview: boolean
  timestamp: string
}
