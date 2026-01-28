import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { userService } from '../services/user.service.js'
import { authenticate } from '../middleware/auth.js'
import type { ApiResponse, User } from '@streamvu/shared'

const router: RouterType = Router()

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})

router.use(authenticate)

router.get('/me', async (req, res, next) => {
  try {
    const user = await userService.getUser(req.user!.sub)

    const response: ApiResponse<User> = {
      success: true,
      data: user,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

router.put('/me', async (req, res, next) => {
  try {
    const data = updateProfileSchema.parse(req.body)
    const user = await userService.updateProfile(req.user!.sub, data)

    const response: ApiResponse<User> = {
      success: true,
      data: user,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

router.post('/me/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)
    await userService.changePassword(req.user!.sub, currentPassword, newPassword)

    const response: ApiResponse = {
      success: true,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get user's organizations
router.get('/me/organizations', async (req, res, next) => {
  try {
    const organizations = await userService.getUserOrganizations(req.user!.sub)

    const response: ApiResponse<typeof organizations> = {
      success: true,
      data: organizations,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

export default router
