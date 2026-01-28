export interface Stream {
  id: string
  name: string
  url: string
  mountPoint: string | null
  displayOrder: number
  isVisible: boolean
  createdAt: string
  updatedAt: string
  // Optional for backward compatibility with API
  organizationId?: string
}

export interface StreamHealthCheck {
  id: string
  streamId: string
  isOnline: boolean
  bitrate: number | null
  listeners: number | null
  responseMs: number | null
  checkedAt: string
  // Extended Icecast metadata
  contentType: string | null
  codec: string | null
  sampleRate: number | null
  channels: number | null
  serverType: string | null
  stationName: string | null
  genre: string | null
  currentTitle: string | null
  serverDesc: string | null
  icyUrl: string | null
  icyPub: boolean | null
  audioInfo: string | null
}

export interface StreamWithHealth extends Stream {
  latestHealth: StreamHealthCheck | null
}

export interface CreateStreamRequest {
  name: string
  url: string
  mountPoint?: string
  displayOrder?: number
  isVisible?: boolean
}

export interface UpdateStreamRequest {
  name?: string
  url?: string
  mountPoint?: string
  displayOrder?: number
  isVisible?: boolean
}

export interface StreamStatus {
  streamId: string
  isOnline: boolean
  bitrate: number | null
  listeners: number | null
  lastChecked: string
}

export interface VULevels {
  left: number
  right: number
  peak: number
}
