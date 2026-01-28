/**
 * NDI Bridge Routes
 *
 * REST API for NDI output management.
 *
 * Endpoints:
 * - GET /ndi-bridge/status - Get bridge status
 * - GET /ndi-bridge/outputs - List all NDI outputs
 * - GET /ndi-bridge/outputs/:id - Get specific output
 * - POST /ndi-bridge/outputs - Create new NDI output
 * - POST /ndi-bridge/outputs/:id/start - Start output
 * - POST /ndi-bridge/outputs/:id/stop - Stop output
 * - PUT /ndi-bridge/outputs/:id - Update output config
 * - DELETE /ndi-bridge/outputs/:id - Remove output
 * - GET /ndi-bridge/receivers - Discover NDI receivers
 * - GET /ndi-bridge/rooms/:roomId/outputs - Get outputs for room
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { ndiBridgeService } from '../services/ndiBridge.service.js'

const router: Router = Router()

// =============================================================================
// Bridge Status
// =============================================================================

/**
 * GET /ndi-bridge/status
 * Get NDI bridge status and availability
 */
router.get('/status', authenticate, async (_req: Request, res: Response) => {
  try {
    const status = ndiBridgeService.getStatus()

    res.json({
      ...status,
      message: status.available
        ? 'NDI Bridge is available and ready'
        : 'NDI Bridge companion app not found - outputs will be simulated',
    })
  } catch (error) {
    console.error('[NDIBridge] Status error:', error)
    res.status(500).json({
      error: 'Failed to get bridge status',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Output Management
// =============================================================================

const createOutputSchema = z.object({
  roomId: z.string(),
  participantId: z.string().optional(),
  type: z.enum(['audio', 'video', 'audio-video']).optional(),
  config: z.object({
    sourceName: z.string().optional(),
    groups: z.array(z.string()).optional(),
    frameRate: z.number().optional(),
    audioChannels: z.number().optional(),
    audioSampleRate: z.number().optional(),
    videoWidth: z.number().optional(),
    videoHeight: z.number().optional(),
    videoCodec: z.enum(['h264', 'hevc']).optional(),
    failoverSource: z.string().optional(),
    lowLatency: z.boolean().optional(),
  }).optional(),
})

/**
 * GET /ndi-bridge/outputs
 * List all NDI outputs
 */
router.get('/outputs', authenticate, async (_req: Request, res: Response) => {
  try {
    const outputs = ndiBridgeService.getAllOutputs()

    res.json({
      count: outputs.length,
      outputs,
    })
  } catch (error) {
    console.error('[NDIBridge] List outputs error:', error)
    res.status(500).json({
      error: 'Failed to list outputs',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /ndi-bridge/outputs/:id
 * Get specific NDI output
 */
router.get('/outputs/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const outputId = req.params.id as string
    const output = ndiBridgeService.getOutput(outputId)

    if (!output) {
      res.status(404).json({ error: 'Output not found' })
      return
    }

    res.json({ output })
  } catch (error) {
    console.error('[NDIBridge] Get output error:', error)
    res.status(500).json({
      error: 'Failed to get output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /ndi-bridge/outputs
 * Create a new NDI output
 */
router.post('/outputs', authenticate, async (req: Request, res: Response) => {
  try {
    const { roomId, participantId, type, config } = createOutputSchema.parse(req.body)

    const output = await ndiBridgeService.createOutput(roomId, config || {}, {
      participantId,
      type,
    })

    res.status(201).json({
      success: true,
      output,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[NDIBridge] Create output error:', error)
    res.status(500).json({
      error: 'Failed to create output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /ndi-bridge/outputs/:id/start
 * Start an NDI output
 */
router.post('/outputs/:id/start', authenticate, async (req: Request, res: Response) => {
  try {
    const outputId = req.params.id as string
    const { webrtcStreamUrl } = z.object({
      webrtcStreamUrl: z.string(),
    }).parse(req.body)

    await ndiBridgeService.startOutput(outputId, webrtcStreamUrl)

    const output = ndiBridgeService.getOutput(outputId)

    res.json({
      success: true,
      output,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[NDIBridge] Start output error:', error)
    res.status(500).json({
      error: 'Failed to start output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /ndi-bridge/outputs/:id/stop
 * Stop an NDI output
 */
router.post('/outputs/:id/stop', authenticate, async (req: Request, res: Response) => {
  try {
    const outputId = req.params.id as string

    await ndiBridgeService.stopOutput(outputId)

    const output = ndiBridgeService.getOutput(outputId)

    res.json({
      success: true,
      output,
    })
  } catch (error) {
    console.error('[NDIBridge] Stop output error:', error)
    res.status(500).json({
      error: 'Failed to stop output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * PUT /ndi-bridge/outputs/:id
 * Update an NDI output configuration
 */
router.put('/outputs/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const outputId = req.params.id as string
    const updateSchema = z.object({
      sourceName: z.string().optional(),
      groups: z.array(z.string()).optional(),
      frameRate: z.number().optional(),
      audioChannels: z.number().optional(),
      audioSampleRate: z.number().optional(),
      videoWidth: z.number().optional(),
      videoHeight: z.number().optional(),
      videoCodec: z.enum(['h264', 'hevc']).optional(),
      failoverSource: z.string().optional(),
      lowLatency: z.boolean().optional(),
    })

    const updates = updateSchema.parse(req.body)

    const output = await ndiBridgeService.updateOutput(outputId, updates)

    if (!output) {
      res.status(404).json({ error: 'Output not found' })
      return
    }

    res.json({
      success: true,
      output,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[NDIBridge] Update output error:', error)
    res.status(500).json({
      error: 'Failed to update output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * DELETE /ndi-bridge/outputs/:id
 * Remove an NDI output
 */
router.delete('/outputs/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const outputId = req.params.id as string

    const output = ndiBridgeService.getOutput(outputId)
    if (!output) {
      res.status(404).json({ error: 'Output not found' })
      return
    }

    await ndiBridgeService.removeOutput(outputId)

    res.json({
      success: true,
      outputId,
    })
  } catch (error) {
    console.error('[NDIBridge] Remove output error:', error)
    res.status(500).json({
      error: 'Failed to remove output',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Room-specific Routes
// =============================================================================

/**
 * GET /ndi-bridge/rooms/:roomId/outputs
 * Get all NDI outputs for a room
 */
router.get('/rooms/:roomId/outputs', authenticate, async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId as string
    const outputs = ndiBridgeService.getOutputsForRoom(roomId)

    res.json({
      roomId,
      count: outputs.length,
      outputs,
    })
  } catch (error) {
    console.error('[NDIBridge] Room outputs error:', error)
    res.status(500).json({
      error: 'Failed to get room outputs',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Receiver Discovery
// =============================================================================

/**
 * GET /ndi-bridge/receivers
 * Discover NDI receivers on the network
 */
router.get('/receivers', authenticate, async (_req: Request, res: Response) => {
  try {
    const receivers = await ndiBridgeService.discoverReceivers()

    res.json({
      count: receivers.length,
      receivers,
    })
  } catch (error) {
    console.error('[NDIBridge] Discover receivers error:', error)
    res.status(500).json({
      error: 'Failed to discover receivers',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
