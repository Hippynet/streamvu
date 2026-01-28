import type { ErrorRequestHandler } from 'express'
import { API_ERROR_CODES, type ApiResponse } from '@streamvu/shared'
import { ZodError } from 'zod'
import { config } from '../config/index.js'

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('Error:', err)

  if (err instanceof AppError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    }
    res.status(err.statusCode).json(response)
    return
  }

  if (err instanceof ZodError) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: API_ERROR_CODES.VALIDATION_ERROR,
        message: 'Validation failed',
        details: { errors: err.errors },
      },
    }
    res.status(400).json(response)
    return
  }

  const response: ApiResponse = {
    success: false,
    error: {
      code: API_ERROR_CODES.INTERNAL_ERROR,
      message: config.nodeEnv === 'production' ? 'Internal server error' : err.message,
    },
  }
  res.status(500).json(response)
}
