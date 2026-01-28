import rateLimit from 'express-rate-limit'
import { API_ERROR_CODES, type ApiResponse } from '@streamvu/shared'

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV === 'development'

// Rate limit configuration (much higher limits in development)
const RATE_LIMIT_CONFIG = {
  general: {
    windowMs: isDevelopment ? 1 * 60 * 1000 : 15 * 60 * 1000, // 1 min dev, 15 min prod
    max: isDevelopment ? 1000 : 100, // 1000/min dev, 100/15min prod
  },
  auth: {
    windowMs: isDevelopment ? 1 * 60 * 1000 : 15 * 60 * 1000, // 1 min dev, 15 min prod
    max: isDevelopment ? 100 : 10, // 100/min dev, 10/15min prod
  },
}

// Skip rate limiting entirely if DISABLE_RATE_LIMIT is set
const skipRateLimit = process.env.DISABLE_RATE_LIMIT === 'true'

export const generalLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.general.windowMs,
  max: RATE_LIMIT_CONFIG.general.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skipRateLimit,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: API_ERROR_CODES.RATE_LIMITED,
        message: 'Too many requests, please try again later',
      },
    }
    res.status(429).json(response)
  },
})

export const authLimiter = rateLimit({
  windowMs: RATE_LIMIT_CONFIG.auth.windowMs,
  max: RATE_LIMIT_CONFIG.auth.max,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => skipRateLimit,
  handler: (_req, res) => {
    const response: ApiResponse = {
      success: false,
      error: {
        code: API_ERROR_CODES.RATE_LIMITED,
        message: 'Too many authentication attempts, please try again later',
      },
    }
    res.status(429).json(response)
  },
})
