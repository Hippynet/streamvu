import { randomBytes } from 'crypto'
import { prisma } from '../lib/prisma.js'
import { AppError } from '../middleware/errorHandler.js'
import {
  API_ERROR_CODES,
  type CallRoom,
  type CallRoomWithParticipants,
  type CreateRoomRequest,
  type UpdateRoomRequest,
  RoomVisibility,
  RoomType,
  ParticipantRole,
} from '@streamvu/shared'

function mapRoom(room: {
  id: string
  name: string
  visibility: string
  accessCode: string | null
  inviteToken: string | null
  isActive: boolean
  maxParticipants: number
  type?: string
  parentId?: string | null
  queuePosition?: number
  returnFeedUrl?: string | null
  organizationId: string
  createdById: string
  recordingEnabled: boolean
  waitingRoom: boolean
  createdAt: Date
  updatedAt: Date
  closedAt: Date | null
}): CallRoom {
  return {
    id: room.id,
    name: room.name,
    visibility: room.visibility as RoomVisibility,
    accessCode: room.accessCode,
    inviteToken: room.inviteToken,
    isActive: room.isActive,
    maxParticipants: room.maxParticipants,
    type: (room.type as RoomType) || RoomType.LIVE_ROOM,
    parentId: room.parentId ?? null,
    queuePosition: room.queuePosition ?? 0,
    returnFeedUrl: room.returnFeedUrl ?? null,
    organizationId: room.organizationId,
    createdById: room.createdById,
    recordingEnabled: room.recordingEnabled,
    waitingRoom: room.waitingRoom,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
    closedAt: room.closedAt?.toISOString() ?? null,
  }
}

function mapRoomWithParticipants(
  room: Parameters<typeof mapRoom>[0] & {
    participants: Array<{
      id: string
      roomId: string
      userId: string | null
      displayName: string
      role: string
      isConnected: boolean
      isSpeaking: boolean
      isMuted: boolean
      connectionQuality: string
      isInWaitingRoom: boolean
      joinedAt: Date
      leftAt: Date | null
      user?: {
        id: string
        email: string
        name: string
        avatarUrl: string | null
        globalRole: string
        createdAt: Date
        updatedAt: Date
        lastLoginAt: Date | null
      } | null
    }>
    _count?: { participants: number }
  }
): CallRoomWithParticipants {
  return {
    ...mapRoom(room),
    participants: room.participants.map((p) => ({
      id: p.id,
      roomId: p.roomId,
      userId: p.userId,
      displayName: p.displayName,
      role: p.role as ParticipantRole,
      isConnected: p.isConnected,
      isSpeaking: p.isSpeaking,
      isMuted: p.isMuted,
      connectionQuality: p.connectionQuality as never,
      isInWaitingRoom: p.isInWaitingRoom,
      joinedAt: p.joinedAt.toISOString(),
      leftAt: p.leftAt?.toISOString() ?? null,
      user: p.user
        ? {
            id: p.user.id,
            email: p.user.email,
            name: p.user.name,
            avatarUrl: p.user.avatarUrl,
            globalRole: p.user.globalRole as never,
            createdAt: p.user.createdAt.toISOString(),
            updatedAt: p.user.updatedAt.toISOString(),
            lastLoginAt: p.user.lastLoginAt?.toISOString() ?? null,
          }
        : undefined,
    })),
    participantCount: room._count?.participants ?? room.participants.length,
  }
}

function generateInviteToken(): string {
  return randomBytes(16).toString('hex')
}

function generateAccessCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString()
}

class CallRoomService {
  async listRooms(organizationId: string): Promise<CallRoomWithParticipants[]> {
    const rooms = await prisma.callRoom.findMany({
      where: { organizationId },
      include: {
        participants: {
          where: { isConnected: true },
          include: { user: true },
        },
        _count: { select: { participants: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    return rooms.map(mapRoomWithParticipants)
  }

  async getRoom(roomId: string, organizationId?: string): Promise<CallRoomWithParticipants> {
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { isConnected: true },
          include: { user: true },
        },
        _count: { select: { participants: true } },
      },
    })

    if (!room) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Room not found')
    }

    // If organizationId provided, verify room belongs to org (for private rooms)
    if (organizationId && room.organizationId !== organizationId) {
      if (room.visibility === 'PRIVATE') {
        throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Access denied to this room')
      }
    }

    return mapRoomWithParticipants(room)
  }

  async getRoomByInviteToken(inviteToken: string): Promise<CallRoomWithParticipants> {
    const room = await prisma.callRoom.findUnique({
      where: { inviteToken },
      include: {
        participants: {
          where: { isConnected: true },
          include: { user: true },
        },
        _count: { select: { participants: true } },
      },
    })

    if (!room) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Room not found or invite link is invalid')
    }

    if (!room.isActive) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'This room is no longer active')
    }

    return mapRoomWithParticipants(room)
  }

  async createRoom(
    organizationId: string,
    userId: string,
    data: CreateRoomRequest
  ): Promise<CallRoom> {
    // Check room limit
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { maxCallRooms: true, _count: { select: { callRooms: true } } },
    })

    if (!org) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Organization not found')
    }

    if (org._count.callRooms >= org.maxCallRooms) {
      throw new AppError(
        400,
        API_ERROR_CODES.VALIDATION_ERROR,
        `Room limit reached (${org.maxCallRooms})`
      )
    }

    const visibility = data.visibility || RoomVisibility.PRIVATE
    const isPublic = visibility === RoomVisibility.PUBLIC

    const room = await prisma.callRoom.create({
      data: {
        name: data.name,
        visibility,
        accessCode: isPublic ? (data.accessCode || generateAccessCode()) : null,
        inviteToken: isPublic ? generateInviteToken() : null,
        maxParticipants: data.maxParticipants || 8,
        recordingEnabled: data.recordingEnabled || false,
        waitingRoom: data.waitingRoom || false,
        organizationId,
        createdById: userId,
      },
    })

    return mapRoom(room)
  }

  async updateRoom(
    roomId: string,
    organizationId: string,
    data: UpdateRoomRequest
  ): Promise<CallRoom> {
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
    })

    if (!room) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Room not found')
    }

    if (room.organizationId !== organizationId) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Access denied')
    }

    // Handle visibility change
    const newVisibility = data.visibility || room.visibility
    const wasPublic = room.visibility === 'PUBLIC'
    const isPublic = newVisibility === 'PUBLIC'

    const updateData: Record<string, unknown> = { ...data }

    // Generate tokens/codes when switching to public
    if (!wasPublic && isPublic) {
      updateData.inviteToken = generateInviteToken()
      updateData.accessCode = data.accessCode || generateAccessCode()
    }

    // Clear tokens/codes when switching to private
    if (wasPublic && !isPublic) {
      updateData.inviteToken = null
      updateData.accessCode = null
    }

    const updated = await prisma.callRoom.update({
      where: { id: roomId },
      data: updateData,
    })

    return mapRoom(updated)
  }

  async deleteRoom(roomId: string, organizationId: string): Promise<void> {
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
    })

    if (!room) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Room not found')
    }

    if (room.organizationId !== organizationId) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Access denied')
    }

    await prisma.callRoom.delete({
      where: { id: roomId },
    })
  }

  async closeRoom(roomId: string, organizationId: string): Promise<CallRoom> {
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
    })

    if (!room) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Room not found')
    }

    if (room.organizationId !== organizationId) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Access denied')
    }

    // Mark all participants as disconnected
    await prisma.roomParticipant.updateMany({
      where: { roomId, isConnected: true },
      data: { isConnected: false, leftAt: new Date() },
    })

    const updated = await prisma.callRoom.update({
      where: { id: roomId },
      data: { isActive: false, closedAt: new Date() },
    })

    return mapRoom(updated)
  }

  async regenerateInviteToken(roomId: string, organizationId: string): Promise<CallRoom> {
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
    })

    if (!room) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Room not found')
    }

    if (room.organizationId !== organizationId) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Access denied')
    }

    if (room.visibility !== 'PUBLIC') {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'Only public rooms have invite tokens')
    }

    const updated = await prisma.callRoom.update({
      where: { id: roomId },
      data: { inviteToken: generateInviteToken() },
    })

    return mapRoom(updated)
  }

  async kickParticipant(roomId: string, participantId: string, organizationId: string): Promise<void> {
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
    })

    if (!room) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Room not found')
    }

    if (room.organizationId !== organizationId) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Access denied')
    }

    const participant = await prisma.roomParticipant.findUnique({
      where: { id: participantId },
    })

    if (!participant || participant.roomId !== roomId) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Participant not found in this room')
    }

    // Mark as disconnected
    await prisma.roomParticipant.update({
      where: { id: participantId },
      data: {
        isConnected: false,
        leftAt: new Date(),
      },
    })
  }

  async admitParticipant(roomId: string, participantId: string, organizationId: string): Promise<void> {
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
    })

    if (!room) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Room not found')
    }

    if (room.organizationId !== organizationId) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Access denied')
    }

    const participant = await prisma.roomParticipant.findUnique({
      where: { id: participantId },
    })

    if (!participant || participant.roomId !== roomId) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Participant not found in this room')
    }

    if (!participant.isInWaitingRoom) {
      throw new AppError(400, API_ERROR_CODES.VALIDATION_ERROR, 'Participant is not in waiting room')
    }

    // Admit the participant from waiting room
    await prisma.roomParticipant.update({
      where: { id: participantId },
      data: {
        isInWaitingRoom: false,
      },
    })
  }

  async getWaitingParticipants(roomId: string, organizationId: string): Promise<Array<{ id: string; displayName: string; joinedAt: Date }>> {
    const room = await prisma.callRoom.findUnique({
      where: { id: roomId },
    })

    if (!room) {
      throw new AppError(404, API_ERROR_CODES.NOT_FOUND, 'Room not found')
    }

    if (room.organizationId !== organizationId) {
      throw new AppError(403, API_ERROR_CODES.FORBIDDEN, 'Access denied')
    }

    const waiting = await prisma.roomParticipant.findMany({
      where: {
        roomId,
        isInWaitingRoom: true,
        isConnected: true,
      },
      select: {
        id: true,
        displayName: true,
        joinedAt: true,
      },
      orderBy: { joinedAt: 'asc' },
    })

    return waiting
  }
}

export const callRoomService = new CallRoomService()
