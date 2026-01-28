export const DEFAULT_MAX_STREAMS = 5
export const DEFAULT_MAX_USERS = 10
export const DEFAULT_MAX_CALL_ROOMS = 10

export const JWT_ACCESS_EXPIRY = '15m'
export const JWT_REFRESH_EXPIRY = '7d'

export const STREAM_HEALTH_CHECK_INTERVAL_MS = 30000 // 30 seconds
export const STREAM_HEALTH_RETENTION_DAYS = 7

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128

export const VU_UPDATE_INTERVAL_MS = 50 // 20fps for smooth animation
export const VU_DECAY_RATE = 0.95 // Decay multiplier per frame

export const API_PERMISSIONS = [
  'streams:read',
  'streams:write',
  'account:read',
  'health:read',
] as const

export type ApiPermission = (typeof API_PERMISSIONS)[number]
