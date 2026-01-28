import bcrypt from 'bcryptjs'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../middleware/errorHandler.js'
import type {
  Organization,
  OrganizationWithRelations,
  PaginatedResponse,
  User,
} from '@streamvu/shared'
import {
  API_ERROR_CODES,
  GlobalRole,
  OrgMemberRole,
  DEFAULT_MAX_STREAMS,
  DEFAULT_MAX_USERS,
  DEFAULT_MAX_CALL_ROOMS,
} from '@streamvu/shared'

function mapOrganization(org: {
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
  createdAt: Date
  updatedAt: Date
}): Organization {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    maxStreams: org.maxStreams,
    maxUsers: org.maxUsers,
    maxCallRooms: org.maxCallRooms,
    apiEnabled: org.apiEnabled,
    suspended: org.suspended,
    primaryColor: org.primaryColor,
    logoUrl: org.logoUrl,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  }
}

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

interface CreateOrganizationData {
  name: string
  slug: string
  maxStreams?: number
  maxUsers?: number
  maxCallRooms?: number
  apiEnabled?: boolean
  adminEmail: string
  adminPassword: string
  adminName: string
}

interface UpdateOrganizationData {
  name?: string
  maxStreams?: number
  maxUsers?: number
  maxCallRooms?: number
  apiEnabled?: boolean
  suspended?: boolean
}

class AdminService {
  async listOrganizations(page: number, pageSize: number): Promise<PaginatedResponse<Organization>> {
    const skip = (page - 1) * pageSize

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.organization.count(),
    ])

    return {
      items: organizations.map(mapOrganization),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    }
  }

  async getOrganization(organizationId: string): Promise<OrganizationWithRelations> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        members: {
          include: { user: true },
        },
        streams: true,
      },
    })

    if (!org) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Organization not found')
    }

    return {
      ...mapOrganization(org),
      members: org.members.map((m) => ({
        id: m.id,
        organizationId: m.organizationId,
        userId: m.userId,
        role: m.role as OrgMemberRole,
        joinedAt: m.joinedAt.toISOString(),
        user: mapUser(m.user),
      })),
      streams: org.streams.map((stream) => ({
        id: stream.id,
        name: stream.name,
        url: stream.url,
        mountPoint: stream.mountPoint,
        organizationId: stream.organizationId,
        displayOrder: stream.displayOrder,
        isVisible: stream.isVisible,
        createdAt: stream.createdAt.toISOString(),
        updatedAt: stream.updatedAt.toISOString(),
      })),
    }
  }

  async createOrganization(data: CreateOrganizationData): Promise<Organization> {
    // Check for slug conflict
    const existingSlug = await prisma.organization.findUnique({
      where: { slug: data.slug },
    })

    if (existingSlug) {
      throw new AppError(
        409,
        API_ERROR_CODES.CONFLICT,
        'An organization with this slug already exists'
      )
    }

    // Check for email conflict
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.adminEmail },
    })

    if (existingEmail) {
      throw new AppError(409, API_ERROR_CODES.CONFLICT, 'A user with this email already exists')
    }

    const passwordHash = await bcrypt.hash(data.adminPassword, 12)

    // Create organization with owner user in a transaction
    const org = await prisma.$transaction(async (tx) => {
      // Create the user first
      const user = await tx.user.create({
        data: {
          email: data.adminEmail,
          passwordHash,
          name: data.adminName,
          globalRole: GlobalRole.USER,
        },
      })

      // Create the organization with the user as owner
      const organization = await tx.organization.create({
        data: {
          name: data.name,
          slug: data.slug,
          maxStreams: data.maxStreams ?? DEFAULT_MAX_STREAMS,
          maxUsers: data.maxUsers ?? DEFAULT_MAX_USERS,
          maxCallRooms: data.maxCallRooms ?? DEFAULT_MAX_CALL_ROOMS,
          apiEnabled: data.apiEnabled ?? false,
          members: {
            create: {
              userId: user.id,
              role: OrgMemberRole.OWNER,
            },
          },
        },
      })

      return organization
    })

    return mapOrganization(org)
  }

  async updateOrganization(
    organizationId: string,
    data: UpdateOrganizationData
  ): Promise<Organization> {
    const existing = await prisma.organization.findUnique({
      where: { id: organizationId },
    })

    if (!existing) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Organization not found')
    }

    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: data.name,
        maxStreams: data.maxStreams,
        maxUsers: data.maxUsers,
        maxCallRooms: data.maxCallRooms,
        apiEnabled: data.apiEnabled,
        suspended: data.suspended,
      },
    })

    return mapOrganization(org)
  }

  async deleteOrganization(organizationId: string): Promise<void> {
    const existing = await prisma.organization.findUnique({
      where: { id: organizationId },
    })

    if (!existing) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Organization not found')
    }

    // Cascading delete handles members, invites, streams, etc.
    await prisma.organization.delete({ where: { id: organizationId } })
  }

  async suspendOrganization(organizationId: string, suspended: boolean): Promise<Organization> {
    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: { suspended },
    })

    return mapOrganization(org)
  }
}

export const adminService = new AdminService()
