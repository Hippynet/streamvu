export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: ApiError
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export interface WhmcsProvisionRequest {
  clientId: number
  email: string
  name: string
  packageName: string
  maxStreams: number
  maxUsers: number
  apiEnabled: boolean
}

export interface WhmcsSuspendRequest {
  clientId: number
}

export interface WhmcsTerminateRequest {
  clientId: number
}

export interface WhmcsUpgradeRequest {
  clientId: number
  maxStreams: number
  maxUsers: number
  apiEnabled: boolean
}

export type WhmcsAction = 'provision' | 'suspend' | 'unsuspend' | 'terminate' | 'upgrade'

export const API_ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  STREAM_LIMIT_REACHED: 'STREAM_LIMIT_REACHED',
  USER_LIMIT_REACHED: 'USER_LIMIT_REACHED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
} as const

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES]
