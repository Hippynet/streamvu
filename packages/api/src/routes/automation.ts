/**
 * Automation Routes
 *
 * REST API for external system integration including:
 * - Cue control
 * - Routing control
 * - Recording control
 * - Audio level monitoring
 * - Webhook management
 */

import { Router, type Router as RouterType, type Request, type Response } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { webhookService, type WebhookEventType } from '../services/webhook.service.js'
import { prisma } from '../lib/prisma.js'

const router: RouterType = Router()

// Cue types matching Prisma enum
const CueTypeEnum = z.enum(['OFF', 'RED', 'YELLOW', 'GREEN', 'CUSTOM'])

// Validation schemas
const sendCueSchema = z.object({
  cueType: CueTypeEnum,
  cueText: z.string().optional(),
})

const routingSchema = z.object({
  sourceId: z.string().uuid(),
  busId: z.string(),
  enabled: z.boolean(),
})

const batchRoutingSchema = z.object({
  changes: z.array(routingSchema),
})

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(
    z.enum([
      'room.participant.joined',
      'room.participant.left',
      'room.cue.changed',
      'room.routing.changed',
      'room.recording.started',
      'room.recording.stopped',
      'room.tally.changed',
      'audio.levels',
      'audio.peak.alert',
    ])
  ),
  secret: z.string().min(16).optional(),
  roomId: z.string().uuid().optional(),
})

const updateWebhookSchema = webhookSchema.partial()

// ============================================================================
// CUE CONTROL
// ============================================================================

/**
 * POST /automation/rooms/:roomId/participants/:participantId/cue
 * Send a cue to a participant
 */
router.post(
  '/rooms/:roomId/participants/:participantId/cue',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const roomId = req.params.roomId as string
      const participantId = req.params.participantId as string
      const { cueType, cueText } = sendCueSchema.parse(req.body)

      // Verify room exists and user has access
      const room = await prisma.callRoom.findFirst({
        where: {
          id: roomId,
          organizationId: req.user!.organizationId,
        },
      })

      if (!room) {
        res.status(404).json({ error: 'Room not found' })
        return
      }

      // Create or update cue for participant
      const cue = await prisma.roomCue.upsert({
        where: {
          id: `${roomId}-${participantId}`, // Composite key workaround
        },
        create: {
          roomId: roomId,
          cueType: cueType as 'OFF' | 'RED' | 'YELLOW' | 'GREEN' | 'CUSTOM',
          cueText: cueText,
          targetParticipantId: participantId,
        },
        update: {
          cueType: cueType as 'OFF' | 'RED' | 'YELLOW' | 'GREEN' | 'CUSTOM',
          cueText: cueText,
          sentAt: new Date(),
        },
      })

      // Trigger webhook
      webhookService.triggerCueChanged(roomId, participantId, cueType)

      res.json({
        success: true,
        cue: {
          id: cue.id,
          cueType: cue.cueType,
          cueText: cue.cueText,
          targetParticipantId: cue.targetParticipantId,
        },
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: error.errors })
        return
      }
      console.error('[Automation] Cue error:', error)
      res.status(500).json({
        error: 'Failed to send cue',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
)

/**
 * POST /automation/rooms/:roomId/cue/all
 * Send a cue to all participants in a room
 */
router.post('/rooms/:roomId/cue/all', authenticate, async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId as string
    const { cueType, cueText } = sendCueSchema.parse(req.body)

    // Verify room exists
    const room = await prisma.callRoom.findFirst({
      where: {
        id: roomId,
        organizationId: req.user!.organizationId,
      },
    })

    if (!room) {
      res.status(404).json({ error: 'Room not found' })
      return
    }

    // Create a room-wide cue (targetParticipantId = null means all)
    const cue = await prisma.roomCue.create({
      data: {
        roomId: roomId,
        cueType: cueType as 'OFF' | 'RED' | 'YELLOW' | 'GREEN' | 'CUSTOM',
        cueText: cueText,
        targetParticipantId: null, // All participants
      },
    })

    res.json({
      success: true,
      cue: {
        id: cue.id,
        cueType: cue.cueType,
        cueText: cue.cueText,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Automation] Cue all error:', error)
    res.status(500).json({
      error: 'Failed to send cue to all',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// ============================================================================
// ROUTING CONTROL
// ============================================================================

/**
 * POST /automation/rooms/:roomId/routing
 * Change routing configuration
 */
router.post('/rooms/:roomId/routing', authenticate, async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId as string
    const { sourceId, busId, enabled } = routingSchema.parse(req.body)

    // Verify room exists
    const room = await prisma.callRoom.findFirst({
      where: {
        id: roomId,
        organizationId: req.user!.organizationId,
      },
    })

    if (!room) {
      res.status(404).json({ error: 'Room not found' })
      return
    }

    // Update routing in the source
    // This is a simplified implementation - actual routing would involve
    // updating the audio engine state
    await prisma.audioSource.update({
      where: {
        id: sourceId,
        roomId: roomId,
      },
      data: {
        // Store routing in a JSON field or separate routing table
        // For now, we'll just acknowledge the request
        updatedAt: new Date(),
      },
    })

    // Trigger webhook
    webhookService.triggerRoutingChanged(roomId, sourceId, busId, enabled)

    res.json({
      success: true,
      routing: { sourceId, busId, enabled },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Automation] Routing error:', error)
    res.status(500).json({
      error: 'Failed to change routing',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /automation/rooms/:roomId/routing/batch
 * Change multiple routing configurations at once
 */
router.post('/rooms/:roomId/routing/batch', authenticate, async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId as string
    const { changes } = batchRoutingSchema.parse(req.body)

    // Verify room exists
    const room = await prisma.callRoom.findFirst({
      where: {
        id: roomId,
        organizationId: req.user!.organizationId,
      },
    })

    if (!room) {
      res.status(404).json({ error: 'Room not found' })
      return
    }

    // Process each routing change
    const results = []
    for (const change of changes) {
      try {
        // Update routing
        webhookService.triggerRoutingChanged(roomId, change.sourceId, change.busId, change.enabled)
        results.push({ ...change, success: true })
      } catch (error) {
        results.push({
          ...change,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      results,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Automation] Batch routing error:', error)
    res.status(500).json({
      error: 'Failed to change routing',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// ============================================================================
// RECORDING CONTROL
// ============================================================================

/**
 * POST /automation/rooms/:roomId/recording/start
 * Start recording for a room
 */
router.post('/rooms/:roomId/recording/start', authenticate, async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId as string

    // Verify room exists
    const room = await prisma.callRoom.findFirst({
      where: {
        id: roomId,
        organizationId: req.user!.organizationId,
      },
    })

    if (!room) {
      res.status(404).json({ error: 'Room not found' })
      return
    }

    // Create recording record
    const recording = await prisma.recording.create({
      data: {
        roomId: roomId,
        type: 'MIX',
        format: 'wav',
        status: 'RECORDING',
        startedAt: new Date(),
      },
    })

    // Trigger webhook
    webhookService.triggerRecordingStarted(roomId, recording.id)

    res.json({
      success: true,
      recording: {
        id: recording.id,
        status: recording.status,
        startedAt: recording.startedAt,
      },
    })
  } catch (error) {
    console.error('[Automation] Start recording error:', error)
    res.status(500).json({
      error: 'Failed to start recording',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /automation/rooms/:roomId/recording/stop
 * Stop recording for a room
 */
router.post('/rooms/:roomId/recording/stop', authenticate, async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId as string

    // Find active recording
    const recording = await prisma.recording.findFirst({
      where: {
        roomId: roomId,
        status: 'RECORDING',
      },
      orderBy: {
        startedAt: 'desc',
      },
    })

    if (!recording) {
      res.status(404).json({ error: 'No active recording found' })
      return
    }

    // Update recording
    const endedAt = new Date()
    const durationMs = endedAt.getTime() - recording.startedAt.getTime()

    const updated = await prisma.recording.update({
      where: { id: recording.id },
      data: {
        status: 'COMPLETED',
        endedAt: endedAt,
        durationMs: durationMs,
      },
    })

    // Trigger webhook
    webhookService.triggerRecordingStopped(roomId, recording.id, Math.floor(durationMs / 1000))

    res.json({
      success: true,
      recording: {
        id: updated.id,
        status: updated.status,
        startedAt: updated.startedAt,
        endedAt: updated.endedAt,
        durationMs: updated.durationMs,
      },
    })
  } catch (error) {
    console.error('[Automation] Stop recording error:', error)
    res.status(500).json({
      error: 'Failed to stop recording',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// ============================================================================
// AUDIO LEVELS
// ============================================================================

/**
 * GET /automation/rooms/:roomId/levels
 * Get current audio levels for all sources in a room
 */
router.get('/rooms/:roomId/levels', authenticate, async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId as string

    // Verify room exists
    const room = await prisma.callRoom.findFirst({
      where: {
        id: roomId,
        organizationId: req.user!.organizationId,
      },
    })

    if (!room) {
      res.status(404).json({ error: 'Room not found' })
      return
    }

    // Get all sources
    const sources = await prisma.audioSource.findMany({
      where: { roomId: roomId },
      select: {
        id: true,
        name: true,
        type: true,
        muted: true,
        volume: true,
      },
    })

    // In a real implementation, we would get actual live levels
    // from the audio engine. For now, return placeholder data.
    const levels = sources.map((source) => ({
      sourceId: source.id,
      name: source.name,
      type: source.type,
      muted: source.muted,
      volume: source.volume,
      peakL: -Infinity, // Would come from audio engine
      peakR: -Infinity,
      rmsL: -Infinity,
      rmsR: -Infinity,
      clipping: false,
    }))

    res.json({
      timestamp: new Date().toISOString(),
      levels,
    })
  } catch (error) {
    console.error('[Automation] Get levels error:', error)
    res.status(500).json({
      error: 'Failed to get levels',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

// ============================================================================
// TALLY
// ============================================================================

/**
 * GET /automation/rooms/:roomId/tally
 * Get current tally state for all participants
 */
router.get('/rooms/:roomId/tally', authenticate, async (req: Request, res: Response) => {
  try {
    const roomId = req.params.roomId as string

    // Verify room exists
    const room = await prisma.callRoom.findFirst({
      where: {
        id: roomId,
        organizationId: req.user!.organizationId,
      },
    })

    if (!room) {
      res.status(404).json({ error: 'Room not found' })
      return
    }

    // Get participants and their cue states
    const participants = await prisma.roomParticipant.findMany({
      where: { roomId: roomId },
      select: {
        id: true,
        displayName: true,
        isConnected: true,
        isSpeaking: true,
        isMuted: true,
      },
    })

    // Get cue states for participants
    const cues = await prisma.roomCue.findMany({
      where: { roomId: roomId },
      orderBy: { sentAt: 'desc' },
    })

    // Map cues to participants
    const cueMap = new Map<string, string>()
    for (const cue of cues) {
      if (cue.targetParticipantId && !cueMap.has(cue.targetParticipantId)) {
        cueMap.set(cue.targetParticipantId, cue.cueType)
      }
    }

    // Room-wide cue (null target)
    const roomWideCue = cues.find((c) => !c.targetParticipantId)

    res.json({
      timestamp: new Date().toISOString(),
      tally: participants.map((p) => ({
        participantId: p.id,
        name: p.displayName,
        isConnected: p.isConnected,
        isSpeaking: p.isSpeaking,
        isMuted: p.isMuted,
        cueType: cueMap.get(p.id) || roomWideCue?.cueType || 'OFF',
      })),
    })
  } catch (error) {
    console.error('[Automation] Get tally error:', error)
    res.status(500).json({
      error: 'Failed to get tally',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * PUT /automation/rooms/:roomId/tally/:participantId
 * Set tally state for a participant
 * Uses RoomCue with RED for on-air, OFF for off-air (standard broadcast tally colors)
 */
router.put(
  '/rooms/:roomId/tally/:participantId',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const roomId = req.params.roomId as string
      const participantId = req.params.participantId as string
      const { isOnAir } = z.object({ isOnAir: z.boolean() }).parse(req.body)

      // Verify participant exists
      const participant = await prisma.roomParticipant.findFirst({
        where: {
          id: participantId,
          roomId: roomId,
        },
      })

      if (!participant) {
        res.status(404).json({ error: 'Participant not found' })
        return
      }

      // Use RoomCue to track tally state (RED = on-air, OFF = off-air)
      // Find existing tally cue for this participant
      const existingCue = await prisma.roomCue.findFirst({
        where: {
          roomId: roomId,
          targetParticipantId: participantId,
        },
        orderBy: { sentAt: 'desc' },
      })

      const cueType = isOnAir ? 'RED' : 'OFF'

      if (existingCue) {
        // Update existing cue
        await prisma.roomCue.update({
          where: { id: existingCue.id },
          data: {
            cueType: cueType,
            cueText: isOnAir ? 'ON AIR' : null,
            sentAt: new Date(),
          },
        })
      } else {
        // Create new cue
        await prisma.roomCue.create({
          data: {
            roomId: roomId,
            targetParticipantId: participantId,
            cueType: cueType,
            cueText: isOnAir ? 'ON AIR' : null,
          },
        })
      }

      // Trigger webhook
      webhookService.triggerTallyChanged(roomId, participantId, isOnAir)

      res.json({
        success: true,
        participantId: participantId,
        isOnAir: isOnAir,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: error.errors })
        return
      }
      console.error('[Automation] Set tally error:', error)
      res.status(500).json({
        error: 'Failed to set tally',
        details: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
)

// ============================================================================
// WEBHOOKS
// ============================================================================

/**
 * GET /automation/webhooks
 * List all webhooks
 */
router.get('/webhooks', authenticate, async (req: Request, res: Response) => {
  try {
    const roomId = req.query.roomId as string | undefined
    const endpoints = webhookService.getEndpoints(roomId)

    res.json({
      webhooks: endpoints.map((e) => ({
        id: e.id,
        url: e.url,
        events: e.events,
        enabled: e.enabled,
        roomId: e.roomId,
        createdAt: e.createdAt,
        lastTriggered: e.lastTriggered,
        failureCount: e.failureCount,
      })),
    })
  } catch (error) {
    console.error('[Automation] List webhooks error:', error)
    res.status(500).json({
      error: 'Failed to list webhooks',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /automation/webhooks
 * Register a new webhook
 */
router.post('/webhooks', authenticate, async (req: Request, res: Response) => {
  try {
    const validated = webhookSchema.parse(req.body)

    const endpoint = webhookService.registerEndpoint(
      validated.url,
      validated.events as WebhookEventType[],
      {
        secret: validated.secret,
        roomId: validated.roomId,
      }
    )

    res.status(201).json({
      webhook: {
        id: endpoint.id,
        url: endpoint.url,
        events: endpoint.events,
        enabled: endpoint.enabled,
        roomId: endpoint.roomId,
        createdAt: endpoint.createdAt,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Automation] Register webhook error:', error)
    res.status(500).json({
      error: 'Failed to register webhook',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * PATCH /automation/webhooks/:webhookId
 * Update a webhook
 */
router.patch('/webhooks/:webhookId', authenticate, async (req: Request, res: Response) => {
  try {
    const webhookId = req.params.webhookId as string
    const validated = updateWebhookSchema.parse(req.body)

    const endpoint = webhookService.updateEndpoint(webhookId, {
      url: validated.url,
      events: validated.events as WebhookEventType[] | undefined,
      secret: validated.secret,
      enabled: 'enabled' in req.body ? req.body.enabled : undefined,
    })

    if (!endpoint) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }

    res.json({
      webhook: {
        id: endpoint.id,
        url: endpoint.url,
        events: endpoint.events,
        enabled: endpoint.enabled,
        roomId: endpoint.roomId,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors })
      return
    }
    console.error('[Automation] Update webhook error:', error)
    res.status(500).json({
      error: 'Failed to update webhook',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * DELETE /automation/webhooks/:webhookId
 * Remove a webhook
 */
router.delete('/webhooks/:webhookId', authenticate, async (req: Request, res: Response) => {
  try {
    const webhookId = req.params.webhookId as string

    const removed = webhookService.removeEndpoint(webhookId)
    if (!removed) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }

    res.json({ success: true })
  } catch (error) {
    console.error('[Automation] Delete webhook error:', error)
    res.status(500).json({
      error: 'Failed to delete webhook',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * POST /automation/webhooks/:webhookId/test
 * Send a test event to a webhook
 */
router.post('/webhooks/:webhookId/test', authenticate, async (req: Request, res: Response) => {
  try {
    const webhookId = req.params.webhookId as string

    const endpoint = webhookService.getEndpoint(webhookId)
    if (!endpoint) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }

    // Send test event
    webhookService.trigger('room.participant.joined', endpoint.roomId || 'test-room', {
      participantId: 'test-participant',
      name: 'Test Participant',
      test: true,
    })

    res.json({
      success: true,
      message: 'Test event queued for delivery',
    })
  } catch (error) {
    console.error('[Automation] Test webhook error:', error)
    res.status(500).json({
      error: 'Failed to test webhook',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export default router
