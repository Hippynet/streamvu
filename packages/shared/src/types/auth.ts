// =============================================================================
// ROLES
// =============================================================================

// Global platform role (for platform-level permissions)
export enum GlobalRole {
  SUPER_ADMIN = 'SUPER_ADMIN', // Platform admin (Hippynet staff)
  USER = 'USER', // Regular user
}

// Organization membership role
export enum OrgMemberRole {
  OWNER = 'OWNER', // Full control, can delete org
  ADMIN = 'ADMIN', // Can manage members, rooms, streams
  MEMBER = 'MEMBER', // Can use rooms, view streams
}

// Legacy UserRole - maps to the combination of GlobalRole + OrgMemberRole
// Kept for backward compatibility during migration
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ACCOUNT_ADMIN = 'ACCOUNT_ADMIN', // Maps to OrgMemberRole.OWNER/ADMIN
  USER = 'USER',
}

// =============================================================================
// USER
// =============================================================================

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string | null
  globalRole: GlobalRole
  createdAt: string
  updatedAt: string
  lastLoginAt: string | null
}

// Legacy User type with accountId - for backward compat
export interface LegacyUser extends User {
  role: UserRole
  accountId: string
}

// =============================================================================
// ORGANIZATION MEMBERSHIP
// =============================================================================

export interface OrganizationMember {
  id: string
  organizationId: string
  userId: string
  role: OrgMemberRole
  joinedAt: string
  user?: User
}

export interface OrganizationInvite {
  id: string
  organizationId: string
  email: string
  role: OrgMemberRole
  token: string
  createdById: string
  expiresAt: string
  acceptedAt: string | null
  createdAt: string
}

export interface CreateInviteRequest {
  email: string
  role?: OrgMemberRole
}

export interface AcceptInviteRequest {
  token: string
}

// =============================================================================
// AUTH TOKENS & JWT
// =============================================================================

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  user: User
  tokens: AuthTokens
  // The user's organizations (they can belong to multiple)
  organizations: Array<{
    id: string
    name: string
    slug: string
    role: OrgMemberRole
  }>
  // The currently active organization (first one or last used)
  currentOrganizationId: string
}

export interface RefreshTokenRequest {
  refreshToken: string
}

export interface RefreshTokenResponse {
  accessToken: string
  refreshToken: string
}

export interface JwtPayload {
  sub: string // User ID
  email: string
  globalRole: GlobalRole
  // Current organization context (can be switched)
  organizationId: string
  orgRole: OrgMemberRole
  iat: number
  exp: number
}

// Legacy JWT payload - for backward compat
export interface LegacyJwtPayload {
  sub: string
  email: string
  role: UserRole
  accountId: string
  iat: number
  exp: number
}

// =============================================================================
// USER MANAGEMENT
// =============================================================================

export interface CreateUserRequest {
  email: string
  password: string
  name: string
}

export interface UpdateUserRequest {
  email?: string
  name?: string
  password?: string
}

// =============================================================================
// OAUTH
// =============================================================================

export interface OAuthAccount {
  id: string
  provider: string
  providerAccountId: string
  createdAt: string
}

export interface GoogleAuthRequest {
  idToken: string
}

export interface GoogleAuthResponse {
  user: User
  tokens: AuthTokens
  isNewUser: boolean
  organizations: Array<{
    id: string
    name: string
    slug: string
    role: OrgMemberRole
  }>
  currentOrganizationId: string | null
}
