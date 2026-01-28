import { Router, type Router as RouterType } from 'express'
import { organizationService } from '../services/organization.service.js'
import { authenticate } from '../middleware/auth.js'
import type { ApiResponse, OrganizationInvite, Organization, OrganizationMember } from '@streamvu/shared'

const router: RouterType = Router()

// Get invite details (public - no auth required)
router.get('/:token', async (req, res, next) => {
  try {
    const invite = await organizationService.getInviteByToken(req.params.token)

    const response: ApiResponse<OrganizationInvite & { organization: Organization }> = {
      success: true,
      data: invite,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Accept invite (requires auth - user must be logged in)
router.post('/:token/accept', authenticate, async (req, res, next) => {
  try {
    const membership = await organizationService.acceptInvite(req.params.token as string, req.user!.sub)

    const response: ApiResponse<OrganizationMember> = {
      success: true,
      data: membership,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

export default router
