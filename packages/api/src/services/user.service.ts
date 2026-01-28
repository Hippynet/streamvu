import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../middleware/errorHandler.js'
import type { User, UpdateUserRequest } from '@streamvu/shared'
import { API_ERROR_CODES, GlobalRole } from '@streamvu/shared'

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

class UserService {
  async getUser(userId: string): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'User not found')
    }

    return mapUser(user)
  }

  async updateProfile(userId: string, data: UpdateUserRequest): Promise<User> {
    // Check for email conflict if email is being changed
    if (data.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email },
      })

      if (existingUser && existingUser.id !== userId) {
        throw new AppError(409, API_ERROR_CODES.CONFLICT, 'A user with this email already exists')
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        email: data.email,
        name: data.name,
      },
    })

    return mapUser(user)
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    if (!user) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'User not found')
    }

    // OAuth-only users can't change password (they don't have one)
    if (!user.passwordHash) {
      throw new AppError(
        400,
        API_ERROR_CODES.VALIDATION_ERROR,
        'Cannot change password for social login accounts'
      )
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValid) {
      throw new AppError(401, API_ERROR_CODES.INVALID_CREDENTIALS, 'Current password is incorrect')
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12)

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    })

    // Invalidate all refresh tokens to force re-login
    await prisma.refreshToken.deleteMany({
      where: { userId },
    })
  }

  /**
   * Get user's organization memberships
   */
  async getUserOrganizations(userId: string) {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId },
      include: {
        organization: true,
      },
      orderBy: {
        joinedAt: 'asc',
      },
    })

    return memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      primaryColor: m.organization.primaryColor,
      logoUrl: m.organization.logoUrl,
    }))
  }
}

export const userService = new UserService()
