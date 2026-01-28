import type { User, OrganizationMember } from './auth.js'
import type { Stream } from './stream.js'

// =============================================================================
// ORGANIZATION (new)
// =============================================================================

export interface Organization {
  id: string
  name: string
  slug: string
  maxStreams: number
  maxUsers: number
  maxCallRooms: number
  apiEnabled: boolean
  suspended: boolean
  primaryColor: string | null
  logoUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface OrganizationWithRelations extends Organization {
  members: OrganizationMember[]
  streams: Stream[]
}

export interface CreateOrganizationRequest {
  name: string
  slug?: string // Auto-generated from name if not provided
}

export interface UpdateOrganizationRequest {
  name?: string
  primaryColor?: string
  logoUrl?: string
}

export interface OrganizationStats {
  streamCount: number
  memberCount: number
  callRoomCount: number
  maxStreams: number
  maxUsers: number
  maxCallRooms: number
}

// =============================================================================
// ACCOUNT (legacy - kept for backward compatibility)
// =============================================================================

export interface Account {
  id: string
  name: string
  slug: string
  whmcsClientId: number | null
  maxStreams: number
  maxUsers: number
  apiEnabled: boolean
  primaryColor: string | null
  logoUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface AccountWithRelations extends Account {
  users: User[]
  streams: Stream[]
}

export interface CreateAccountRequest {
  name: string
  slug: string
  whmcsClientId?: number
  maxStreams?: number
  maxUsers?: number
  apiEnabled?: boolean
}

export interface UpdateAccountRequest {
  name?: string
  maxStreams?: number
  maxUsers?: number
  apiEnabled?: boolean
  primaryColor?: string
  logoUrl?: string
}

export interface AccountStats {
  streamCount: number
  userCount: number
  maxStreams: number
  maxUsers: number
}

// =============================================================================
// API KEYS
// =============================================================================

export interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  organizationId: string
  permissions: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export interface CreateApiKeyRequest {
  name: string
  permissions: string[]
  expiresAt?: string
}

export interface CreateApiKeyResponse {
  apiKey: ApiKey
  secretKey: string // Only returned on creation
}
