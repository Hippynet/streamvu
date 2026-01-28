/**
 * Multi-Output Routes
 *
 * API endpoints for managing multiple simultaneous output destinations.
 */

import { Router, type Router as RouterType, type Request, type Response } from 'express'
import { z } from 'zod'
import {
  multiOutputService,
  type IcecastConfig,
  type SrtOutputConfig,
  type RecordingConfig,
} from '../services/multiOutput.service.js'
import { authenticate } from '../middleware/auth.js'

const router: RouterType = Router()

// Schemas for validation
const icecastConfigSchema = z.object({
  type: z.literal('icecast'),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  mountpoint: z.string().startsWith('/'),
  username: z.string().min(1),
  password: z.string().min(1),
  format: z.enum(['mp3', 'ogg', 'opus', 'aac']),
  bitrate: z.number().int().min(32).max(320),
  sampleRate: z.number().int().min(8000).max(48000),
  channels: z.number().int().min(1).max(2),
  icePublic: z.boolean().optional(),
  iceName: z.string().optional(),
  iceDescription: z.string().optional(),
  iceUrl: z.string().url().optional(),
  iceGenre: z.string().optional(),
})

const srtOutputConfigSchema = z.object({
  type: z.literal('srt'),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  streamId: z.string().optional(),
  passphrase: z.string().min(10).max(79).optional(),
  latency: z.number().int().min(20).max(8000).default(200),
  mode: z.literal('caller'),
  codec: z.enum(['opus', 'aac', 'pcm']),
  bitrate: z.number().int().min(32).max(320),
  sampleRate: z.number().int().min(8000).max(48000),
  channels: z.number().int().min(1).max(2),
})

const recordingConfigSchema = z.object({
  type: z.literal('recording'),
  outputDir: z.string().optional(),
  filename: z.string().optional(),
  format: z.enum(['wav', 'mp3', 'flac', 'ogg']),
  bitrate: z.number().int().min(32).max(320).optional(),
  sampleRate: z.number().int().min(8000).max(48000),
  channels: z.number().int().min(1).max(2),
  maxDuration: z.number().int().min(60).optional(), // Min 1 minute
  splitEvery: z.number().int().min(60).optional(), // Min 1 minute segments
})

const addOutputSchema = z.object({
  roomId: z.string().uuid(),
  name: z.string().min(1).max(100),
  config: z.discriminatedUnion('type', [
    icecastConfigSchema,
    srtOutputConfigSchema,
    recordingConfigSchema,
  ]),
})

const updateOutputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

/**
 * GET /multi-output/:roomId
 * Get all outputs for a room
 */
router.get('/:roomId', authenticate, async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId as string
    const outputs = multiOutputService.getOutputsForRoom(roomId)

    res.json({ outputs })
  } catch (error) {
    console.error('[MultiOutput] Get outputs error:', error)
    res.status(500).json({
      error: 'Failed to get outputs',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /multi-output
 * Add a new output destination
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const validated = addOutputSchema.parse(req.body)
    const { roomId, name, config } = validated

    const output = await multiOutputService.addOutput(
      roomId,
      config as IcecastConfig | SrtOutputConfig | RecordingConfig,
      name
    )

    res.status(201).json({ output })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[MultiOutput] Add output error:', error)
    res.status(500).json({
      error: 'Failed to add output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * PATCH /multi-output/:outputId
 * Update an output configuration
 */
router.patch('/:outputId', authenticate, async (req: Request, res: Response) => {
  try {
    const outputId = req.params.outputId as string
    const validated = updateOutputSchema.parse(req.body)

    const output = await multiOutputService.updateOutput(outputId, validated)

    if (!output) {
      res.status(404).json({ error: 'Output not found' })
      return
    }

    res.json({ output })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[MultiOutput] Update output error:', error)
    res.status(500).json({
      error: 'Failed to update output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * DELETE /multi-output/:outputId
 * Remove an output destination
 */
router.delete('/:outputId', authenticate, async (req: Request, res: Response) => {
  try {
    const outputId = req.params.outputId as string

    const output = multiOutputService.getOutput(outputId)
    if (!output) {
      res.status(404).json({ error: 'Output not found' })
      return
    }

    await multiOutputService.removeOutput(outputId)

    res.json({ success: true })
  } catch (error) {
    console.error('[MultiOutput] Remove output error:', error)
    res.status(500).json({
      error: 'Failed to remove output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /multi-output/:outputId/start
 * Start streaming to an output
 */
router.post('/:outputId/start', authenticate, async (req: Request, res: Response) => {
  try {
    const outputId = req.params.outputId as string
    const { inputSource } = req.body

    if (!inputSource) {
      res.status(400).json({ error: 'inputSource is required' })
      return
    }

    const output = multiOutputService.getOutput(outputId)
    if (!output) {
      res.status(404).json({ error: 'Output not found' })
      return
    }

    await multiOutputService.startOutput(outputId, inputSource)

    res.json({ success: true, output: multiOutputService.getOutput(outputId) })
  } catch (error) {
    console.error('[MultiOutput] Start output error:', error)
    res.status(500).json({
      error: 'Failed to start output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /multi-output/:outputId/stop
 * Stop an output
 */
router.post('/:outputId/stop', authenticate, async (req: Request, res: Response) => {
  try {
    const outputId = req.params.outputId as string

    const output = multiOutputService.getOutput(outputId)
    if (!output) {
      res.status(404).json({ error: 'Output not found' })
      return
    }

    await multiOutputService.stopOutput(outputId)

    res.json({ success: true, output: multiOutputService.getOutput(outputId) })
  } catch (error) {
    console.error('[MultiOutput] Stop output error:', error)
    res.status(500).json({
      error: 'Failed to stop output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /multi-output/:outputId/status
 * Get detailed status of an output
 */
router.get('/:outputId/status', authenticate, async (req: Request, res: Response) => {
  try {
    const outputId = req.params.outputId as string

    const output = multiOutputService.getOutput(outputId)
    if (!output) {
      res.status(404).json({ error: 'Output not found' })
      return
    }

    res.json({
      id: output.id,
      name: output.name,
      type: output.type,
      status: output.status,
      error: output.error,
      stats: output.stats,
    })
  } catch (error) {
    console.error('[MultiOutput] Get output status error:', error)
    res.status(500).json({
      error: 'Failed to get output status',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
