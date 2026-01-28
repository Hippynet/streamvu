import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { adminService } from '../services/admin.service.js'
import { authenticate, requireSuperAdmin } from '../middleware/auth.js'
import type {
  ApiResponse,
  Organization,
  OrganizationWithRelations,
  PaginatedResponse,
} from '@streamvu/shared'

const router: RouterType = Router()

const createOrganizationSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  maxStreams: z.number().int().positive().optional(),
  maxUsers: z.number().int().positive().optional(),
  maxCallRooms: z.number().int().positive().optional(),
  apiEnabled: z.boolean().optional(),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(128),
  adminName: z.string().min(1).max(100),
})

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  maxStreams: z.number().int().positive().optional(),
  maxUsers: z.number().int().positive().optional(),
  maxCallRooms: z.number().int().positive().optional(),
  apiEnabled: z.boolean().optional(),
  suspended: z.boolean().optional(),
})

router.use(authenticate, requireSuperAdmin)

// List all organizations (paginated)
router.get('/organizations', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const pageSize = parseInt(req.query.pageSize as string) || 20

    const result = await adminService.listOrganizations(page, pageSize)

    const response: ApiResponse<PaginatedResponse<Organization>> = {
      success: true,
      data: result,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get single organization with relations
router.get('/organizations/:id', async (req, res, next) => {
  try {
    const org = await adminService.getOrganization(req.params.id)

    const response: ApiResponse<OrganizationWithRelations> = {
      success: true,
      data: org,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Create new organization with owner
router.post('/organizations', async (req, res, next) => {
  try {
    const data = createOrganizationSchema.parse(req.body)
    const org = await adminService.createOrganization(data)

    const response: ApiResponse<Organization> = {
      success: true,
      data: org,
    }
    res.status(201).json(response)
  } catch (error) {
    next(error)
  }
})

// Update organization
router.put('/organizations/:id', async (req, res, next) => {
  try {
    const data = updateOrganizationSchema.parse(req.body)
    const org = await adminService.updateOrganization(req.params.id, data)

    const response: ApiResponse<Organization> = {
      success: true,
      data: org,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Delete organization
router.delete('/organizations/:id', async (req, res, next) => {
  try {
    await adminService.deleteOrganization(req.params.id)

    const response: ApiResponse = {
      success: true,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Suspend/unsuspend organization
router.post('/organizations/:id/suspend', async (req, res, next) => {
  try {
    const org = await adminService.suspendOrganization(req.params.id, true)

    const response: ApiResponse<Organization> = {
      success: true,
      data: org,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

router.post('/organizations/:id/unsuspend', async (req, res, next) => {
  try {
    const org = await adminService.suspendOrganization(req.params.id, false)

    const response: ApiResponse<Organization> = {
      success: true,
      data: org,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

export default router
