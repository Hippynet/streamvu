/**
 * Gateway Routes
 *
 * REST API for protocol gateway management.
 *
 * Endpoints:
 * - GET /gateway - List all gateways
 * - GET /gateway/:id - Get specific gateway
 * - POST /gateway - Create new gateway
 * - POST /gateway/:id/start - Start gateway
 * - POST /gateway/:id/stop - Stop gateway
 * - PUT /gateway/:id - Update gateway config
 * - DELETE /gateway/:id - Remove gateway
 * - POST /gateway/srt-to-ndi - Quick create SRT to NDI gateway
 * - POST /gateway/srt-fanout - Quick create SRT fanout
 * - POST /gateway/srt-relay - Quick create SRT relay
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { gatewayService } from '../services/gateway.service.js'

const router: Router = Router()

// =============================================================================
// Gateway Management
// =============================================================================

/**
 * GET /gateway
 * List all gateways
 */
router.get('/', authenticate, async (_req: Request, res: Response) => {
  try {
    const gateways = gatewayService.getAllGateways()

    res.json({
      count: gateways.length,
      gateways,
    })
  } catch (error) {
    console.error('[Gateway] List error:', error)
    res.status(500).json({
      error: 'Failed to list gateways',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /gateway/:id
 * Get specific gateway
 */
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const gatewayId = req.params.id as string
    const gateway = gatewayService.getGateway(gatewayId)

    if (!gateway) {
      res.status(404).json({ error: 'Gateway not found' })
      return
    }

    res.json({ gateway })
  } catch (error) {
    console.error('[Gateway] Get error:', error)
    res.status(500).json({
      error: 'Failed to get gateway',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

const inputSchema = z.object({
  protocol: z.enum(['srt', 'ndi', 'webrtc', 'rtmp', 'whep']),
  srtHost: z.string().optional(),
  srtPort: z.number().optional(),
  srtMode: z.enum(['listener', 'caller']).optional(),
  srtStreamId: z.string().optional(),
  srtPassphrase: z.string().optional(),
  srtLatency: z.number().optional(),
  ndiSourceName: z.string().optional(),
  ndiGroups: z.array(z.string()).optional(),
  whepUrl: z.string().optional(),
  rtmpUrl: z.string().optional(),
})

const outputSchema = z.object({
  id: z.string().optional(),
  protocol: z.enum(['srt', 'ndi', 'rtmp', 'icecast']),
  enabled: z.boolean().optional(),
  srtHost: z.string().optional(),
  srtPort: z.number().optional(),
  srtMode: z.enum(['listener', 'caller']).optional(),
  srtStreamId: z.string().optional(),
  srtPassphrase: z.string().optional(),
  srtLatency: z.number().optional(),
  ndiSourceName: z.string().optional(),
  ndiGroups: z.array(z.string()).optional(),
  rtmpUrl: z.string().optional(),
  icecastUrl: z.string().optional(),
  icecastMount: z.string().optional(),
})

const createGatewaySchema = z.object({
  type: z.enum(['srt-to-ndi', 'ndi-to-srt', 'webrtc-to-srt', 'srt-to-srt', 'srt-fanout']),
  name: z.string(),
  input: inputSchema,
  outputs: z.array(outputSchema),
  qualityAdaptation: z.object({
    enabled: z.boolean(),
    minBitrate: z.number(),
    maxBitrate: z.number(),
    targetLatency: z.number(),
    adaptiveFrameRate: z.boolean(),
  }).optional(),
})

/**
 * POST /gateway
 * Create a new gateway
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  try {
    const config = createGatewaySchema.parse(req.body)

    // Add IDs to outputs if not provided
    const outputsWithIds = config.outputs.map((out) => ({
      ...out,
      id: out.id || crypto.randomUUID(),
      enabled: out.enabled ?? true,
    }))

    const gateway = await gatewayService.createGateway({
      ...config,
      outputs: outputsWithIds,
    })

    res.status(201).json({
      success: true,
      gateway,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Gateway] Create error:', error)
    res.status(500).json({
      error: 'Failed to create gateway',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /gateway/:id/start
 * Start a gateway
 */
router.post('/:id/start', authenticate, async (req: Request, res: Response) => {
  try {
    const gatewayId = req.params.id as string

    await gatewayService.startGateway(gatewayId)

    const gateway = gatewayService.getGateway(gatewayId)

    res.json({
      success: true,
      gateway,
    })
  } catch (error) {
    console.error('[Gateway] Start error:', error)
    res.status(500).json({
      error: 'Failed to start gateway',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /gateway/:id/stop
 * Stop a gateway
 */
router.post('/:id/stop', authenticate, async (req: Request, res: Response) => {
  try {
    const gatewayId = req.params.id as string

    await gatewayService.stopGateway(gatewayId)

    const gateway = gatewayService.getGateway(gatewayId)

    res.json({
      success: true,
      gateway,
    })
  } catch (error) {
    console.error('[Gateway] Stop error:', error)
    res.status(500).json({
      error: 'Failed to stop gateway',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * PUT /gateway/:id
 * Update a gateway configuration
 */
router.put('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const gatewayId = req.params.id as string
    const rawUpdates = createGatewaySchema.partial().parse(req.body)

    // Ensure outputs have IDs if provided
    const updates = {
      ...rawUpdates,
      outputs: rawUpdates.outputs?.map((out) => ({
        ...out,
        id: out.id || crypto.randomUUID(),
        enabled: out.enabled ?? true,
      })),
    }

    const gateway = await gatewayService.updateGateway(gatewayId, updates as Partial<import('../services/gateway.service.js').GatewayConfig>)

    if (!gateway) {
      res.status(404).json({ error: 'Gateway not found' })
      return
    }

    res.json({
      success: true,
      gateway,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Gateway] Update error:', error)
    res.status(500).json({
      error: 'Failed to update gateway',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * DELETE /gateway/:id
 * Remove a gateway
 */
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  try {
    const gatewayId = req.params.id as string

    const gateway = gatewayService.getGateway(gatewayId)
    if (!gateway) {
      res.status(404).json({ error: 'Gateway not found' })
      return
    }

    await gatewayService.removeGateway(gatewayId)

    res.json({
      success: true,
      gatewayId,
    })
  } catch (error) {
    console.error('[Gateway] Remove error:', error)
    res.status(500).json({
      error: 'Failed to remove gateway',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// =============================================================================
// Quick Gateway Creation
// =============================================================================

const srtToNdiSchema = z.object({
  name: z.string(),
  srt: z.object({
    host: z.string(),
    port: z.number(),
    mode: z.enum(['listener', 'caller']),
    streamId: z.string().optional(),
    passphrase: z.string().optional(),
    latency: z.number().optional(),
  }),
  ndi: z.object({
    sourceName: z.string(),
    groups: z.array(z.string()).optional(),
  }),
})

/**
 * POST /gateway/srt-to-ndi
 * Quick create SRT to NDI gateway
 */
router.post('/srt-to-ndi', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, srt, ndi } = srtToNdiSchema.parse(req.body)

    const gateway = await gatewayService.createSrtToNdi(name, srt, ndi)

    res.status(201).json({
      success: true,
      gateway,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Gateway] Create SRT to NDI error:', error)
    res.status(500).json({
      error: 'Failed to create gateway',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

const srtFanoutSchema = z.object({
  name: z.string(),
  input: z.object({
    host: z.string(),
    port: z.number(),
    mode: z.enum(['listener', 'caller']),
    streamId: z.string().optional(),
    passphrase: z.string().optional(),
  }),
  outputs: z.array(z.object({
    host: z.string(),
    port: z.number(),
    streamId: z.string().optional(),
    passphrase: z.string().optional(),
  })),
})

/**
 * POST /gateway/srt-fanout
 * Quick create SRT fanout (one to many)
 */
router.post('/srt-fanout', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, input, outputs } = srtFanoutSchema.parse(req.body)

    const gateway = await gatewayService.createSrtFanout(name, input, outputs)

    res.status(201).json({
      success: true,
      gateway,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Gateway] Create SRT fanout error:', error)
    res.status(500).json({
      error: 'Failed to create gateway',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

const srtRelaySchema = z.object({
  name: z.string(),
  listenerPort: z.number(),
  outputHost: z.string(),
  outputPort: z.number(),
  options: z.object({
    streamId: z.string().optional(),
    passphrase: z.string().optional(),
    latency: z.number().optional(),
  }).optional(),
})

/**
 * POST /gateway/srt-relay
 * Quick create SRT relay (firewall traversal)
 */
router.post('/srt-relay', authenticate, async (req: Request, res: Response) => {
  try {
    const { name, listenerPort, outputHost, outputPort, options } = srtRelaySchema.parse(req.body)

    const gateway = await gatewayService.createSrtRelay(
      name,
      listenerPort,
      outputHost,
      outputPort,
      options
    )

    res.status(201).json({
      success: true,
      gateway,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Gateway] Create SRT relay error:', error)
    res.status(500).json({
      error: 'Failed to create gateway',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
