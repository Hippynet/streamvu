import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../middleware/errorHandler.js'
import type {
  Organization,
  OrganizationStats,
  User,
  OrganizationMember,
  OrganizationInvite,
  CreateInviteRequest,
} from '@streamvu/shared'
import { API_ERROR_CODES, GlobalRole, OrgMemberRole } from '@streamvu/shared'

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

function mapMember(member: {
  id: string
  organizationId: string
  userId: string
  role: string
  joinedAt: Date
  user: {
    id: string
    email: string
    name: string
    avatarUrl: string | null
    globalRole: string
    createdAt: Date
    updatedAt: Date
    lastLoginAt: Date | null
  }
}): OrganizationMember {
  return {
    id: member.id,
    organizationId: member.organizationId,
    userId: member.userId,
    role: member.role as OrgMemberRole,
    joinedAt: member.joinedAt.toISOString(),
    user: mapUser(member.user),
  }
}

function mapInvite(invite: {
  id: string
  organizationId: string
  email: string
  role: string
  token: string
  createdById: string
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
}): OrganizationInvite {
  return {
    id: invite.id,
    organizationId: invite.organizationId,
    email: invite.email,
    role: invite.role as OrgMemberRole,
    token: invite.token,
    createdById: invite.createdById,
    expiresAt: invite.expiresAt.toISOString(),
    acceptedAt: invite.acceptedAt?.toISOString() ?? null,
    createdAt: invite.createdAt.toISOString(),
  }
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

class OrganizationService {
  async getOrganization(organizationId: string): Promise<Organization> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    })

    if (!org) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Organization not found')
    }

    return mapOrganization(org)
  }

  async updateOrganization(
    organizationId: string,
    data: { name?: string; primaryColor?: string; logoUrl?: string }
  ): Promise<Organization> {
    const org = await prisma.organization.update({
      where: { id: organizationId },
      data: {
        name: data.name,
        primaryColor: data.primaryColor,
        logoUrl: data.logoUrl,
      },
    })

    return mapOrganization(org)
  }

  async getOrganizationStats(organizationId: string): Promise<OrganizationStats> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        _count: {
          select: {
            streams: true,
            members: true,
            callRooms: true,
          },
        },
      },
    })

    if (!org) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Organization not found')
    }

    return {
      streamCount: org._count.streams,
      memberCount: org._count.members,
      callRoomCount: org._count.callRooms,
      maxStreams: org.maxStreams,
      maxUsers: org.maxUsers,
      maxCallRooms: org.maxCallRooms,
    }
  }

  // Member management
  async getMembers(organizationId: string): Promise<OrganizationMember[]> {
    const members = await prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { joinedAt: 'asc' },
    })

    return members.map(mapMember)
  }

  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: OrgMemberRole,
    requesterId: string
  ): Promise<OrganizationMember> {
    // Can't change your own role
    if (userId === requesterId) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'Cannot change your own role')
    }

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      include: { user: true },
    })

    if (!membership) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Member not found')
    }

    // Can't demote an owner unless there's another owner
    if (membership.role === OrgMemberRole.OWNER && role !== OrgMemberRole.OWNER) {
      const ownerCount = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: OrgMemberRole.OWNER,
        },
      })

      if (ownerCount <= 1) {
        throw new AppError(
          400,
          API_ERROR_CODES.VALIDATION_ERROR,
          'Cannot demote the last owner. Transfer ownership first.'
        )
      }
    }

    const updated = await prisma.organizationMember.update({
      where: { id: membership.id },
      data: { role },
      include: { user: true },
    })

    return mapMember(updated)
  }

  async removeMember(
    organizationId: string,
    userId: string,
    requesterId: string
  ): Promise<void> {
    // Can't remove yourself
    if (userId === requesterId) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'Cannot remove yourself')
    }

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
    })

    if (!membership) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Member not found')
    }

    // Can't remove an owner unless there's another owner
    if (membership.role === OrgMemberRole.OWNER) {
      const ownerCount = await prisma.organizationMember.count({
        where: {
          organizationId,
          role: OrgMemberRole.OWNER,
        },
      })

      if (ownerCount <= 1) {
        throw new AppError(
          400,
          API_ERROR_CODES.VALIDATION_ERROR,
          'Cannot remove the last owner. Transfer ownership first.'
        )
      }
    }

    await prisma.organizationMember.delete({
      where: { id: membership.id },
    })
  }

  // Invite management
  async createInvite(
    organizationId: string,
    createdById: string,
    data: CreateInviteRequest
  ): Promise<OrganizationInvite> {
    // Check if user is already a member
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      const existingMembership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId, userId: existingUser.id },
        },
      })

      if (existingMembership) {
        throw new AppError(409, API_ERROR_CODES.CONFLICT, 'User is already a member of this organization')
      }
    }

    // Check if there's already a pending invite
    const existingInvite = await prisma.organizationInvite.findFirst({
      where: {
        organizationId,
        email: data.email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    })

    if (existingInvite) {
      throw new AppError(409, API_ERROR_CODES.CONFLICT, 'An invite has already been sent to this email')
    }

    // Check member limit
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { _count: { select: { members: true } } },
    })

    if (!org) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Organization not found')
    }

    if (org._count.members >= org.maxUsers) {
      throw new AppError(
        400,
        API_ERROR_CODES.USER_LIMIT_REACHED,
        'Member limit reached for this organization'
      )
    }

    // Create invite with 7-day expiry
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const invite = await prisma.organizationInvite.create({
      data: {
        organizationId,
        email: data.email,
        role: data.role || OrgMemberRole.MEMBER,
        token: crypto.randomBytes(32).toString('hex'),
        createdById,
        expiresAt,
      },
    })

    return mapInvite(invite)
  }

  async getInvites(organizationId: string): Promise<OrganizationInvite[]> {
    const invites = await prisma.organizationInvite.findMany({
      where: {
        organizationId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    })

    return invites.map(mapInvite)
  }

  async getInviteByToken(token: string): Promise<OrganizationInvite & { organization: Organization }> {
    const invite = await prisma.organizationInvite.findUnique({
      where: { token },
      include: { organization: true },
    })

    if (!invite) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Invite not found')
    }

    if (invite.acceptedAt) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'Invite has already been accepted')
    }

    if (invite.expiresAt < new Date()) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'Invite has expired')
    }

    return {
      ...mapInvite(invite),
      organization: mapOrganization(invite.organization),
    }
  }

  async acceptInvite(token: string, userId: string): Promise<OrganizationMember> {
    const invite = await prisma.organizationInvite.findUnique({
      where: { token },
      include: { organization: true },
    })

    if (!invite) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Invite not found')
    }

    if (invite.acceptedAt) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'Invite has already been accepted')
    }

    if (invite.expiresAt < new Date()) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'Invite has expired')
    }

    // Check if already a member
    const existingMembership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: invite.organizationId, userId },
      },
    })

    if (existingMembership) {
      throw new AppError(409, API_ERROR_CODES.CONFLICT, 'You are already a member of this organization')
    }

    // Create membership and mark invite as accepted
    const [membership] = await prisma.$transaction([
      prisma.organizationMember.create({
        data: {
          organizationId: invite.organizationId,
          userId,
          role: invite.role,
        },
        include: { user: true },
      }),
      prisma.organizationInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      }),
    ])

    return mapMember(membership)
  }

  async revokeInvite(organizationId: string, inviteId: string): Promise<void> {
    const invite = await prisma.organizationInvite.findFirst({
      where: { id: inviteId, organizationId },
    })

    if (!invite) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Invite not found')
    }

    await prisma.organizationInvite.delete({ where: { id: inviteId } })
  }

  // Organization CRUD (for super admins or creating new orgs)
  async createOrganization(
    data: { name: string; slug?: string },
    ownerId: string
  ): Promise<Organization> {
    const slug = data.slug || generateSlug(data.name)

    // Check for duplicate slug
    const existing = await prisma.organization.findUnique({
      where: { slug },
    })

    if (existing) {
      throw new AppError(409, API_ERROR_CODES.CONFLICT, 'An organization with this slug already exists')
    }

    const org = await prisma.organization.create({
      data: {
        name: data.name,
        slug,
        members: {
          create: {
            userId: ownerId,
            role: OrgMemberRole.OWNER,
          },
        },
      },
    })

    return mapOrganization(org)
  }

  async deleteOrganization(organizationId: string): Promise<void> {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
    })

    if (!org) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Organization not found')
    }

    // Cascading delete will handle members, invites, streams, etc.
    await prisma.organization.delete({ where: { id: organizationId } })
  }

  // Legacy: Create user in organization (for admin panel)
  async createUserInOrganization(
    organizationId: string,
    data: { email: string; password: string; name: string },
    role: OrgMemberRole = OrgMemberRole.MEMBER
  ): Promise<User> {
    // Check member limit
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: { _count: { select: { members: true } } },
    })

    if (!org) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Organization not found')
    }

    if (org._count.members >= org.maxUsers) {
      throw new AppError(
        400,
        API_ERROR_CODES.USER_LIMIT_REACHED,
        'Member limit reached for this organization'
      )
    }

    // Check for duplicate email
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    })

    if (existingUser) {
      throw new AppError(409, API_ERROR_CODES.CONFLICT, 'A user with this email already exists')
    }

    const passwordHash = await bcrypt.hash(data.password, 12)

    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        name: data.name,
        globalRole: GlobalRole.USER,
        organizations: {
          create: {
            organizationId,
            role,
          },
        },
      },
    })

    return mapUser(user)
  }
}

export const organizationService = new OrganizationService()
