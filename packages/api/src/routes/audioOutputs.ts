import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { audioOutputService } from '../services/audioOutput.service.js'
import { busEncoderService } from '../services/busEncoder.service.js'
import { mediasoupService } from '../services/mediasoup.service.js'
import { authenticate, requireOrgRole } from '../middleware/auth.js'
import { AudioOutputType, AudioChannel, OrgMemberRole } from '@streamvu/shared'
import type { ApiResponse, AudioOutput, BusRoutingConfig } from '@streamvu/shared'

const router: RouterType = Router()

const createOutputSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.nativeEnum(AudioOutputType),
  channel: z.nativeEnum(AudioChannel),
  icecastHost: z.string().optional(),
  icecastPort: z.number().min(1).max(65535).optional(),
  icecastMount: z.string().optional(),
  icecastUsername: z.string().optional(),
  icecastPassword: z.string().optional(),
  icecastPublic: z.boolean().optional(),
  icecastName: z.string().max(100).optional(),
  icecastDescription: z.string().max(500).optional(),
  icecastGenre: z.string().max(100).optional(),
  icecastUrl: z.string().url().optional(),
  codec: z.enum(['mp3', 'opus', 'aac']).optional(),
  bitrate: z.number().min(32).max(320).optional(),
  sampleRate: z.number().refine(val => [22050, 44100, 48000].includes(val), {
    message: 'Sample rate must be 22050, 44100, or 48000'
  }).optional(),
  channels: z.number().min(1).max(2).optional(),
})

const updateOutputSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  channel: z.nativeEnum(AudioChannel).optional(),
  icecastHost: z.string().optional(),
  icecastPort: z.number().min(1).max(65535).optional(),
  icecastMount: z.string().optional(),
  icecastUsername: z.string().optional(),
  icecastPassword: z.string().optional(),
  icecastPublic: z.boolean().optional(),
  icecastName: z.string().max(100).optional(),
  icecastDescription: z.string().max(500).optional(),
  icecastGenre: z.string().max(100).optional(),
  icecastUrl: z.string().url().optional(),
  codec: z.enum(['mp3', 'opus', 'aac']).optional(),
  bitrate: z.number().min(32).max(320).optional(),
  sampleRate: z.number().optional(),
  channels: z.number().min(1).max(2).optional(),
  isEnabled: z.boolean().optional(),
})

// Schema for bus routing configuration
const busRoutingSchema = z.object({
  pgm: z.number().min(0).max(1).optional(),
  tb: z.number().min(0).max(1).optional(),
  aux1: z.number().min(0).max(1).optional(),
  aux2: z.number().min(0).max(1).optional(),
  aux3: z.number().min(0).max(1).optional(),
  aux4: z.number().min(0).max(1).optional(),
})

// List all audio outputs for a room
router.get('/:roomId/outputs', authenticate, async (req, res, next) => {
  try {
    const outputs = await audioOutputService.listOutputs(
      req.params.roomId as string,
      req.user!.organizationId
    )

    const response: ApiResponse<AudioOutput[]> = {
      success: true,
      data: outputs,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get a single audio output
router.get('/:roomId/outputs/:outputId', authenticate, async (req, res, next) => {
  try {
    const output = await audioOutputService.getOutput(
      req.params.outputId as string,
      req.params.roomId as string,
      req.user!.organizationId
    )

    const response: ApiResponse<AudioOutput> = {
      success: true,
      data: output,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Create a new audio output (requires ADMIN or OWNER)
router.post(
  '/:roomId/outputs',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const data = createOutputSchema.parse(req.body)
      const output = await audioOutputService.createOutput(
        req.params.roomId as string,
        req.user!.organizationId,
        data
      )

      const response: ApiResponse<AudioOutput> = {
        success: true,
        data: output,
      }
      res.status(201).json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Update an audio output
router.put(
  '/:roomId/outputs/:outputId',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const data = updateOutputSchema.parse(req.body)
      const output = await audioOutputService.updateOutput(
        req.params.outputId as string,
        req.params.roomId as string,
        req.user!.organizationId,
        data
      )

      const response: ApiResponse<AudioOutput> = {
        success: true,
        data: output,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Delete an audio output (requires ADMIN or OWNER)
router.delete(
  '/:roomId/outputs/:outputId',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      await audioOutputService.deleteOutput(
        req.params.outputId as string,
        req.params.roomId as string,
        req.user!.organizationId
      )

      const response: ApiResponse = {
        success: true,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Update bus routing for an output (basic update, no live encoder restart)
router.put(
  '/:roomId/outputs/:outputId/routing',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const busRouting = busRoutingSchema.parse(req.body)
      const roomId = req.params.roomId as string
      const outputId = req.params.outputId as string

      const output = await audioOutputService.updateBusRouting(
        outputId,
        roomId,
        req.user!.organizationId,
        busRouting
      )

      const response: ApiResponse<AudioOutput> = {
        success: true,
        data: output,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Real-time bus level update (with live encoder restart)
// This endpoint broadcasts the change immediately via WebSocket for visual feedback,
// then debounces encoder restart to apply new levels to running streams.
router.put(
  '/:roomId/outputs/:outputId/levels',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const busRouting = busRoutingSchema.parse(req.body)
      const roomId = req.params.roomId as string
      const outputId = req.params.outputId as string

      // Verify output exists and belongs to this room/org
      await audioOutputService.getOutput(
        outputId,
        roomId,
        req.user!.organizationId
      )

      // Update levels with real-time feedback and debounced encoder restart
      const result = await busEncoderService.updateBusLevels(
        outputId,
        roomId,
        busRouting,
        req.user!.sub
      )

      const response: ApiResponse<{
        success: boolean
        willRestart: boolean
        message: string
      }> = {
        success: true,
        data: {
          success: result.success,
          willRestart: result.willRestart,
          message: result.willRestart
            ? 'Levels updated. Encoder will restart in 500ms.'
            : 'Levels updated (encoder not running).',
        },
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Schema for starting output with bus producer (optional - will auto-discover if not provided)
const startOutputSchema = z.object({
  producerId: z.string().optional(),
})

// Start streaming to output
router.post(
  '/:roomId/outputs/:outputId/start',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const { producerId: providedProducerId } = startOutputSchema.parse(req.body || {})
      const roomId = req.params.roomId as string
      const outputId = req.params.outputId as string

      // Verify output exists and belongs to this room/org
      const output = await audioOutputService.getOutput(
        outputId,
        roomId,
        req.user!.organizationId
      )

      // Check if already running
      if (busEncoderService.isEncoderRunning(outputId)) {
        return res.status(400).json({
          success: false,
          error: 'Output is already streaming',
        })
      }

      // Determine which buses to use
      const busRouting = output.busRouting as BusRoutingConfig | null
      const activeBuses = busRouting
        ? Object.entries(busRouting)
            .filter(([_, level]) => level && level > 0)
            .map(([bus]) => bus.toUpperCase())
        : []

      // If multi-bus routing configured, use startMultiBusEncoder
      if (activeBuses.length > 1) {
        // Build bus producers map
        const busProducers = new Map<string, string>()
        for (const busType of activeBuses) {
          const busProducer = mediasoupService.getBusProducer(roomId, busType)
          if (busProducer) {
            busProducers.set(busType, busProducer.producerId)
          }
        }

        if (busProducers.size === 0) {
          return res.status(400).json({
            success: false,
            error: 'No bus producers found. Make sure a host is connected and has created bus outputs.',
          })
        }

        await busEncoderService.startMultiBusEncoder(outputId, roomId, busProducers)
      } else {
        // Single bus mode - find the producer
        let producerId = providedProducerId

        if (!producerId) {
          // Auto-discover from bus routing or channel field
          let busType = 'PGM'
          if (activeBuses.length === 1) {
            busType = activeBuses[0] as string
          } else {
            // Fall back to channel field
            const channelToBus: Record<string, string> = {
              'PROGRAM': 'PGM',
              'TALKBACK': 'TB',
              'AUX1': 'AUX1',
              'AUX2': 'AUX2',
              'AUX3': 'AUX3',
              'AUX4': 'AUX4',
            }
            busType = channelToBus[output.channel] || 'PGM'
          }

          const busProducer = mediasoupService.getBusProducer(roomId, busType)
          if (busProducer) {
            producerId = busProducer.producerId
          }
        }

        if (!producerId) {
          return res.status(400).json({
            success: false,
            error: 'No bus producer found. Make sure a host is connected and has created bus outputs.',
          })
        }

        await busEncoderService.startEncoder(outputId, roomId, producerId)
      }

      // Get updated output status
      const updatedOutput = await audioOutputService.getOutput(
        outputId,
        roomId,
        req.user!.organizationId
      )

      const response: ApiResponse<AudioOutput> = {
        success: true,
        data: updatedOutput,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Stop streaming to output
router.post(
  '/:roomId/outputs/:outputId/stop',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const roomId = req.params.roomId as string
      const outputId = req.params.outputId as string

      // Verify output exists and belongs to this room/org
      await audioOutputService.getOutput(
        outputId,
        roomId,
        req.user!.organizationId
      )

      // Stop the encoder
      await busEncoderService.stopEncoder(outputId)

      // Get updated output status
      const updatedOutput = await audioOutputService.getOutput(
        outputId,
        roomId,
        req.user!.organizationId
      )

      const response: ApiResponse<AudioOutput> = {
        success: true,
        data: updatedOutput,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Get output streaming stats
router.get(
  '/:roomId/outputs/:outputId/stats',
  authenticate,
  async (req, res, next) => {
    try {
      const output = await audioOutputService.getOutput(
        req.params.outputId as string,
        req.params.roomId as string,
        req.user!.organizationId
      )

      // Get real-time stats from encoder
      const encoderStats = busEncoderService.getEncoderStats(req.params.outputId as string)
      const stats = {
        bytesStreamed: output.bytesStreamed,
        isConnected: output.isConnected,
        connectedAt: output.connectedAt,
        uptime: output.connectedAt
          ? Math.floor((Date.now() - new Date(output.connectedAt).getTime()) / 1000)
          : 0,
        // Real-time encoder stats
        encoder: {
          isRunning: encoderStats.isRunning,
          uptimeSeconds: encoderStats.uptimeSeconds,
          startedAt: encoderStats.startedAt,
          busRouting: encoderStats.busRouting,
          retryCount: encoderStats.retryCount,
        },
      }

      const response: ApiResponse<typeof stats> = {
        success: true,
        data: stats,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

export default router
