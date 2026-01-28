import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { authService } from '../services/auth.service.js'
import { authenticate } from '../middleware/auth.js'
import { authLimiter } from '../middleware/rateLimit.js'
import type {
  ApiResponse,
  LoginResponse,
  GoogleAuthResponse,
  RefreshTokenResponse,
  AuthTokens,
  User,
} from '@streamvu/shared'

const router: RouterType = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

const googleAuthSchema = z.object({
  idToken: z.string().min(1),
})

const switchOrgSchema = z.object({
  organizationId: z.string().min(1),
})

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body)
    const result = await authService.login(email, password)

    const response: ApiResponse<LoginResponse> = {
      success: true,
      data: result,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body)
    const tokens = await authService.refreshTokens(refreshToken)

    const response: ApiResponse<RefreshTokenResponse> = {
      success: true,
      data: tokens,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body)
    await authService.logout(refreshToken)

    const response: ApiResponse = {
      success: true,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Google OAuth - exchange ID token for session
router.post('/google/token', authLimiter, async (req, res, next) => {
  try {
    const { idToken } = googleAuthSchema.parse(req.body)
    const result = await authService.googleAuth(idToken)

    const response: ApiResponse<GoogleAuthResponse> = {
      success: true,
      data: result,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await authService.getCurrentUser(req.user!.sub)

    const response: ApiResponse<User> = {
      success: true,
      data: user,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Switch organization context - returns new tokens
router.post('/switch-organization', authenticate, async (req, res, next) => {
  try {
    const { organizationId } = switchOrgSchema.parse(req.body)
    const tokens = await authService.switchOrganization(req.user!.sub, organizationId)

    const response: ApiResponse<AuthTokens> = {
      success: true,
      data: tokens,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

export default router
