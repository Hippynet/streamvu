import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { organizationService } from '../services/organization.service.js'
import { authenticate, requireOrgAdmin, requireOrgRole } from '../middleware/auth.js'
import type {
  ApiResponse,
  Organization,
  OrganizationStats,
  OrganizationMember,
  OrganizationInvite,
} from '@streamvu/shared'
import { OrgMemberRole } from '@streamvu/shared'

const router: RouterType = Router()

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  logoUrl: z.string().url().optional(),
})

const createInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']).optional(),
})

const updateMemberRoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
})

router.use(authenticate)

// Get current organization
router.get('/', async (req, res, next) => {
  try {
    const org = await organizationService.getOrganization(req.user!.organizationId)

    const response: ApiResponse<Organization> = {
      success: true,
      data: org,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Update current organization
router.put('/', requireOrgAdmin, async (req, res, next) => {
  try {
    const data = updateOrganizationSchema.parse(req.body)
    const org = await organizationService.updateOrganization(req.user!.organizationId, data)

    const response: ApiResponse<Organization> = {
      success: true,
      data: org,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get organization stats
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await organizationService.getOrganizationStats(req.user!.organizationId)

    const response: ApiResponse<OrganizationStats> = {
      success: true,
      data: stats,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// ============================================================================
// MEMBERS
// ============================================================================

// List members
router.get('/members', async (req, res, next) => {
  try {
    const members = await organizationService.getMembers(req.user!.organizationId)

    const response: ApiResponse<OrganizationMember[]> = {
      success: true,
      data: members,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Update member role
router.put(
  '/members/:userId',
  requireOrgRole(OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const { role } = updateMemberRoleSchema.parse(req.body)
      const member = await organizationService.updateMemberRole(
        req.user!.organizationId,
        req.params.userId as string,
        role as OrgMemberRole,
        req.user!.sub
      )

      const response: ApiResponse<OrganizationMember> = {
        success: true,
        data: member,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Remove member
router.delete('/members/:userId', requireOrgAdmin, async (req, res, next) => {
  try {
    await organizationService.removeMember(
      req.user!.organizationId,
      req.params.userId as string,
      req.user!.sub
    )

    const response: ApiResponse = {
      success: true,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// ============================================================================
// INVITES
// ============================================================================

// List pending invites
router.get('/invites', requireOrgAdmin, async (req, res, next) => {
  try {
    const invites = await organizationService.getInvites(req.user!.organizationId)

    const response: ApiResponse<OrganizationInvite[]> = {
      success: true,
      data: invites,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Create invite
router.post('/invites', requireOrgAdmin, async (req, res, next) => {
  try {
    const data = createInviteSchema.parse(req.body)
    const invite = await organizationService.createInvite(
      req.user!.organizationId,
      req.user!.sub,
      {
        email: data.email,
        role: data.role as OrgMemberRole | undefined,
      }
    )

    const response: ApiResponse<OrganizationInvite> = {
      success: true,
      data: invite,
    }
    res.status(201).json(response)
  } catch (error) {
    next(error)
  }
})

// Revoke invite
router.delete('/invites/:inviteId', requireOrgAdmin, async (req, res, next) => {
  try {
    await organizationService.revokeInvite(req.user!.organizationId, req.params.inviteId as string)

    const response: ApiResponse = {
      success: true,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

export default router
