import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { streamService } from '../services/stream.service.js'
import { authenticate } from '../middleware/auth.js'
import type { ApiResponse, Stream, StreamWithHealth, StreamHealthCheck } from '@streamvu/shared'

const router: RouterType = Router()

const createStreamSchema = z.object({
  name: z.string().min(1).max(100),
  url: z.string().url(),
  mountPoint: z.string().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
})

const updateStreamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url().optional(),
  mountPoint: z.string().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isVisible: z.boolean().optional(),
})

router.use(authenticate)

router.get('/', async (req, res, next) => {
  try {
    const streams = await streamService.getStreams(req.user!.organizationId)

    const response: ApiResponse<StreamWithHealth[]> = {
      success: true,
      data: streams,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const data = createStreamSchema.parse(req.body)
    const stream = await streamService.createStream(req.user!.organizationId, data)

    const response: ApiResponse<Stream> = {
      success: true,
      data: stream,
    }
    res.status(201).json(response)
  } catch (error) {
    next(error)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const stream = await streamService.getStream(req.params.id, req.user!.organizationId)

    const response: ApiResponse<StreamWithHealth> = {
      success: true,
      data: stream,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const data = updateStreamSchema.parse(req.body)
    const stream = await streamService.updateStream(req.params.id, req.user!.organizationId, data)

    const response: ApiResponse<Stream> = {
      success: true,
      data: stream,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    await streamService.deleteStream(req.params.id, req.user!.organizationId)

    const response: ApiResponse = {
      success: true,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

router.get('/:id/health', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100
    const health = await streamService.getStreamHealth(req.params.id, req.user!.organizationId, limit)

    const response: ApiResponse<StreamHealthCheck[]> = {
      success: true,
      data: health,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

export default router
