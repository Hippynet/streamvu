import bcrypt from 'bcryptjs'
import { OAuth2Client } from 'google-auth-library'
import { prisma } from '../lib/prisma.js'
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  type TokenPayload,
} from '../utils/jwt.js'
import { AppError } from '../middleware/errorHandler.js'
import {
  API_ERROR_CODES,
  GlobalRole,
  OrgMemberRole,
  type LoginResponse,
  type GoogleAuthResponse,
  type User,
  type AuthTokens,
} from '@streamvu/shared'

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)

function mapUser(user: {
  id: string
  email: string
  name: string
  avatarUrl: string | null
  globalRole: string
  createdAt: Date
  updatedAt: Date
  lastLoginAt: Date | null
}): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    globalRole: user.globalRole as GlobalRole,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  }
}

class AuthService {
  async login(email: string, password: string): Promise<LoginResponse> {
    // Get user with their organization memberships
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        organizations: {
          include: {
            organization: true,
          },
        },
      },
    })

    if (!user) {
      throw new AppError(401, API_ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password')
    }

    // Check password (null passwordHash means OAuth-only user)
    if (!user.passwordHash) {
      throw new AppError(
        401,
        API_ERROR_CODES.INVALID_CREDENTIALS,
        'This account uses social login. Please sign in with Google.'
      )
    }

    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      throw new AppError(401, API_ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password')
    }

    // Get user's organizations
    const organizations = user.organizations.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role as OrgMemberRole,
    }))

    // Check if user has any organizations
    if (organizations.length === 0) {
      throw new AppError(
        403,
        API_ERROR_CODES.FORBIDDEN,
        'User is not a member of any organization'
      )
    }

    // Use first organization as current (could be enhanced with "last used" tracking)
    const currentOrg = user.organizations[0]!

    // Check if current organization is suspended
    if (currentOrg.organization.suspended) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Organization is suspended')
    }

    const tokenPayload: TokenPayload = {
      sub: user.id,
      email: user.email,
      globalRole: user.globalRole as GlobalRole,
      organizationId: currentOrg.organizationId,
      orgRole: currentOrg.role as OrgMemberRole,
    }

    const accessToken = generateAccessToken(tokenPayload)
    const refreshToken = generateRefreshToken(tokenPayload)

    // Store refresh token
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    })

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    })

    return {
      user: mapUser(user),
      tokens: { accessToken, refreshToken },
      organizations,
      currentOrganizationId: currentOrg!.organizationId,
    }
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: {
        user: {
          include: {
            organizations: {
              include: {
                organization: true,
              },
            },
          },
        },
      },
    })

    if (!storedToken) {
      throw new AppError(401, API_ERROR_CODES.INVALID_TOKEN, 'Invalid refresh token')
    }

    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: storedToken.id } })
      throw new AppError(401, API_ERROR_CODES.TOKEN_EXPIRED, 'Refresh token has expired')
    }

    // Verify the JWT itself
    let oldPayload
    try {
      oldPayload = verifyToken(refreshToken)
    } catch {
      await prisma.refreshToken.delete({ where: { id: storedToken.id } })
      throw new AppError(401, API_ERROR_CODES.INVALID_TOKEN, 'Invalid refresh token')
    }

    // Delete old token
    await prisma.refreshToken.delete({ where: { id: storedToken.id } })

    // Get the user's current org (from the old token or first available)
    const currentOrgMembership = storedToken.user.organizations.find(
      (m) => m.organizationId === oldPayload.organizationId
    ) || storedToken.user.organizations[0]

    if (!currentOrgMembership) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'User is not a member of any organization')
    }

    const tokenPayload: TokenPayload = {
      sub: storedToken.user.id,
      email: storedToken.user.email,
      globalRole: storedToken.user.globalRole as GlobalRole,
      organizationId: currentOrgMembership.organizationId,
      orgRole: currentOrgMembership.role as OrgMemberRole,
    }

    const newAccessToken = generateAccessToken(tokenPayload)
    const newRefreshToken = generateRefreshToken(tokenPayload)

    // Store new refresh token
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: storedToken.user.id,
        expiresAt,
      },
    })

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    }
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    })
  }

  async getCurrentUser(userId: string): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'User not found')
    }

    return mapUser(user)
  }

  /**
   * Switch the user's current organization context
   * Returns new tokens with the updated org context
   */
  async switchOrganization(userId: string, organizationId: string): Promise<AuthTokens> {
    // Verify user is a member of the target organization
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      include: {
        organization: true,
        user: true,
      },
    })

    if (!membership) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'You are not a member of this organization')
    }

    if (membership.organization.suspended) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Organization is suspended')
    }

    const tokenPayload: TokenPayload = {
      sub: membership.user.id,
      email: membership.user.email,
      globalRole: membership.user.globalRole as GlobalRole,
      organizationId: membership.organizationId,
      orgRole: membership.role as OrgMemberRole,
    }

    const accessToken = generateAccessToken(tokenPayload)
    const refreshToken = generateRefreshToken(tokenPayload)

    // Store refresh token
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: membership.userId,
        expiresAt,
      },
    })

    return { accessToken, refreshToken }
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12)
  }

  /**
   * Authenticate with Google ID token (SPA flow)
   * Creates a new user if they don't exist, links OAuth account
   */
  async googleAuth(idToken: string): Promise<GoogleAuthResponse> {
    // Verify the Google ID token
    let payload
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
      payload = ticket.getPayload()
    } catch {
      throw new AppError(401, API_ERROR_CODES.INVALID_TOKEN, 'Invalid Google ID token')
    }

    if (!payload || !payload.email) {
      throw new AppError(401, API_ERROR_CODES.INVALID_TOKEN, 'Invalid Google token payload')
    }

    const { email, name, picture, sub: googleId } = payload

    // Check if we have an existing OAuth account for this Google ID
    const existingOAuthAccount = await prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: googleId,
        },
      },
      include: {
        user: {
          include: {
            organizations: {
              include: {
                organization: true,
              },
            },
          },
        },
      },
    })

    type UserWithOrgs = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>> & {
      organizations: Array<{
        organizationId: string
        role: string
        organization: { id: string; name: string; slug: string; suspended: boolean }
      }>
    }
    let user: UserWithOrgs | null = null
    let isNewUser = false

    if (existingOAuthAccount) {
      // User already linked, use existing account
      user = existingOAuthAccount.user as UserWithOrgs
    } else {
      // Check if there's an existing user with this email
      const existingUser = await prisma.user.findUnique({
        where: { email },
        include: {
          organizations: {
            include: {
              organization: true,
            },
          },
        },
      })

      if (existingUser) {
        // Link Google account to existing user
        await prisma.oAuthAccount.create({
          data: {
            userId: existingUser.id,
            provider: 'google',
            providerAccountId: googleId,
          },
        })
        user = existingUser as UserWithOrgs
      } else {
        // Create new user with OAuth account
        isNewUser = true
        const newUser = await prisma.user.create({
          data: {
            email,
            name: name || email.split('@')[0] || 'User',
            avatarUrl: picture,
            globalRole: 'USER',
            passwordHash: null, // OAuth-only user, no password
            oauthAccounts: {
              create: {
                provider: 'google',
                providerAccountId: googleId,
              },
            },
          },
          include: {
            organizations: {
              include: {
                organization: true,
              },
            },
          },
        })
        user = newUser as UserWithOrgs
      }
    }

    if (!user) {
      throw new AppError(500, API_ERROR_CODES.INTERNAL_ERROR, 'Failed to authenticate with Google')
    }

    // Get user's organizations
    const organizations = user.organizations.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role as OrgMemberRole,
    }))

    // Update last login and avatar if changed
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        ...(picture && picture !== user.avatarUrl ? { avatarUrl: picture } : {}),
      },
    })

    // If user has no organizations, they need to create or join one
    if (organizations.length === 0) {
      // Return user without tokens - frontend should redirect to org setup
      return {
        user: mapUser(user),
        tokens: { accessToken: '', refreshToken: '' },
        isNewUser,
        organizations: [],
        currentOrganizationId: null,
      }
    }

    // Use first organization as current
    const currentOrg = user.organizations[0]!

    // Check if current organization is suspended
    if (currentOrg.organization.suspended) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Organization is suspended')
    }

    const tokenPayload: TokenPayload = {
      sub: user.id,
      email: user.email,
      globalRole: user.globalRole as GlobalRole,
      organizationId: currentOrg.organizationId,
      orgRole: currentOrg.role as OrgMemberRole,
    }

    const accessToken = generateAccessToken(tokenPayload)
    const refreshToken = generateRefreshToken(tokenPayload)

    // Store refresh token
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt,
      },
    })

    return {
      user: mapUser(user),
      tokens: { accessToken, refreshToken },
      isNewUser,
      organizations,
      currentOrganizationId: currentOrg.organizationId,
    }
  }
}

export const authService = new AuthService()
