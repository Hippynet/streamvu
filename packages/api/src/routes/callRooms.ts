import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { callRoomService } from '../services/callRoom.service.js'
import { authenticate, requireOrgRole } from '../middleware/auth.js'
import { RoomVisibility, OrgMemberRole } from '@streamvu/shared'
import type {
  ApiResponse,
  CallRoom,
  CallRoomWithParticipants,
} from '@streamvu/shared'

const router: RouterType = Router()

const createRoomSchema = z.object({
  name: z.string().min(1).max(100),
  visibility: z.nativeEnum(RoomVisibility).optional(),
  accessCode: z.string().min(4).max(10).optional(),
  maxParticipants: z.number().min(2).max(50).optional(),
  recordingEnabled: z.boolean().optional(),
  waitingRoom: z.boolean().optional(),
})

const updateRoomSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  visibility: z.nativeEnum(RoomVisibility).optional(),
  accessCode: z.string().min(4).max(10).optional(),
  maxParticipants: z.number().min(2).max(50).optional(),
  recordingEnabled: z.boolean().optional(),
  waitingRoom: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

// List all rooms for the current organization
router.get('/', authenticate, async (req, res, next) => {
  try {
    const rooms = await callRoomService.listRooms(req.user!.organizationId)

    const response: ApiResponse<CallRoomWithParticipants[]> = {
      success: true,
      data: rooms,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get a specific room
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const room = await callRoomService.getRoom(
      req.params.id as string,
      req.user!.organizationId
    )

    const response: ApiResponse<CallRoomWithParticipants> = {
      success: true,
      data: room,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get room by invite token (public endpoint, no org check)
router.get('/join/:inviteToken', async (req, res, next) => {
  try {
    const room = await callRoomService.getRoomByInviteToken(req.params.inviteToken as string)

    // Don't expose access code in public response
    const publicRoom = {
      ...room,
      accessCode: room.accessCode ? '****' : null, // Mask the code
    }

    const response: ApiResponse<CallRoomWithParticipants> = {
      success: true,
      data: publicRoom,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Create a new room (requires ADMIN or OWNER)
router.post(
  '/',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const data = createRoomSchema.parse(req.body)
      const room = await callRoomService.createRoom(
        req.user!.organizationId,
        req.user!.sub,
        data
      )

      const response: ApiResponse<CallRoom> = {
        success: true,
        data: room,
      }
      res.status(201).json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Update a room (requires ADMIN or OWNER)
router.put(
  '/:id',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const data = updateRoomSchema.parse(req.body)
      const room = await callRoomService.updateRoom(
        req.params.id as string,
        req.user!.organizationId,
        data
      )

      const response: ApiResponse<CallRoom> = {
        success: true,
        data: room,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Delete a room (requires ADMIN or OWNER)
router.delete(
  '/:id',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      await callRoomService.deleteRoom(req.params.id as string, req.user!.organizationId)

      const response: ApiResponse = {
        success: true,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Close a room (end the session, disconnect all participants)
router.post(
  '/:id/close',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const room = await callRoomService.closeRoom(
        req.params.id as string,
        req.user!.organizationId
      )

      const response: ApiResponse<CallRoom> = {
        success: true,
        data: room,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Regenerate invite token for a public room
router.post(
  '/:id/regenerate-token',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const room = await callRoomService.regenerateInviteToken(
        req.params.id as string,
        req.user!.organizationId
      )

      const response: ApiResponse<CallRoom> = {
        success: true,
        data: room,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Kick a participant from a room (requires ADMIN or OWNER)
router.post(
  '/:id/kick/:participantId',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      await callRoomService.kickParticipant(
        req.params.id as string,
        req.params.participantId as string,
        req.user!.organizationId
      )

      const response: ApiResponse = {
        success: true,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Admit a participant from the waiting room (requires ADMIN or OWNER)
router.post(
  '/:id/admit/:participantId',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      await callRoomService.admitParticipant(
        req.params.id as string,
        req.params.participantId as string,
        req.user!.organizationId
      )

      const response: ApiResponse = {
        success: true,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Get waiting room participants (requires ADMIN or OWNER)
router.get(
  '/:id/waiting',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const waiting = await callRoomService.getWaitingParticipants(
        req.params.id as string,
        req.user!.organizationId
      )

      const response: ApiResponse<typeof waiting> = {
        success: true,
        data: waiting,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

export default router
