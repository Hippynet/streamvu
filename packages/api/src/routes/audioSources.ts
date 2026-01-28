import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { audioSourceService } from '../services/audioSource.service.js'
import { srtIngestService } from '../services/srtIngest.service.js'
import { ristIngestService } from '../services/ristIngest.service.js'
import { authenticate, requireOrgRole } from '../middleware/auth.js'
import { AudioSourceType, AudioChannel, OrgMemberRole, PlaybackState, SRTMode, RISTMode, RISTProfile } from '@streamvu/shared'
import type { ApiResponse, AudioSource } from '@streamvu/shared'

const router: RouterType = Router()

const createSourceSchema = z.object({
  type: z.nativeEnum(AudioSourceType),
  name: z.string().min(1).max(100),
  streamUrl: z.string().url().optional(),
  streamFormat: z.string().optional(),
  fileId: z.string().optional(),
  channel: z.nativeEnum(AudioChannel).optional(),
  volume: z.number().min(0).max(2).optional(),
  pan: z.number().min(-1).max(1).optional(),
  // SRT fields
  srtMode: z.nativeEnum(SRTMode).optional(),
  srtHost: z.string().optional(),
  srtPort: z.number().int().min(1).max(65535).optional(),
  srtStreamId: z.string().max(512).optional(),
  srtPassphrase: z.string().min(10).max(79).optional(),
  srtLatency: z.number().int().min(20).max(8000).optional(),
  // RIST fields
  ristMode: z.nativeEnum(RISTMode).optional(),
  ristUrl: z.string().optional(),
  ristProfile: z.nativeEnum(RISTProfile).optional(),
  ristBuffer: z.number().int().min(100).max(10000).optional(),
  ristBandwidth: z.number().int().min(100).optional(),
})

const updateSourceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  channel: z.nativeEnum(AudioChannel).optional(),
  volume: z.number().min(0).max(2).optional(),
  pan: z.number().min(-1).max(1).optional(),
  muted: z.boolean().optional(),
  loopEnabled: z.boolean().optional(),
})

// List all audio sources for a room
router.get('/:roomId/sources', authenticate, async (req, res, next) => {
  try {
    const sources = await audioSourceService.listSources(
      req.params.roomId as string,
      req.user!.organizationId
    )

    const response: ApiResponse<AudioSource[]> = {
      success: true,
      data: sources,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Get a single audio source
router.get('/:roomId/sources/:sourceId', authenticate, async (req, res, next) => {
  try {
    const source = await audioSourceService.getSource(
      req.params.sourceId as string,
      req.params.roomId as string,
      req.user!.organizationId
    )

    const response: ApiResponse<AudioSource> = {
      success: true,
      data: source,
    }
    res.json(response)
  } catch (error) {
    next(error)
  }
})

// Create a new audio source (requires ADMIN or OWNER)
router.post(
  '/:roomId/sources',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      const data = createSourceSchema.parse(req.body)
      const source = await audioSourceService.createSource(
        req.params.roomId as string,
        req.user!.organizationId,
        data
      )

      const response: ApiResponse<AudioSource> = {
        success: true,
        data: source,
      }
      res.status(201).json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Update an audio source
router.put(
  '/:roomId/sources/:sourceId',
  authenticate,
  async (req, res, next) => {
    try {
      const data = updateSourceSchema.parse(req.body)
      const source = await audioSourceService.updateSource(
        req.params.sourceId as string,
        req.params.roomId as string,
        req.user!.organizationId,
        data
      )

      const response: ApiResponse<AudioSource> = {
        success: true,
        data: source,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Delete an audio source (requires ADMIN or OWNER)
router.delete(
  '/:roomId/sources/:sourceId',
  authenticate,
  requireOrgRole(OrgMemberRole.ADMIN, OrgMemberRole.OWNER),
  async (req, res, next) => {
    try {
      await audioSourceService.deleteSource(
        req.params.sourceId as string,
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

// Start an audio source (HTTP stream, file playback, or SRT ingest)
router.post(
  '/:roomId/sources/:sourceId/start',
  authenticate,
  async (req, res, next) => {
    try {
      const sourceId = req.params.sourceId as string
      const roomId = req.params.roomId as string

      // Get the source to check its type
      const existingSource = await audioSourceService.getSource(
        sourceId,
        roomId,
        req.user!.organizationId
      )

      // Handle SRT source
      if (existingSource.type === AudioSourceType.SRT_STREAM) {
        await srtIngestService.startIngest(sourceId)

        // Get updated source state
        const source = await audioSourceService.getSource(
          sourceId,
          roomId,
          req.user!.organizationId
        )

        const response: ApiResponse<AudioSource> = {
          success: true,
          data: source,
        }
        return res.json(response)
      }

      // Handle RIST source
      if (existingSource.type === AudioSourceType.RIST_STREAM) {
        await ristIngestService.startIngest(sourceId)

        // Get updated source state
        const source = await audioSourceService.getSource(
          sourceId,
          roomId,
          req.user!.organizationId
        )

        const response: ApiResponse<AudioSource> = {
          success: true,
          data: source,
        }
        return res.json(response)
      }

      // TODO: Implement actual start logic via AudioIngestService or FilePlaybackService for other types
      const source = await audioSourceService.updateSourceState(
        sourceId,
        {
          isActive: true,
          playbackState: PlaybackState.LOADING,
        }
      )

      const response: ApiResponse<AudioSource> = {
        success: true,
        data: source,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Stop an audio source
router.post(
  '/:roomId/sources/:sourceId/stop',
  authenticate,
  async (req, res, next) => {
    try {
      const sourceId = req.params.sourceId as string
      const roomId = req.params.roomId as string

      // Get the source to check its type
      const existingSource = await audioSourceService.getSource(
        sourceId,
        roomId,
        req.user!.organizationId
      )

      // Handle SRT source
      if (existingSource.type === AudioSourceType.SRT_STREAM) {
        await srtIngestService.stopIngest(sourceId)

        // Get updated source state
        const source = await audioSourceService.getSource(
          sourceId,
          roomId,
          req.user!.organizationId
        )

        const response: ApiResponse<AudioSource> = {
          success: true,
          data: source,
        }
        return res.json(response)
      }

      // Handle RIST source
      if (existingSource.type === AudioSourceType.RIST_STREAM) {
        await ristIngestService.stopIngest(sourceId)

        // Get updated source state
        const source = await audioSourceService.getSource(
          sourceId,
          roomId,
          req.user!.organizationId
        )

        const response: ApiResponse<AudioSource> = {
          success: true,
          data: source,
        }
        return res.json(response)
      }

      // TODO: Implement actual stop logic via AudioIngestService or FilePlaybackService for other types
      const source = await audioSourceService.updateSourceState(
        sourceId,
        {
          isActive: false,
          playbackState: PlaybackState.STOPPED,
          playbackPosition: 0,
        }
      )

      const response: ApiResponse<AudioSource> = {
        success: true,
        data: source,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Play (for file sources - same as start but semantic)
router.post(
  '/:roomId/sources/:sourceId/play',
  authenticate,
  async (req, res, next) => {
    try {
      const source = await audioSourceService.updateSourceState(
        req.params.sourceId as string,
        {
          playbackState: PlaybackState.PLAYING,
          isActive: true,
        }
      )

      const response: ApiResponse<AudioSource> = {
        success: true,
        data: source,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Pause (for file sources)
router.post(
  '/:roomId/sources/:sourceId/pause',
  authenticate,
  async (req, res, next) => {
    try {
      const source = await audioSourceService.updateSourceState(
        req.params.sourceId as string,
        {
          playbackState: PlaybackState.PAUSED,
        }
      )

      const response: ApiResponse<AudioSource> = {
        success: true,
        data: source,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Seek (for file sources)
router.post(
  '/:roomId/sources/:sourceId/seek',
  authenticate,
  async (req, res, next) => {
    try {
      const { position } = z.object({ position: z.number().min(0) }).parse(req.body)

      const source = await audioSourceService.updateSourceState(
        req.params.sourceId as string,
        {
          playbackPosition: position,
        }
      )

      const response: ApiResponse<AudioSource> = {
        success: true,
        data: source,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Get SRT connection info (for displaying connection URL in UI)
router.get(
  '/:roomId/sources/:sourceId/srt-info',
  authenticate,
  async (req, res, next) => {
    try {
      const sourceId = req.params.sourceId as string
      const roomId = req.params.roomId as string

      // Verify access
      await audioSourceService.getSource(
        sourceId,
        roomId,
        req.user!.organizationId
      )

      const info = await srtIngestService.getConnectionInfo(sourceId)

      if (!info) {
        return res.status(404).json({
          success: false,
          error: 'Source not found or not an SRT source',
        })
      }

      const response: ApiResponse<typeof info> = {
        success: true,
        data: info,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

// Get RIST connection info (for displaying connection URL in UI)
router.get(
  '/:roomId/sources/:sourceId/rist-info',
  authenticate,
  async (req, res, next) => {
    try {
      const sourceId = req.params.sourceId as string
      const roomId = req.params.roomId as string

      // Verify access
      await audioSourceService.getSource(
        sourceId,
        roomId,
        req.user!.organizationId
      )

      const info = await ristIngestService.getConnectionInfo(sourceId)

      if (!info) {
        return res.status(404).json({
          success: false,
          error: 'Source not found or not a RIST source',
        })
      }

      const response: ApiResponse<typeof info> = {
        success: true,
        data: info,
      }
      res.json(response)
    } catch (error) {
      next(error)
    }
  }
)

export default router
